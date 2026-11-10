import { mount, flushPromises } from "@vue/test-utils";
import { reactive } from "vue";
import { screen } from "@testing-library/vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";
const mocks = vi.hoisted(() => ({
  auth: null,
  notify: vi.fn(),
  api: {
    request: vi.fn(),
    getRequest: vi.fn(),
    bind: vi.fn(),
    guest: vi.fn(),
    leaveGuest: vi.fn(),
    guestTree: vi.fn(),
    guestPreview: vi.fn(),
    guestOverview: vi.fn(),
    guestCommits: vi.fn(),
    guestFileInfo: vi.fn(),
  },
}));
vi.mock("@/stores/theme", () => ({ useThemeStore: () => ({ isDark: false }) }));
vi.mock("@/stores/markdownStyle", () => ({
  useMarkdownStyleStore: () => ({ resolved: "github" }),
}));
vi.mock("@/utils/api", () => ({ repositoryAccessAPI: mocks.api }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("@/errors/notify", () => ({ notifyError: mocks.notify }));
import Invitation from "@/components/repo/RepositoryInvitationPage.vue";
import Visitor from "@/components/repo/RestrictedRepositoryViewer.vue";
import CodeViewer from "@/components/common/CodeViewer.vue";
import BindPage from "@/pages/repo-access.vue";
const repo = { type: "model", namespace: "owner", name: "demo" };
const fileLink = (w, text) =>
  w
    .findAll('a[data-testid="filelist-row-link"]')
    .find((link) => link.text() === text);
const button = (w, text) => w.findAll("button").find((b) => b.text() === text);
const mountView = (component, props = {}) =>
  mount(component, {
    props: { ...(component === Visitor ? { view: "files" } : {}), ...props },
    global: { stubs: { ...ElementPlusStubs, RouterLink: RouterLinkStub } },
  });
describe("invitation and controlled visitor flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mocks.auth = reactive({ isAuthenticated: false, username: null });
    mocks.api.getRequest.mockResolvedValue({ data: { request: null } });
    mocks.api.request.mockResolvedValue({
      data: {
        request: { id: 1, status: "pending" },
        receipt: "opaque_receipt",
      },
    });
    mocks.api.bind.mockResolvedValue({
      data: { success: true, grant: { revoked_at: null, expires_at: null } },
    });
    mocks.api.guest.mockResolvedValue({ data: { access: "guest" } });
    mocks.api.leaveGuest.mockResolvedValue({});
    mocks.api.guestOverview.mockResolvedValue({
      data: {
        id: "owner/demo",
        author: "owner",
        default_branch: "main",
        metadata: {},
        readme: null,
      },
    });
    mocks.api.guestFileInfo.mockImplementation((_repo, path) =>
      Promise.resolve({ data: { path, size: null, last_modified: null } }),
    );
    mocks.api.guestCommits.mockResolvedValue({
      data: { commits: [], has_more: false },
    });
    mocks.api.guestTree.mockResolvedValue({
      data: {
        path: "",
        entries: [
          { path: "notes.txt", type: "file", preview_kind: "text" },
          { path: "folder", type: "directory" },
        ],
      },
    });
    mocks.api.guestPreview.mockResolvedValue({
      data: { kind: "text", text: "Bounded excerpt", truncated: true },
    });
  });
  it("requires email for anonymous applications and saves only the scoped receipt", async () => {
    const w = mountView(Invitation, {
      repository: repo,
      access: { invite_markdown: "# Join" },
    });
    await flushPromises();
    await button(w, "Submit application").trigger("click");
    expect(mocks.api.request).not.toHaveBeenCalled();
    await w
      .get('input[aria-label="Application email"]')
      .setValue("person@example.com");
    await w.get("textarea").setValue("Research");
    await button(w, "Submit application").trigger("click");
    await flushPromises();
    expect(mocks.api.request).toHaveBeenCalledWith(repo, {
      email: "person@example.com",
      message: "Research",
    });
    expect(
      sessionStorage.getItem(`repository-request:${JSON.stringify(repo)}`),
    ).toBe("opaque_receipt");
    expect(w.text()).toContain("pending");
    await button(w, "Refresh application status").trigger("click");
    await flushPromises();
    expect(mocks.api.getRequest).toHaveBeenLastCalledWith(
      repo,
      "opaque_receipt",
    );
    w.unmount();
  });
  it("submits account applications without anonymous email and binds without requesting a guest", async () => {
    mocks.auth.isAuthenticated = true;
    mocks.auth.username = "reader";
    const w = mountView(Invitation, { repository: repo, access: {} });
    await flushPromises();
    await button(w, "Submit application").trigger("click");
    await flushPromises();
    expect(mocks.api.request).toHaveBeenCalledWith(repo, { message: "" });
    await button(w, "Have an Invitation?").trigger("click");
    await w
      .get('input[aria-label="Repository invitation code"]')
      .setValue("repo_secret");
    await button(w, "Bind to my account").trigger("click");
    await flushPromises();
    expect(mocks.api.bind).toHaveBeenCalledWith(repo, "repo_secret");
    expect(mocks.api.guest).not.toHaveBeenCalled();
    expect(w.emitted("changed")).toHaveLength(1);
    w.unmount();
  });
  it("exchanges a visitor code without persisting it or changing login", async () => {
    localStorage.setItem("hf_token", "existing-personal-token");
    const w = mountView(Invitation, { repository: repo, access: {} });
    await flushPromises();
    await button(w, "Have an Invitation?").trigger("click");
    await w
      .get('input[aria-label="Repository invitation code"]')
      .setValue("repo_secret");
    await button(w, "Open temporary web preview").trigger("click");
    await flushPromises();
    expect(mocks.api.guest).toHaveBeenCalledWith(repo, "repo_secret");
    expect(mocks.api.bind).not.toHaveBeenCalled();
    expect(localStorage.getItem("hf_token")).toBe("existing-personal-token");
    expect(
      w.find('input[aria-label="Repository invitation code"]').exists(),
    ).toBe(false);
    await button(w, "Have an Invitation?").trigger("click");
    expect(
      w.get('input[aria-label="Repository invitation code"]').element.value,
    ).toBe("");
    w.unmount();
  });
  it("shows only controlled excerpts and never emits original download URLs", async () => {
    const w = mountView(Visitor, { repository: repo });
    await flushPromises();
    await fileLink(w, "notes.txt").trigger("click");
    await flushPromises();
    expect(mocks.api.guestPreview).toHaveBeenCalledWith(repo, "notes.txt");
    expect(w.text()).toContain("Bounded excerpt");
    expect(w.text()).toContain("This preview is limited");
    expect(w.findAll("video,audio,iframe,a[download]")).toHaveLength(0);
    // Repository identity/navigation links are safe; original-file, object
    // storage and external links must never appear in the guest viewer.
    const safeLinks = [
      "/models",
      "/owner",
      "/models/owner/demo",
      "/models/owner/demo/tree/main",
      "/models/owner/demo/commits/main",
      "/models/owner/demo?tab=metadata",
      "/models/owner/demo/blob/main/notes.txt",
    ];
    for (const link of w.findAll("a[href]")) {
      expect(safeLinks).toContain(link.attributes("href"));
    }
    expect(w.html()).not.toContain("/resolve/");
    await button(w, "End temporary access").trigger("click");
    await flushPromises();
    expect(mocks.api.leaveGuest).toHaveBeenCalledWith(repo);
    expect(w.emitted("changed")).toHaveLength(1);
    w.unmount();
  });
  it("accepts only server-generated raster data URLs for thumbnails", async () => {
    mocks.api.guestPreview.mockResolvedValue({
      data: {
        kind: "image",
        data_url: "/models/owner/demo/resolve/main/secret.png",
      },
    });
    const w = mountView(Visitor, { repository: repo });
    await flushPromises();
    await fileLink(w, "notes.txt").trigger("click");
    await flushPromises();
    expect(w.find(".file-detail-content img").exists()).toBe(false);
    w.unmount();
  });
  it("renders bounded rows as text and can load the next file page", async () => {
    mocks.api.guestTree
      .mockResolvedValueOnce({
        data: {
          path: "",
          entries: [{ path: "rows.csv", type: "file" }],
          has_more: true,
          next_cursor: "signed-next-page",
        },
      })
      .mockResolvedValueOnce({
        data: {
          path: "",
          entries: [{ path: "other.txt", type: "file" }],
          has_more: false,
        },
      });
    mocks.api.guestPreview.mockResolvedValue({
      data: {
        kind: "rows",
        columns: ["name"],
        rows: [["<img src=secret>"]],
        truncated: true,
      },
    });
    const w = mountView(Visitor, { repository: repo });
    await flushPromises();
    expect(button(w, "Load More Files")).toBeDefined();
    await button(w, "Load More Files").trigger("click");
    await flushPromises();
    expect(mocks.api.guestTree).toHaveBeenLastCalledWith(repo, "", {
      search: "",
      cursor: "signed-next-page",
    });
    expect(fileLink(w, "rows.csv")).toBeDefined();
    expect(fileLink(w, "other.txt")).toBeDefined();
    await fileLink(w, "rows.csv").trigger("click");
    await flushPromises();
    expect(w.getComponent(CodeViewer).props("code")).toBe(
      "name\n<img src=secret>\n",
    );
    expect(w.find(".file-detail-content img").exists()).toBe(false);
    w.unmount();
  });
  it("renders raster thumbnail data without an original file URL", async () => {
    mocks.api.guestPreview.mockResolvedValue({
      data: { kind: "image", data_url: "data:image/png;base64,AA==" },
    });
    const w = mountView(Visitor, { repository: repo });
    await flushPromises();
    await fileLink(w, "notes.txt").trigger("click");
    await flushPromises();
    expect(w.get("img").attributes("src")).toBe("data:image/png;base64,AA==");
    expect(w.html()).not.toContain("/resolve/");
    w.unmount();
  });
  it("allows a private repository visitor code on the explicit global page", async () => {
    const w = mountView(BindPage);
    await w.get('input[aria-label="Repository namespace"]').setValue("owner");
    await w.get('input[aria-label="Repository name"]').setValue("demo");
    await w
      .get('input[aria-label="Repository invitation code"]')
      .setValue("repo_private");
    await button(w, "Open temporary web preview").trigger("click");
    await flushPromises();
    expect(mocks.api.guest).toHaveBeenCalledWith(repo, "repo_private");
    expect(w.find('a[href="/models/owner/demo"]').exists()).toBe(true);
    expect(mocks.auth.isAuthenticated).toBe(false);
    w.unmount();
  });
  it.each([false, true])(
    "exposes the global redemption form to users when signed in is %s",
    (signedIn) => {
      mocks.auth.isAuthenticated = signedIn;
      const w = mount(BindPage, {
        attachTo: document.body,
        global: { stubs: { ...ElementPlusStubs, RouterLink: RouterLinkStub } },
      });
      expect(
        screen.getByRole("textbox", { name: "Repository namespace" }),
      ).toBeDefined();
      expect(
        screen.getByRole("textbox", { name: "Repository name" }),
      ).toBeDefined();
      expect(
        screen.getByRole("button", { name: "Open temporary web preview" }),
      ).toBeDefined();
      expect(
        screen.queryByRole("button", { name: "Bind to my account" }) !== null,
      ).toBe(signedIn);
      w.unmount();
    },
  );
  it.each([
    { revoked_at: "2026-01-01T00:00:00Z", expires_at: null },
    { revoked_at: null, expires_at: "2020-01-01T00:00:00Z" },
  ])("does not claim an inactive account grant is active", async (grant) => {
    mocks.auth.isAuthenticated = true;
    mocks.auth.username = "reader";
    mocks.api.bind.mockResolvedValue({ data: { grant } });
    const invitation = mountView(Invitation, { repository: repo, access: {} });
    await flushPromises();
    await button(invitation, "Have an Invitation?").trigger("click");
    await invitation
      .get('input[aria-label="Repository invitation code"]')
      .setValue("repo_old");
    await button(invitation, "Bind to my account").trigger("click");
    await flushPromises();
    expect(invitation.emitted("changed")).toBeUndefined();
    expect(invitation.text()).toContain("Contact the repository manager");
    invitation.unmount();
    const w = mountView(BindPage);
    await w.get('input[aria-label="Repository namespace"]').setValue("owner");
    await w.get('input[aria-label="Repository name"]').setValue("demo");
    await w
      .get('input[aria-label="Repository invitation code"]')
      .setValue("repo_old");
    await button(w, "Bind to my account").trigger("click");
    await flushPromises();
    expect(w.find('a[href="/models/owner/demo"]').exists()).toBe(false);
    expect(w.text()).toContain("Contact the repository manager");
    w.unmount();
  });
  it("does not store a late application receipt under the next repository", async () => {
    let complete;
    mocks.api.request.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const w = mountView(Invitation, { repository: repo, access: {} });
    await flushPromises();
    await w
      .get('input[aria-label="Application email"]')
      .setValue("person@example.com");
    await button(w, "Submit application").trigger("click");
    const other = { ...repo, name: "other" };
    await w.setProps({ repository: other });
    await flushPromises();
    complete({
      data: { receipt: "old_receipt", request: { status: "approved" } },
    });
    await flushPromises();
    expect(
      sessionStorage.getItem(`repository-request:${JSON.stringify(other)}`),
    ).toBeNull();
    expect(w.text()).not.toContain("Application status: approved");
    w.unmount();
  });
});
