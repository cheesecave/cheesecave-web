// Component tests for TarBrowserPanel's zip mode: the same listing and
// member-preview surface as an indexed tar, fed by utils/zip-archive.js.
// Archives are served by MSW through /resolve/ (Range) and paths-info.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as zip from "@zip.js/zip.js";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { http, HttpResponse, passthrough } from "@/testing/msw";

import { ElementPlusStubs } from "../helpers/vue";
import { server } from "../setup/msw-server";

import TarBrowserPanel from "@/components/repo/preview/TarBrowserPanel.vue";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) =>
  new Uint8Array(readFileSync(resolve(__dirname, "../fixtures/zip", name)));
const text = (s) => new TextEncoder().encode(s);

const TARGET = {
  repoType: "dataset",
  namespace: "owner",
  name: "zips",
  branch: "main",
};
const RESOLVE_PREFIX = `${window.location.origin}/datasets/owner/zips/resolve/main/`;
const PATHS_INFO = "/api/datasets/owner/zips/paths-info/main";
const PNG = Uint8Array.of(
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  0,
  0,
  0,
  0,
);

function serveRepo(files) {
  server.use(
    http.get(`${RESOLVE_PREFIX}*`, ({ request }) => {
      const path = decodeURIComponent(
        new URL(request.url).pathname.slice(
          new URL(RESOLVE_PREFIX).pathname.length,
        ),
      );
      const body = files[path];
      if (!body)
        return new HttpResponse("missing", {
          status: 404,
          statusText: "Not Found",
        });
      const [, start, end] = /^bytes=(\d+)-(\d+)$/.exec(
        request.headers.get("range"),
      );
      const last = Math.min(Number(end), body.length - 1);
      return new HttpResponse(body.slice(Number(start), last + 1), {
        status: 206,
      });
    }),
    http.post(PATHS_INFO, async ({ request }) => {
      const paths = new URLSearchParams(await request.text()).getAll("paths");
      return HttpResponse.json(
        paths
          .filter((p) => files[p])
          .map((p) => ({ type: "file", path: p, size: files[p].length })),
      );
    }),
  );
}

async function makeZip(entries) {
  const writer = new zip.ZipWriter(new zip.Uint8ArrayWriter());
  for (const [name, data] of entries)
    await writer.add(name, new zip.Uint8ArrayReader(data));
  return writer.close();
}

const FilePreviewDialogStub = {
  name: "FilePreviewDialog",
  props: ["visible", "kind", "bytes", "resolveUrl", "filename"],
  template: '<div data-stub="FilePreviewDialog" />',
};
const thumbnails = [];
const TarMemberThumbnailStub = {
  name: "TarMemberThumbnail",
  props: ["tarUrl", "member", "placeholderIcon", "size", "read"],
  setup(props) {
    thumbnails.push(props);
    return {};
  },
  template: '<div data-stub="TarMemberThumbnail" />',
};

function mountPanel(path, props = {}) {
  return mount(TarBrowserPanel, {
    props: {
      zip: { ...TARGET, path },
      filename: path.split("/").pop(),
      ...props,
    },
    global: {
      stubs: {
        ...ElementPlusStubs,
        FilePreviewDialog: FilePreviewDialogStub,
        TarMemberThumbnail: TarMemberThumbnailStub,
        MarkdownViewer: {
          props: ["content"],
          template: '<div data-stub="MarkdownViewer">{{ content }}</div>',
        },
      },
    },
  });
}

const until = (assertion) =>
  vi.waitFor(assertion, { timeout: 5000, interval: 10 });
const rowFor = (wrapper, name) =>
  wrapper.findAll(".cursor-pointer").find((row) => row.text().includes(name));
const passwordForm = (wrapper) =>
  wrapper.find('[data-testid="zip-password-form"]');

async function submitPassword(wrapper, password) {
  await passwordForm(wrapper).get("input").setValue(password);
  await passwordForm(wrapper).trigger("submit");
  await flushPromises();
}

beforeEach(() => {
  thumbnails.length = 0;
  server.use(http.get(/application\/wasm;base64,/, () => passthrough()));
  URL.createObjectURL = vi.fn(() => "blob:zip-member");
  URL.revokeObjectURL = vi.fn();
  localStorage.setItem("kohaku-tar-view-mode", "list");
});

afterEach(() => {
  delete URL.createObjectURL;
  delete URL.revokeObjectURL;
});

describe("TarBrowserPanel · zip mode", () => {
  it("lists the archive and previews and downloads a member", async () => {
    serveRepo({
      "a/demo.zip": await makeZip([
        ["hello.txt", text("hello zip\n")],
        ["docs/readme.md", text("# Readme\n")],
        ["data.bin", Uint8Array.of(1, 2, 3)],
      ]),
    });
    const wrapper = mountPanel("a/demo.zip");
    await nextTick();
    expect(wrapper.text()).toContain("Reading the zip central directory");
    await until(() => expect(wrapper.text()).toContain("3 files in archive"));
    expect(wrapper.text()).not.toContain("volumes");
    expect(wrapper.find(".el-alert").exists()).toBe(false);

    await rowFor(wrapper, "hello.txt").trigger("click");
    await until(() => expect(wrapper.text()).toContain("hello zip"));

    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const download = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Download"));
    await download.trigger("click");
    expect(click).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalled();

    await wrapper
      .findAll("button")
      .find((b) => b.text().includes("Back"))
      .trigger("click");
    await rowFor(wrapper, "docs").trigger("click");
    await rowFor(wrapper, "readme.md").trigger("click");
    await until(() => expect(wrapper.text()).toContain("Readme"));
  });

  it("asks for the password once at entry, then previews without asking again", async () => {
    serveRepo({ "secret.zip": fixture("crypto-aes256.zip") });
    const wrapper = mountPanel("secret.zip");
    await until(() => expect(passwordForm(wrapper).exists()).toBe(true));
    expect(wrapper.text()).not.toContain("files in archive");

    await submitPassword(wrapper, "wrong");
    await until(() => expect(wrapper.text()).toContain("Wrong password"));
    expect(passwordForm(wrapper).exists()).toBe(true);

    await submitPassword(wrapper, "secret");
    await until(() => expect(wrapper.text()).toContain("files in archive"));

    await rowFor(wrapper, "hello.txt").trigger("click");
    await until(() =>
      expect(wrapper.text()).toContain("hello from the zip fixture"),
    );
    expect(passwordForm(wrapper).exists()).toBe(false);
    await wrapper
      .findAll("button")
      .find((b) => b.text().includes("Back"))
      .trigger("click");
    await rowFor(wrapper, "data").trigger("click");
    await rowFor(wrapper, "table.csv").trigger("click");
    await until(() => expect(wrapper.text()).toContain("row-199"));
    expect(passwordForm(wrapper).exists()).toBe(false);
  });

  it("shows why a password check failed", async () => {
    serveRepo({ "secret.zip": fixture("crypto-aes256.zip") });
    const wrapper = mountPanel("secret.zip");
    await until(() => expect(passwordForm(wrapper).exists()).toBe(true));
    server.use(
      http.get(
        `${RESOLVE_PREFIX}secret.zip`,
        () =>
          new HttpResponse("down", { status: 503, statusText: "Unavailable" }),
      ),
    );
    await submitPassword(wrapper, "secret");
    await until(() => expect(wrapper.text()).toContain("503"));
  });

  it("asks again only for a member that uses another password", async () => {
    serveRepo({ "two.zip": fixture("crypto-two-passwords.zip") });
    const wrapper = mountPanel("two.zip");
    await until(() => expect(passwordForm(wrapper).exists()).toBe(true));
    await submitPassword(wrapper, "alpha");
    await until(() => expect(wrapper.text()).toContain("files in archive"));

    await rowFor(wrapper, "data").trigger("click");
    await rowFor(wrapper, "table.csv").trigger("click");
    await until(() => expect(passwordForm(wrapper).exists()).toBe(true));
    expect(wrapper.text()).toContain("different password");
    expect(
      wrapper.findAll("button").some((b) => b.text().includes("Download")),
    ).toBe(false);

    await submitPassword(wrapper, "gamma");
    await until(() => expect(wrapper.text()).toContain("Wrong password"));
    await submitPassword(wrapper, "beta");
    await until(() => expect(wrapper.text()).toContain("row-199"));
  });

  it("explains unsupported compression methods without offering a download", async () => {
    serveRepo({ "ppmd.zip": fixture("methods-ppmd.zip") });
    const wrapper = mountPanel("ppmd.zip");
    await until(() => expect(wrapper.text()).toContain("files in archive"));
    await rowFor(wrapper, "data").trigger("click");
    await rowFor(wrapper, "table.csv").trigger("click");
    await until(() =>
      expect(wrapper.text()).toContain("PPMd is not supported"),
    );
    expect(
      wrapper.findAll("button").some((b) => b.text().includes("Download")),
    ).toBe(false);
  });

  it("shows a classified error when a member cannot be fetched", async () => {
    serveRepo({ "a.zip": await makeZip([["a.txt", text("a")]]) });
    const wrapper = mountPanel("a.zip");
    await until(() => expect(wrapper.text()).toContain("files in archive"));
    server.use(
      http.get(
        `${RESOLVE_PREFIX}a.zip`,
        () => new HttpResponse("x", { status: 500, statusText: "Boom" }),
      ),
    );
    await rowFor(wrapper, "a.txt").trigger("click");
    await until(() =>
      expect(wrapper.findComponent({ name: "ErrorState" }).exists()).toBe(true),
    );
  });

  it("lets the user switch the filename encoding of legacy names", async () => {
    serveRepo({ "sjis.zip": fixture("names-shiftjis.zip") });
    const wrapper = mountPanel("sjis.zip");
    await until(() => expect(wrapper.text()).toContain("テスト資料.txt"));
    await rowFor(wrapper, "画像").trigger("click");
    const select = wrapper.get('[data-testid="zip-encoding"]');
    expect(select.element.value).toBe("shift_jis");
    await select.setValue("gbk");
    await until(() => expect(wrapper.text()).not.toContain("テスト資料.txt"));
    // Back at the archive root with the re-decoded names.
    expect(wrapper.text()).toContain("2 entries");
    await select.setValue("gbk");
  });

  it("hides the encoding selector for UTF-8 archives", async () => {
    serveRepo({ "u.zip": await makeZip([["日本語.txt", text("x")]]) });
    const wrapper = mountPanel("u.zip");
    await until(() => expect(wrapper.text()).toContain("日本語.txt"));
    expect(wrapper.find('[data-testid="zip-encoding"]').exists()).toBe(false);
  });

  it("reports how many volumes a split archive spans", async () => {
    serveRepo({
      "split-7z.zip.001": fixture("split-7z.zip.001"),
      "split-7z.zip.002": fixture("split-7z.zip.002"),
      "split-7z.zip.003": fixture("split-7z.zip.003"),
    });
    const wrapper = mountPanel("split-7z.zip.001");
    await until(() => expect(wrapper.text()).toContain("3 volumes"));
  });

  it("shows an ErrorState when the zip cannot be opened, and retries", async () => {
    serveRepo({});
    const wrapper = mountPanel("missing.zip");
    await until(() =>
      expect(wrapper.findComponent({ name: "ErrorState" }).exists()).toBe(true),
    );
    serveRepo({ "missing.zip": await makeZip([["late.txt", text("late")]]) });
    await wrapper.findComponent({ name: "ErrorState" }).props("retry")();
    await until(() => expect(wrapper.text()).toContain("late.txt"));
  });

  it("feeds thumbnails through the zip reader", async () => {
    serveRepo({ "img.zip": await makeZip([["pic.png", PNG]]) });
    const wrapper = mountPanel("img.zip");
    await until(() => expect(thumbnails.length).toBeGreaterThan(0));
    const [props] = thumbnails;
    expect(props.tarUrl).toBe(`${RESOLVE_PREFIX}img.zip`);
    expect(Array.from(await props.read(props.member, 4))).toEqual([
      0x89, 0x50, 0x4e, 0x47,
    ]);
    wrapper.unmount();
  });

  it("reloads when the zip target changes", async () => {
    serveRepo({
      "one.zip": await makeZip([["first.txt", text("1")]]),
      "two.zip": await makeZip([["second.txt", text("2")]]),
    });
    const wrapper = mountPanel("one.zip");
    await until(() => expect(wrapper.text()).toContain("first.txt"));
    await wrapper.setProps({
      zip: { ...TARGET, path: "two.zip" },
      filename: "two.zip",
    });
    await until(() => expect(wrapper.text()).toContain("second.txt"));
    await wrapper.setProps({ zip: { ...TARGET, path: "two.zip" } });
    expect(wrapper.text()).toContain("second.txt");
  });

  it("ignores a superseded zip that fails late", async () => {
    let release;
    const gate = new Promise((r) => (release = r));
    const fast = await makeZip([["fast.txt", text("f")]]);
    server.use(
      http.get(/application\/wasm;base64,/, () => passthrough()),
      http.post(PATHS_INFO, async ({ request }) => {
        const paths = new URLSearchParams(await request.text()).getAll("paths");
        if (paths[0] === "broken.zip") {
          await gate;
          return HttpResponse.json([]);
        }
        return HttpResponse.json([
          { type: "file", path: "fast.zip", size: fast.length },
        ]);
      }),
      http.get(`${RESOLVE_PREFIX}fast.zip`, ({ request }) => {
        const [, a, b] = /^bytes=(\d+)-(\d+)$/.exec(
          request.headers.get("range"),
        );
        return new HttpResponse(
          fast.slice(Number(a), Math.min(Number(b), fast.length - 1) + 1),
          { status: 206 },
        );
      }),
    );
    const wrapper = mountPanel("broken.zip");
    await flushPromises();
    await wrapper.setProps({ zip: { ...TARGET, path: "fast.zip" } });
    await until(() => expect(wrapper.text()).toContain("fast.txt"));
    release();
    await new Promise((r) => setTimeout(r, 50));
    expect(wrapper.findComponent({ name: "ErrorState" }).exists()).toBe(false);
    expect(wrapper.text()).toContain("fast.txt");
  });

  it("ignores a superseded zip that finishes opening late", async () => {
    let release;
    const gate = new Promise((r) => (release = r));
    const slow = await makeZip([["slow.txt", text("s")]]);
    serveRepo({
      "slow.zip": slow,
      "fast.zip": await makeZip([["fast.txt", text("f")]]),
    });
    server.use(
      http.post(PATHS_INFO, async ({ request }) => {
        const paths = new URLSearchParams(await request.text()).getAll("paths");
        if (paths[0] === "slow.zip") await gate;
        const sizes = { "slow.zip": slow.length };
        return HttpResponse.json(
          paths
            .map((p) => ({ type: "file", path: p, size: sizes[p] ?? 0 }))
            .filter((e) => e.size),
        );
      }),
    );
    const wrapper = mountPanel("slow.zip");
    await flushPromises();
    // Newer handlers win: keep serving slow.zip so its late open succeeds.
    serveRepo({
      "slow.zip": slow,
      "fast.zip": await makeZip([["fast.txt", text("f")]]),
    });
    await wrapper.setProps({ zip: { ...TARGET, path: "fast.zip" } });
    await until(() => expect(wrapper.text()).toContain("fast.txt"));
    release();
    await flushPromises();
    await new Promise((r) => setTimeout(r, 50));
    expect(wrapper.text()).not.toContain("slow.txt");
  });
});
