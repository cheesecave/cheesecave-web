import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, KIND } from "@/errors";
import { createDefaultDocument } from "@/onnx/config/document.js";
import { onnxSpaceAPI, repoAPI } from "@/utils/api.js";
import {
  ONNX_SPACE_PATH,
  loadOnnxSpace,
  saveOnnxSpace,
  validateOnnxSpaceConfig,
  canEditOnnxSpace,
  onnxEditorLocation,
  onnxAppLocation,
} from "@/utils/onnx-space.js";

const context = { id: "alice/demo", revision: "dev/onnx" };
const head = "a".repeat(40),
  nextHead = "b".repeat(40);
const resource = (path, revision = "main", id = context.id) =>
  `/spaces/${id}/resolve/${encodeURIComponent(revision)}/${path}`;
function configured() {
  const document = createDefaultDocument();
  document.task.model.url = resource("models/model.onnx");
  document.task.sample.url = resource("samples/input.jpg");
  document.task.labelFile = resource("labels.json");
  return { version: 1, enabled: true, document };
}
const body = (value) =>
  new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });

describe("repository-backed optional ONNX Space", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("loads one committed snapshot, then binds all resource paths to the selected branch", async () => {
    const original = configured();
    const getHead = vi.spyOn(onnxSpaceAPI, "getHead").mockResolvedValue(head);
    const read = vi
      .spyOn(onnxSpaceAPI, "readResource")
      .mockResolvedValue(body(original));
    const signal = new AbortController().signal;
    const result = await loadOnnxSpace(context, { signal });
    expect(getHead).toHaveBeenCalledWith(context, { signal });
    expect(read).toHaveBeenCalledWith(resource(ONNX_SPACE_PATH, head), {
      signal,
    });
    expect(result.commit).toBe(head);
    expect(result.config.document.task.model.url).toBe(
      resource("models/model.onnx", context.revision),
    );
    expect(result.config.document.task.sample.url).toBe(
      resource("samples/input.jpg", context.revision),
    );
    expect(result.config.document.task.labelFile).toBe(
      resource("labels.json", context.revision),
    );
    expect(original.document.task.model.url).toBe(
      resource("models/model.onnx"),
    );
  });

  it("only a missing config becomes disabled; repository errors and failed reads stay errors", async () => {
    const getHead = vi.spyOn(onnxSpaceAPI, "getHead").mockResolvedValue(head);
    const read = vi.spyOn(onnxSpaceAPI, "readResource");
    read.mockRejectedValue(
      new AppError({
        kind: KIND.NOT_FOUND,
        status: 404,
        code: "EntryNotFound",
      }),
    );
    await expect(loadOnnxSpace(context)).resolves.toEqual({
      config: { version: 1, enabled: false, document: null },
      commit: head,
    });
    for (const [status, code] of [
      [403, "Forbidden"],
      [503, null],
      [404, "RepoNotFound"],
      [404, "RevisionNotFound"],
    ]) {
      read.mockRejectedValue(
        new AppError({ kind: KIND.NOT_FOUND, status, code }),
      );
      await expect(loadOnnxSpace(context)).rejects.toMatchObject({
        status,
        code,
      });
    }
    read.mockClear();
    getHead.mockRejectedValue(
      new AppError({ kind: KIND.NOT_FOUND, status: 404 }),
    );
    await expect(loadOnnxSpace(context)).rejects.toMatchObject({ status: 404 });
    expect(read).not.toHaveBeenCalled();
  });

  it("saves only the ONNX file with a required parent, retaining a disabled document", async () => {
    const post = vi
      .spyOn(repoAPI, "commitFiles")
      .mockResolvedValue({ data: { commitOid: nextHead } });
    const config = configured();
    config.enabled = false;
    const result = await saveOnnxSpace(context, config, {
      parentCommit: head,
      message: "Disable demo",
    });
    expect(post).toHaveBeenCalledWith(
      "space",
      "alice",
      "demo",
      "dev%2Fonnx",
      expect.objectContaining({ parentCommit: head, message: "Disable demo" }),
    );
    const files = post.mock.calls[0][4].files;
    expect(files.map((file) => file.path)).toEqual([ONNX_SPACE_PATH]);
    expect(JSON.parse(files[0].content)).toEqual(result.config);
    expect(result.config.document.task.model.sha256).toBe(
      config.document.task.model.sha256,
    );
    expect(result.config.enabled).toBe(false);
    expect(result.commit).toBe(nextHead);
    post.mockClear();
    await expect(saveOnnxSpace(context, config)).rejects.toMatchObject({
      kind: KIND.INVALID,
    });
    expect(post).not.toHaveBeenCalled();
  });

  it("supports enabled-but-unconfigured creation and reports optimistic conflicts without retrying", async () => {
    const config = { version: 1, enabled: true, document: null };
    const post = vi
      .spyOn(repoAPI, "commitFiles")
      .mockResolvedValue({ data: { commitOid: nextHead } });
    await expect(
      saveOnnxSpace(context, config, { parentCommit: head }),
    ).resolves.toMatchObject({ config });
    post.mockRejectedValue({
      response: {
        status: 412,
        data: { detail: { error: "A commit has happened since." } },
      },
    });
    await expect(
      saveOnnxSpace(context, config, { parentCommit: head }),
    ).rejects.toMatchObject({ kind: KIND.CONFLICT, status: 412 });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("rejects foreign/legacy resource paths, executable rules and malformed configuration", async () => {
    for (const url of [
      resource("model.onnx", "main", "bob/other"),
      "/models/model.onnx",
      "https://evil.test/model.onnx",
      "/spaces/alice/demo/resolve/main/%2e%2e/model.onnx",
    ]) {
      const config = configured();
      config.document.task.model.url = url;
      expect(() => validateOnnxSpaceConfig(context, config)).toThrow();
    }
    const config = configured();
    config.document.ui.rules[0].on = { click: "function(){alert(1)}" };
    expect(() => validateOnnxSpaceConfig(context, config)).toThrow();
    for (const value of [
      { version: 2, enabled: true, document: null },
      { version: 1, enabled: "true", document: null },
      { version: 1, enabled: true, document: null, sdk: "onnx" },
    ])
      expect(() => validateOnnxSpaceConfig(context, value)).toThrow();
  });

  it("rejects invalid JSON and oversized bodies even with a false Content-Length", async () => {
    vi.spyOn(onnxSpaceAPI, "getHead").mockResolvedValue(head);
    const read = vi
      .spyOn(onnxSpaceAPI, "readResource")
      .mockResolvedValue(new Response("<html>proxy</html>"));
    await expect(loadOnnxSpace(context)).rejects.toMatchObject({
      kind: KIND.INVALID,
    });
    read.mockResolvedValue(
      new Response("x".repeat(1_048_577), {
        headers: { "Content-Length": "1" },
      }),
    );
    await expect(loadOnnxSpace(context)).rejects.toThrow("1 MiB");
  });

  it("keeps the revision in app/editor navigation and excludes visitors and external repos", () => {
    expect(onnxEditorLocation(context)).toEqual({
      path: "/spaces/alice/demo/onnx-editor/dev%2Fonnx",
    });
    expect(onnxAppLocation(context)).toEqual({
      path: "/spaces/alice/demo",
      query: { revision: "dev/onnx" },
    });
    const auth = {
      isAuthenticated: true,
      username: "alice",
      organizations: [],
    };
    expect(canEditOnnxSpace(auth, "alice")).toBe(true);
    expect(canEditOnnxSpace(auth, "alice", true)).toBe(false);
    for (const roleInOrg of ["member", "admin", "super-admin", "visitor"]) {
      auth.organizations = [{ name: "team", roleInOrg }];
      expect(canEditOnnxSpace(auth, "team")).toBe(roleInOrg !== "visitor");
    }
    auth.organizations = [{ name: "team", role: "member" }];
    expect(canEditOnnxSpace(auth, "team")).toBe(true);
    expect(canEditOnnxSpace({ ...auth, isAuthenticated: false }, "alice")).toBe(
      false,
    );
  });
});
