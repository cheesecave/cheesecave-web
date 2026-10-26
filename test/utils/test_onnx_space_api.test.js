import { beforeEach, describe, expect, it, vi } from "vitest";
import api, { onnxSpaceAPI, repoAPI } from "@/utils/api.js";
import * as lfs from "@/utils/lfs.js";

const context = { id: "alice/demo", revision: "main" };
const resource = "/spaces/alice/demo/resolve/main/models/model.onnx";

describe("ONNX repository transport", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("authenticates the same-origin resolve hop and permits S3 redirects", async () => {
    localStorage.setItem("hf_token", "local-token");
    localStorage.setItem(
      "hf_external_tokens",
      JSON.stringify([{ url: "https://other.test", token: "external-token" }]),
    );
    const response = new Response("model bytes");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    expect(await onnxSpaceAPI.readResource(resource)).toBe(response);
    expect(fetch).toHaveBeenCalledWith(
      resource + "?fallback=false",
      expect.objectContaining({
        credentials: "same-origin",
        mode: "cors",
        redirect: "follow",
        headers: { Authorization: "Bearer local-token" },
      }),
    );
  });

  it("rejects external, non-Space and traversal URLs before sending credentials", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    for (const url of [
      "https://other.test/model.onnx",
      "//other.test/model.onnx",
      "/models/model.onnx",
      "/spaces/alice/demo/resolve/main/%2e%2e/model.onnx",
      resource + "?token=bad",
    ])
      await expect(onnxSpaceAPI.readResource(url)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("decodes refusals and propagates an aborted request", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response('{"detail":"Forbidden"}', { status: 403 }),
      );
    await expect(onnxSpaceAPI.readResource(resource)).rejects.toMatchObject({
      status: 403,
      kind: "forbidden",
    });
    const controller = new AbortController();
    fetch.mockImplementation(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Cancelled", "AbortError")),
            { once: true },
          );
        }),
    );
    const pending = onnxSpaceAPI.readResource(resource, {
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ kind: "cancelled" });
  });

  it("lists every file using only the pagination cursor, never the advertised origin", async () => {
    const get = vi
      .spyOn(api, "get")
      .mockResolvedValueOnce({
        data: [
          { type: "directory", path: "models" },
          { type: "file", path: "models/a.onnx", size: 4 },
        ],
        headers: {
          link: '<https://backend.test/api/spaces/alice/demo/tree/main/?cursor=page2>; rel="next"',
        },
      })
      .mockResolvedValueOnce({
        data: [{ type: "file", path: "samples/hello world.jpg" }],
        headers: {},
      });
    const files = await onnxSpaceAPI.listFiles(context);
    expect(files.map((file) => file.url)).toEqual([
      "/spaces/alice/demo/resolve/main/models/a.onnx",
      "/spaces/alice/demo/resolve/main/samples/hello%20world.jpg",
    ]);
    expect(get.mock.calls.map((call) => call[0])).toEqual([
      "/api/spaces/alice/demo/tree/main/",
      "/api/spaces/alice/demo/tree/main/",
    ]);
    expect(get.mock.calls[1][1].params).toMatchObject({
      cursor: "page2",
      fallback: false,
    });
    get.mockResolvedValue({
      data: [],
      headers: {
        link: '</api/spaces/bob/other/tree/main/?cursor=bad>; rel="next"',
      },
    });
    await expect(onnxSpaceAPI.listFiles(context)).rejects.toThrow("分页");
  });

  it("carries parentCommit in the actual NDJSON header", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: {} });
    await repoAPI.commitFiles("space", "alice", "demo", "main", {
      message: "Toggle",
      parentCommit: "a".repeat(40),
      files: [
        { path: ".cheesecave/onnx-space.json", content: '{"enabled":true}' },
      ],
    });
    const lines = post.mock.calls[0][1].split("\n").map(JSON.parse);
    expect(lines[0].value.parentCommit).toBe("a".repeat(40));
    expect(lines[1].value.path).toBe(".cheesecave/onnx-space.json");
  });

  it("uploads Space resources through the Space LFS namespace and commits the granted oid", async () => {
    vi.spyOn(lfs, "calculateSHA256").mockResolvedValue("a".repeat(64));
    const upload = vi
      .spyOn(lfs, "uploadLFSFile")
      .mockResolvedValue({ oid: "a".repeat(64), size: 4 });
    const post = vi
      .spyOn(api, "post")
      .mockResolvedValueOnce({
        data: {
          files: [
            { path: "model.onnx", uploadMode: "lfs", shouldIgnore: false },
          ],
        },
      })
      .mockResolvedValueOnce({ data: { commitOid: "b".repeat(40) } });
    await repoAPI.uploadFiles("space", "alice", "demo", "main", {
      message: "Model",
      files: [{ path: "model.onnx", file: new File(["data"], "model.onnx") }],
    });
    expect(upload).toHaveBeenCalledWith(
      "alice/demo",
      expect.any(File),
      "a".repeat(64),
      expect.any(Function),
      "space",
    );
    const operation = JSON.parse(post.mock.calls[1][1].split("\n")[1]);
    expect(operation).toEqual({
      key: "lfsFile",
      value: {
        path: "model.onnx",
        oid: "a".repeat(64),
        size: 4,
        algo: "sha256",
      },
    });
  });

  it.each(["space", "dataset"])(
    "uses the typed batch endpoint for %s uploads",
    async (type) => {
      const post = vi.spyOn(api, "post").mockResolvedValue({
        data: { objects: [{ oid: "a".repeat(64), size: 4 }] },
      });
      await lfs.uploadLFSFile(
        "alice/demo",
        new File(["data"], "model.onnx"),
        "a".repeat(64),
        undefined,
        type,
      );
      expect(post.mock.calls[0][0]).toBe(
        `/${type}s/alice/demo.git/info/lfs/objects/batch`,
      );
    },
  );
});
