import { mount, flushPromises } from "@vue/test-utils";
import { within } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs } from "../helpers/vue";

const mocks = vi.hoisted(() => ({
  guestTree: vi.fn(),
  guestPreview: vi.fn(),
  leaveGuest: vi.fn(),
  guestOverview: vi.fn(),
  guestCommits: vi.fn(),
  guestFileInfo: vi.fn(),
}));
vi.mock("@/stores/markdownStyle", () => ({
  useMarkdownStyleStore: () => ({ resolved: "github" }),
}));
vi.mock("@/utils/api", () => ({ repositoryAccessAPI: mocks }));
import Visitor from "@/components/repo/RestrictedRepositoryViewer.vue";
const repository = { type: "model", namespace: "owner", name: "demo" };
const wrappers = [];
function mountVisitor() {
  const wrapper = mount(Visitor, {
    props: { repository, view: "files" },
    attachTo: document.body,
    global: {
      stubs: {
        ...ElementPlusStubs,
        RepositoryAccessLayout: {
          template:
            '<section><slot name="actions"/><slot/><slot name="aside"/></section>',
        },
      },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}
const queries = (wrapper) => within(wrapper.element);
describe("controlled guest file rows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guestOverview.mockResolvedValue({
      data: {
        id: "owner/demo",
        author: "owner",
        default_branch: "main",
        metadata: {},
        readme: null,
      },
    });
    mocks.guestFileInfo.mockImplementation((_repo, path) =>
      Promise.resolve({ data: { path, size: null, last_modified: null } }),
    );
    mocks.guestCommits.mockResolvedValue({
      data: { commits: [], has_more: false },
    });
    mocks.guestTree.mockResolvedValue({
      data: {
        path: "",
        entries: [
          {
            path: "notes.txt",
            type: "file",
            preview_kind: "text",
            size: 1536,
            last_commit: {
              id: "abc1234",
              title: "Update notes",
              timestamp: "2026-11-10T06:00:00Z",
              author: "owner",
            },
          },
          { path: "folder", type: "directory", size: 0 },
          {
            path: "manual.pdf",
            type: "file",
            preview_kind: "unsupported",
            size: 512,
          },
        ],
      },
    });
    mocks.guestPreview.mockResolvedValue({
      data: { kind: "text", text: "Limited excerpt", truncated: true },
    });
  });
  afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));

  it("renders named file metadata as rows without download or original-file links", async () => {
    const wrapper = mountVisitor();
    await flushPromises();
    const table = queries(wrapper).getByRole("table", {
      name: "Repository files",
    });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent.trim()),
    ).toEqual(["Name", "Last commit", "Updated", "Size"]);
    const note = within(table).getByRole("row", { name: /notes.txt/ });
    expect(note.textContent).toContain("Update notes");
    expect(note.textContent).toContain("1.5 KB");
    const pdf = within(table).getByRole("row", { name: /manual.pdf/ });
    expect(within(pdf).getAllByRole("cell")).toHaveLength(4);
    expect(pdf.textContent).toContain("512 B");
    expect(wrapper.findAll("a[download],video,audio,iframe")).toHaveLength(0);
    expect(
      wrapper
        .findAll("a[href]")
        .every((link) =>
          /^\/(?:owner$|models\/owner\/demo\/(?:tree|blob)\/main\/(?:notes\.txt|manual\.pdf|folder))$/.test(
            link.attributes("href"),
          ),
        ),
    ).toBe(true);
    expect(wrapper.html()).not.toMatch(/\/resolve\/|https?:\/\//);
    expect(
      queries(wrapper).queryByRole("button", { name: /download|clone/i }),
    ).toBeNull();
  });

  it("opens folders and parents using only the controlled tree endpoint", async () => {
    const wrapper = mountVisitor();
    await flushPromises();
    mocks.guestTree.mockResolvedValueOnce({
      data: {
        path: "folder",
        entries: [
          {
            path: "folder/nested.txt",
            type: "file",
            preview_kind: "text",
            size: 0,
          },
        ],
      },
    });
    await queries(wrapper)
      .getByRole("link", { name: "folder", exact: true })
      .click();
    await flushPromises();
    expect(mocks.guestTree).toHaveBeenLastCalledWith(repository, "folder", {
      search: "",
    });
    const table = queries(wrapper).getByRole("table", {
      name: "Repository files",
    });
    expect(
      within(table)
        .getByRole("link", { name: "folder/nested.txt", exact: true })
        .textContent.trim(),
    ).toBe("nested.txt");
    expect(
      within(table).getByRole("row", { name: /nested.txt/ }).textContent,
    ).toContain("0 B");
    await queries(wrapper)
      .getByRole("button", { name: "Parent folder", exact: true })
      .click();
    await flushPromises();
    expect(mocks.guestTree).toHaveBeenLastCalledWith(repository, "", {
      search: "",
    });
    expect(mocks.guestPreview).not.toHaveBeenCalled();
  });

  it("selects a row for bounded preview without creating a raw download target", async () => {
    const wrapper = mountVisitor();
    await flushPromises();
    await queries(wrapper)
      .getByRole("link", { name: "notes.txt", exact: true })
      .click();
    await flushPromises();
    expect(mocks.guestPreview).toHaveBeenCalledExactlyOnceWith(
      repository,
      "notes.txt",
    );
    const preview = queries(wrapper).getByRole("article", {
      name: "Controlled file preview",
    });
    expect(preview.textContent).toContain("Limited excerpt");
    expect(preview.textContent).toContain("This preview is limited");
    expect(
      queries(wrapper).getByRole("heading", { name: "notes.txt", exact: true }),
    ).toBeDefined();
    expect(
      queries(wrapper).getByRole("button", { name: "Back to Files" }),
    ).toBeDefined();
    expect(
      queries(wrapper).queryByRole("table", { name: "Repository files" }),
    ).toBeNull();
    expect(wrapper.findAll("a[download]")).toHaveLength(0);
    expect(
      wrapper
        .findAll("a[href]")
        .every((link) =>
          /^\/(?:owner$|models\/owner\/demo\/(?:tree|blob)\/main\/(?:notes\.txt|manual\.pdf|folder))$/.test(
            link.attributes("href"),
          ),
        ),
    ).toBe(true);
  });

  it("displays only supplied preview metadata, including large and unknown file sizes", async () => {
    mocks.guestTree.mockResolvedValueOnce({
      data: {
        path: "",
        entries: [
          {
            path: "rows.csv",
            type: "file",
            preview_kind: "rows",
            size: 2500000,
            download_url: "https://storage.invalid/raw.csv",
          },
          {
            path: "photo.png",
            type: "file",
            preview_kind: "image",
            size: 1536,
          },
          {
            path: "weights.bin",
            type: "file",
            preview_kind: "unsupported",
            size: 2500000000,
          },
          { path: "unknown.bin", type: "file", preview_kind: "unsupported" },
        ],
      },
    });
    const wrapper = mountVisitor();
    await flushPromises();
    const table = queries(wrapper).getByRole("table", {
      name: "Repository files",
    });
    expect(
      within(table).getByRole("row", { name: /rows.csv/ }).textContent,
    ).toContain("2.5 MB");
    expect(
      within(table).getByRole("row", { name: /photo.png/ }).textContent,
    ).toContain("1.5 KB");
    expect(
      within(table).getByRole("row", { name: /weights.bin/ }).textContent,
    ).toContain("2.5 GB");
    expect(
      within(table).getByRole("row", { name: /unknown.bin/ }).textContent,
    ).toContain("—");
    expect(wrapper.html()).not.toContain("storage.invalid");
  });

  it("shows an empty folder as an empty file table without offering ordinary file actions", async () => {
    mocks.guestTree.mockResolvedValueOnce({ data: { path: "", entries: [] } });
    const wrapper = mountVisitor();
    await flushPromises();
    const table = queries(wrapper).getByRole("table", {
      name: "Repository files",
    });
    expect(within(table).getByText("No files found")).toBeDefined();
    expect(within(table).queryByRole("button")).toBeNull();
    expect(mocks.guestPreview).not.toHaveBeenCalled();
  });
});
