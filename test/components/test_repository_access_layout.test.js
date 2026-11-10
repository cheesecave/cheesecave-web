import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, h, reactive } from "vue";
import { within } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const mocks = vi.hoisted(() => ({
  auth: null,
  getAccess: vi.fn(),
  getRequest: vi.fn(),
  guestTree: vi.fn(),
  guestPreview: vi.fn(),
  leaveGuest: vi.fn(),
  guestOverview: vi.fn(),
  guestCommits: vi.fn(),
  guestFileInfo: vi.fn(),
  ordinaryRead: vi.fn(),
  copy: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/stores/theme", () => ({ useThemeStore: () => ({ isDark: false }) }));
vi.mock("@/stores/markdownStyle", () => ({
  useMarkdownStyleStore: () => ({ resolved: "github" }),
}));
vi.mock("@/utils/api", () => ({
  repositoryAccessAPI: {
    getAccess: mocks.getAccess,
    getRequest: mocks.getRequest,
    guestTree: mocks.guestTree,
    guestPreview: mocks.guestPreview,
    leaveGuest: mocks.leaveGuest,
    guestOverview: mocks.guestOverview,
    guestCommits: mocks.guestCommits,
    guestFileInfo: mocks.guestFileInfo,
  },
  collectionsAPI: {},
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("@/utils/clipboard", () => ({ copyToClipboard: mocks.copy }));
vi.mock("element-plus", () => ({
  ElMessage: { success: mocks.success, error: mocks.error, warning: vi.fn() },
}));
import Gate from "@/components/repo/RepositoryAccessGate.vue";
import Invitation from "@/components/repo/RepositoryInvitationPage.vue";
import Visitor from "@/components/repo/RestrictedRepositoryViewer.vue";
import RepositoryHeader from "@/components/repo/RepositoryHeader.vue";

const wrappers = [];
function mountView(component, props) {
  const wrapper = mount(component, {
    props,
    attachTo: document.body,
    global: { stubs: { ...ElementPlusStubs, RouterLink: RouterLinkStub } },
  });
  wrappers.push(wrapper);
  return wrapper;
}
const repository = { type: "model", namespace: "owner", name: "invited" };
const query = (wrapper) => within(wrapper.element);

function expectRestrictedHeader(wrapper, visibility = "Invite") {
  expect(wrapper.findComponent(RepositoryHeader).exists()).toBe(true);
  const header = query(wrapper).getByRole("banner", {
    name: "Repository header",
  });
  expect(
    within(header).getByLabelText(`${visibility} repository`),
  ).toBeDefined();
  expect(
    within(header).queryByRole("button", { name: /Download|Clone|Like/ }),
  ).toBeNull();
  expect(within(header).queryByRole("link", { name: "Settings" })).toBeNull();
  expect(
    within(header).queryByRole("button", { name: /collection/i }),
  ).toBeNull();
  expect(wrapper.html()).not.toMatch(/\/resolve\/|\/api\/|https?:\/\//);
  return header;
}

describe("restricted repository pages share the normal repository header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth = reactive({ isAuthenticated: true, username: "reader" });
    mocks.getRequest.mockResolvedValue({ data: { request: null } });
    mocks.guestOverview.mockResolvedValue({
      data: {
        id: "owner/invited",
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
        entries: [{ path: "notes.txt", type: "file", preview_kind: "text" }],
      },
    });
    mocks.guestPreview.mockResolvedValue({
      data: { kind: "text", text: "Bounded text" },
    });
    mocks.leaveGuest.mockResolvedValue({});
  });
  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  });

  it.each([
    ["model", "Model", "models"],
    ["dataset", "Dataset", "datasets"],
    ["space", "Space", "spaces"],
  ])(
    "renders the %s repository identity without loading ordinary content",
    async (type, label, plural) => {
      const target = { ...repository, type };
      const route = reactive({
        path: `/${plural}/owner/invited/blob/main/secret.txt`,
      });
      mocks.getAccess.mockResolvedValue({
        data: {
          access: "invite",
          visibility: "invite",
          invite_markdown: "# Public invitation\nApply to join.",
        },
      });
      // Any ordinary repository component mount would trigger its protected reads.
      const OrdinaryContent = defineComponent({
        setup() {
          mocks.ordinaryRead();
          return () => h("p", "Private README and file tree");
        },
      });
      const wrapper = mountView(Gate, { route, component: OrdinaryContent });
      await flushPromises();
      const header = expectRestrictedHeader(wrapper);
      expect(
        within(header).getByRole("heading", { level: 1 }).textContent,
      ).toMatch(new RegExp(`${label}:.*owner.*invited`));
      expect(
        within(header)
          .getByRole("link", { name: "owner", exact: true })
          .getAttribute("href"),
      ).toBe("/owner");
      expect(
        within(header)
          .getByRole("link", { name: "invited", exact: true })
          .getAttribute("href"),
      ).toBe(`/${plural}/owner/invited`);
      const navigation = within(header).getByRole("navigation", {
        name: "Repository sections",
      });
      expect(
        within(navigation)
          .getByRole("link", { name: "Invitation" })
          .getAttribute("aria-current"),
      ).toBe("page");
      for (const label of ["Files", "Metadata"]) {
        expect(
          within(navigation).getByText(label).getAttribute("aria-disabled"),
        ).toBe("true");
        expect(
          within(navigation).queryByRole("link", { name: label }),
        ).toBeNull();
      }
      expect(
        query(wrapper).getByRole("heading", { name: "Public invitation" }),
      ).toBeDefined();
      expect(
        query(wrapper).getByRole("button", { name: "Submit application" }),
      ).toBeDefined();
      expect(
        query(wrapper).queryByRole("button", { name: "Bind to my account" }),
      ).toBeNull();
      await wrapper
        .findAll("button")
        .find((button) => button.text() === "Have an Invitation?")
        .trigger("click");
      expect(
        query(wrapper).getByRole("button", { name: "Bind to my account" }),
      ).toBeDefined();
      expect(mocks.getAccess).toHaveBeenCalledWith(target);
      expect(mocks.getRequest).toHaveBeenCalledWith(target, null);
      expect(mocks.ordinaryRead).not.toHaveBeenCalled();
      expect(mocks.guestTree).not.toHaveBeenCalled();
      expect(mocks.guestPreview).not.toHaveBeenCalled();
      expect(wrapper.text()).not.toContain("Private README and file tree");
    },
  );

  it.each(["invite", "private"])(
    "keeps a %s visitor in the bounded viewer with a normal repository header",
    async (visibility) => {
      mocks.getAccess.mockResolvedValue({
        data: { access: "guest", visibility },
      });
      const wrapper = mountView(Gate, {
        route: { path: "/models/owner/invited/tree/main" },
      });
      await flushPromises();
      const header = expectRestrictedHeader(
        wrapper,
        visibility === "invite" ? "Invite" : "Private",
      );
      expect(
        within(header).getByRole("button", { name: "End temporary access" }),
      ).toBeDefined();
      expect(
        within(header)
          .getByRole("link", { name: "Files" })
          .getAttribute("aria-current"),
      ).toBe("page");
      expect(mocks.guestTree).toHaveBeenCalledWith(repository, "", {
        search: "",
      });
      await wrapper
        .getComponent(Visitor)
        .findAll("a.guest-entry-name")
        .find((link) => link.text() === "notes.txt")
        .trigger("click");
      await flushPromises();
      expect(mocks.guestPreview).toHaveBeenCalledWith(repository, "notes.txt");
      expect(wrapper.text()).toContain("Bounded text");
      // Preview content comes only from the controlled endpoint.
      expect(mocks.ordinaryRead).not.toHaveBeenCalled();
      expect(wrapper.findComponent(Visitor).exists()).toBe(true);
      expect(wrapper.findComponent(Invitation).exists()).toBe(false);
    },
  );

  it("shows the ordinary model tag chips from controlled card metadata", async () => {
    mocks.getAccess.mockResolvedValue({
      data: { access: "guest", visibility: "invite" },
    });
    mocks.guestOverview.mockResolvedValue({
      data: {
        metadata: { license: "mit", tags: ["invitation-demo"] },
        readme: null,
      },
    });
    const wrapper = mountView(Gate, {
      route: { path: "/models/owner/invited" },
    });
    await flushPromises();
    const header = wrapper.get('[aria-label="Repository header"]').element;
    expect(
      within(header).getByRole("link", { name: "invitation-demo" }),
    ).toBeDefined();
    expect(mocks.ordinaryRead).not.toHaveBeenCalled();
  });

  it("updates the public header identity when the repository changes", async () => {
    const wrapper = mountView(Invitation, {
      repository,
      access: { visibility: "invite", invite_markdown: "# Apply" },
    });
    await flushPromises();
    await wrapper.setProps({
      repository: { type: "dataset", namespace: "team", name: "other" },
    });
    await flushPromises();
    const header = expectRestrictedHeader(wrapper);
    expect(
      within(header).getByRole("heading", { level: 1 }).textContent,
    ).toMatch(/Dataset:.*team.*other/);
    expect(
      within(header).queryByRole("link", { name: "invited", exact: true }),
    ).toBeNull();
    expect(
      within(header)
        .getByRole("link", { name: "other", exact: true })
        .getAttribute("href"),
    ).toBe("/datasets/team/other");
  });

  it.each([true, false])(
    "copies only the route-derived repository ID (clipboard success: %s)",
    async (success) => {
      mocks.copy.mockResolvedValue(success);
      const wrapper = mountView(Invitation, {
        repository,
        access: { visibility: "invite" },
      });
      await flushPromises();
      await wrapper
        .get('button[aria-label="Copy repository ID"]')
        .trigger("click");
      await flushPromises();
      expect(mocks.copy).toHaveBeenCalledWith("owner/invited");
      expect(success ? mocks.success : mocks.error).toHaveBeenCalledOnce();
      expect(success ? mocks.error : mocks.success).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    "preserves normal header download and clone controls (private: %s)",
    (privateRepo) => {
      const wrapper = mountView(RepositoryHeader, {
        repoType: "model",
        namespace: "owner",
        name: "ordinary",
        namespaceLink: "/owner",
        repoInfo: { private: privateRepo },
        tabs: [
          { key: "card", label: "Model Card", to: "/models/owner/ordinary" },
        ],
        activeTab: "card",
      });
      expect(
        query(wrapper).getByRole("button", { name: "Download" }),
      ).toBeDefined();
      expect(
        query(wrapper).getByRole("button", { name: "Clone" }),
      ).toBeDefined();
      expect(query(wrapper).queryByLabelText("Invite repository")).toBeNull();
      expect(
        query(wrapper).queryByLabelText("Private repository") !== null,
      ).toBe(privateRepo);
    },
  );
});
