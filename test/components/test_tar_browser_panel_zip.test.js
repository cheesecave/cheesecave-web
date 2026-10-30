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
import { buildPsd } from "../helpers/psd-builder";
import { server } from "../setup/msw-server";

// jsdom has no canvas: the PSD preview's encoder is stood in for
vi.mock("@/utils/psd-preview", async (importOriginal) => ({
  ...(await importOriginal()),
  rgbaToBlob: vi.fn(async () => new Blob(["pixels"], { type: "image/png" })),
}));

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

async function makeZip(entries, options) {
  const writer = new zip.ZipWriter(new zip.Uint8ArrayWriter(), options);
  for (const [name, data] of entries)
    await writer.add(name, new zip.Uint8ArrayReader(data));
  return writer.close();
}

const FilePreviewDialogStub = {
  name: "FilePreviewDialog",
  props: ["visible", "kind", "bytes", "source", "resolveUrl", "filename"],
  template: '<div data-stub="FilePreviewDialog" />',
};
const thumbnails = [];
const TarMemberThumbnailStub = {
  name: "TarMemberThumbnail",
  props: ["tarUrl", "member", "placeholderIcon", "size", "read", "readRange"],
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

  it("lists the members in natural order, folders first", async () => {
    serveRepo({
      "a/order.zip": await makeZip([
        ["img_10.png", text("a")],
        ["img_2.png", text("b")],
        ["img_1.png", text("c")],
        ["part-10/a.txt", text("d")],
        ["part-2/a.txt", text("e")],
      ]),
    });
    const wrapper = mountPanel("a/order.zip");
    await until(() => expect(wrapper.text()).toContain("5 files in archive"));
    const rows = wrapper
      .findAll(".cursor-pointer")
      .map((row) => row.text())
      .join("\n");
    const at = (name) => rows.indexOf(name);
    expect(at("part-2")).toBeGreaterThanOrEqual(0);
    expect(at("part-2")).toBeLessThan(at("part-10"));
    expect(at("part-10")).toBeLessThan(at("img_1.png"));
    expect(at("img_1.png")).toBeLessThan(at("img_2.png"));
    expect(at("img_2.png")).toBeLessThan(at("img_10.png"));
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

  it("asks for another password when a binary member using it is downloaded", async () => {
    const writer = new zip.ZipWriter(new zip.Uint8ArrayWriter());
    await writer.add("hello.txt", new zip.Uint8ArrayReader(text("hi")), {
      password: "alpha",
    });
    await writer.add(
      "model.bin",
      new zip.Uint8ArrayReader(Uint8Array.of(1, 2, 3, 4)),
      { password: "beta" },
    );
    serveRepo({ "bin.zip": await writer.close() });
    const wrapper = mountPanel("bin.zip");
    await until(() => expect(passwordForm(wrapper).exists()).toBe(true));
    await submitPassword(wrapper, "alpha");
    await until(() => expect(wrapper.text()).toContain("files in archive"));

    await rowFor(wrapper, "model.bin").trigger("click");
    await until(() => expect(wrapper.text()).toContain("Binary member"));
    const download = () =>
      wrapper.findAll("button").find((b) => b.text().includes("Download"));
    await download().trigger("click");
    await until(() => expect(passwordForm(wrapper).exists()).toBe(true));
    expect(wrapper.text()).toContain("different password");

    await submitPassword(wrapper, "beta");
    await until(() => expect(wrapper.text()).toContain("Binary member"));
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    await download().trigger("click");
    await until(() => expect(click).toHaveBeenCalledTimes(1));
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

  it("lists every volume of a split archive opened from any of them", async () => {
    serveRepo({
      "split-7z.zip.001": fixture("split-7z.zip.001"),
      "split-7z.zip.002": fixture("split-7z.zip.002"),
      "split-7z.zip.003": fixture("split-7z.zip.003"),
    });
    const wrapper = mountPanel("split-7z.zip.002");
    await until(() => expect(wrapper.text()).toContain("files in archive"));
    const volumes = wrapper.get('[data-testid="zip-volumes"]');
    expect(volumes.get("summary").text()).toBe(
      "Split archive · 3 volumes · 186.04 KB",
    );
    expect(volumes.findAll("li").map((li) => li.text())).toEqual([
      "split-7z.zip.001 · 64.00 KB",
      "split-7z.zip.002 · 64.00 KB",
      "split-7z.zip.003 · 58.04 KB",
    ]);
  });

  it("names an unreadable zip instead of reporting a failed request", async () => {
    serveRepo({ "junk.zip": new Uint8Array(4096) });
    const wrapper = mountPanel("junk.zip");
    await until(() =>
      expect(wrapper.find('[data-testid="error-title"]').text()).toBe(
        "Cannot read this zip",
      ),
    );
    expect(wrapper.text()).toContain("End of central directory not found");
  });

  it("names a corrupted member instead of reporting a failed request", async () => {
    const bytes = await makeZip([["a.txt", text("hello hello hello")]], {
      level: 0,
    });
    const header = new DataView(bytes.buffer);
    // The first stored byte: after the 30-byte local header, name and extra.
    bytes[30 + header.getUint16(26, true) + header.getUint16(28, true)] ^= 0xff;
    serveRepo({ "crc.zip": bytes });
    const wrapper = mountPanel("crc.zip");
    await until(() => expect(wrapper.text()).toContain("files in archive"));
    await rowFor(wrapper, "a.txt").trigger("click");
    await until(() =>
      expect(wrapper.find('[data-testid="error-title"]').text()).toBe(
        "Cannot read this zip",
      ),
    );
    expect(wrapper.text()).toContain("CRC-32 mismatch");
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

  it("shows a PSD member as its flattened image, read whole out of the zip", async () => {
    const psd = buildPsd({ width: 60, height: 40, layerBytes: 5000 });
    serveRepo({ "art.zip": await makeZip([["art.psd", psd]]) });
    const wrapper = mountPanel("art.zip");
    await until(() => expect(rowFor(wrapper, "art.psd")).toBeTruthy());
    await rowFor(wrapper, "art.psd").trigger("click");
    await until(() =>
      expect(wrapper.find('[data-testid="psd-preview-image"]').exists()).toBe(true),
    );
    expect(wrapper.text()).toContain("60×40 px");
    wrapper.unmount();
  });

  it("explains a zip member that is not a PSD at all", async () => {
    serveRepo({ "bad.zip": await makeZip([["art.psd", new Uint8Array(100)]]) });
    const wrapper = mountPanel("bad.zip");
    await until(() => expect(rowFor(wrapper, "art.psd")).toBeTruthy());
    await rowFor(wrapper, "art.psd").trigger("click");
    await until(() =>
      expect(wrapper.find('[data-testid="psd-preview-error"]').text()).toContain("not a PSD"),
    );
    wrapper.unmount();
  });

  it("hands PSD rows a thumbnail through the zip reader", async () => {
    const psd = buildPsd({ width: 60, height: 40 });
    serveRepo({ "art.zip": await makeZip([["art.psd", psd]]) });
    const wrapper = mountPanel("art.zip");
    await until(() => expect(thumbnails.length).toBeGreaterThan(0));
    expect(thumbnails[0].member.name).toBe("art.psd");
    expect(thumbnails[0].placeholderIcon).toContain("i-carbon-image");
    // a zip entry has no byte ranges: only the prefix reader is given
    expect(thumbnails[0].readRange).toBeFalsy();
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

// A zip member stored without compression sits in the archive as it is, so its
// metadata is read from inside it by Range; a deflated member has to be inflated
// from the start, so it is extracted whole as before.
describe("TarBrowserPanel · zip data members read in place", () => {
  const SAFETENSORS = new Uint8Array(
    readFileSync(resolve(__dirname, "../fixtures/previews/tiny.safetensors")),
  );

  async function openMember(wrapper, name) {
    await until(() => expect(wrapper.text()).toContain("files in archive"));
    await rowFor(wrapper, name).trigger("click");
  }

  const previewButton = (wrapper) =>
    wrapper.findAll("button").find((b) => b.text().includes("Open metadata preview"));

  it("previews a stored safetensors member in place", async () => {
    serveRepo({
      "a/weights.zip": await makeZip([["model.safetensors", SAFETENSORS]], { level: 0 }),
    });
    const wrapper = mountPanel("a/weights.zip");
    await openMember(wrapper, "model.safetensors");
    await until(() => expect(previewButton(wrapper)).toBeDefined());
    await previewButton(wrapper).trigger("click");
    await flushPromises();
    const dialog = wrapper.findComponent({ name: "FilePreviewDialog" });
    expect(dialog.props("bytes")).toBeFalsy();
    const source = dialog.props("source");
    expect(source.size).toBe(SAFETENSORS.length);
    const head = await source.read(0, 8);
    expect(Array.from(head)).toEqual(Array.from(SAFETENSORS.slice(0, 8)));
  });

  it("extracts a deflated safetensors member whole, as before", async () => {
    serveRepo({
      "a/weights.zip": await makeZip([["model.safetensors", SAFETENSORS]], { level: 5 }),
    });
    const wrapper = mountPanel("a/weights.zip");
    await openMember(wrapper, "model.safetensors");
    await until(() => expect(previewButton(wrapper)).toBeDefined());
    await previewButton(wrapper).trigger("click");
    await flushPromises();
    const dialog = wrapper.findComponent({ name: "FilePreviewDialog" });
    expect(dialog.props("source")).toBeFalsy();
    expect(Array.from(dialog.props("bytes"))).toEqual(Array.from(SAFETENSORS));
  });

  it("shows a classified error when the member cannot be read in place", async () => {
    serveRepo({
      "a/weights.zip": await makeZip([["model.safetensors", SAFETENSORS]], { level: 0 }),
    });
    const wrapper = mountPanel("a/weights.zip");
    await until(() => expect(wrapper.text()).toContain("files in archive"));
    // The archive was listed; now its host stops answering
    server.use(
      http.get(
        `${RESOLVE_PREFIX}a/weights.zip`,
        () => new HttpResponse("down", { status: 503, statusText: "Unavailable" }),
      ),
    );
    await rowFor(wrapper, "model.safetensors").trigger("click");
    await until(() =>
      expect(wrapper.findComponent({ name: "ErrorState" }).exists()).toBe(true),
    );
    expect(previewButton(wrapper)).toBeUndefined();
  });

  it("drops the answer for a member the user has already left", async () => {
    serveRepo({
      "a/mixed.zip": await makeZip(
        [
          ["model.safetensors", SAFETENSORS],
          ["notes.txt", text("still here\n")],
        ],
        { level: 0 },
      ),
    });
    // Hold back the answer of the in-place read of the first member
    const zipModule = await import("@/utils/zip-archive");
    const real = zipModule.openRepoZip;
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const spy = vi.spyOn(zipModule, "openRepoZip").mockImplementation(async (...args) => {
      const archive = await real(...args);
      const rangeSource = archive.rangeSource.bind(archive);
      // The answer arrives late and intact, as if the abort had not reached it
      archive.rangeSource = async (path) => {
        const source = await rangeSource(path);
        await gate;
        return source;
      };
      return archive;
    });
    try {
      const wrapper = mountPanel("a/mixed.zip");
      await until(() => expect(wrapper.text()).toContain("files in archive"));
      await rowFor(wrapper, "model.safetensors").trigger("click");
      // leave it before it answers, and open another member
      await wrapper.findAll("button").find((b) => b.text().includes("Back")).trigger("click");
      await rowFor(wrapper, "notes.txt").trigger("click");
      await until(() => expect(wrapper.text()).toContain("still here"));
      release();
      await flushPromises();
      // the late answer did not turn the view into a metadata preview
      expect(wrapper.text()).toContain("still here");
      expect(previewButton(wrapper)).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });

  it("says a compressed member above the cap has to be fetched whole", async () => {
    const bytes = await makeZip([["huge.safetensors", text("x")]], { level: 5 });
    // The central directory says the member is 210 MB long once inflated
    for (let i = bytes.length - 46; i >= 0; i--) {
      if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x01 && bytes[i + 3] === 0x02) {
        new DataView(bytes.buffer, bytes.byteOffset).setUint32(i + 24, 210_000_000, true);
        break;
      }
    }
    serveRepo({ "a/huge.zip": bytes });
    const wrapper = mountPanel("a/huge.zip");
    await openMember(wrapper, "huge.safetensors");
    await until(() => expect(wrapper.text()).toContain("above the inline-preview cap"));
    expect(wrapper.text()).toContain("has to be fetched and inflated whole");
    expect(previewButton(wrapper)).toBeUndefined();
  });
});
