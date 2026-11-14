import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs } from "../helpers/vue";
const api = vi.hoisted(() => ({
  manage: vi.fn(),
  review: vi.fn(),
  issue: vi.fn(),
}));
const confirm = vi.hoisted(() => vi.fn());
vi.mock("element-plus", async (importOriginal) => ({
  ...(await importOriginal()),
  ElMessageBox: { confirm },
}));
vi.mock("@/utils/api", () => ({ repositoryAccessAPI: api }));
import Manager from "@/components/repo/RepositoryAccessManager.vue";
const repo = { type: "model", namespace: "owner", name: "demo" };
const button = (w, text) => w.findAll("button").find((b) => b.text() === text);
const respond =
  (records) =>
  (_target, { section }) =>
    Promise.resolve({
      data: {
        [section]: records[section] || [],
        totals: { [section]: records[section]?.length || 0 },
      },
    });
const application = (w, text) =>
  w
    .get('table[aria-label="Applications"]')
    .findAll("tbody tr")
    .find((row) => row.text().includes(text));
describe("repository manager workflows", () => {
  it.each(["repository change", "unmount"])(
    "does not grant after a pending confirmation and %s",
    async (transition) => {
      let finish;
      confirm.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      const w = await mountManager();
      await button(application(w, "reader"), "Invite").trigger("click");
      expect(api.review).not.toHaveBeenCalled();
      if (transition === "repository change") {
        await w.setProps({ repository: { ...repo, name: "other" } });
        await flushPromises();
      } else w.unmount();
      finish();
      await flushPromises();
      expect(api.review).not.toHaveBeenCalled();
      if (transition === "repository change") w.unmount();
    },
  );
  it("never shows a late issued secret under a different repository", async () => {
    let complete;
    api.issue.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const w = await mountManager();
    if (!w.find("[data-el-dialog]").exists()) {
      await button(w, "Create code").trigger("click");
    }
    await button(w, "Create repository code").trigger("click");
    await w.setProps({ repository: { ...repo, name: "other" } });
    await flushPromises();
    complete({ data: { token: "repo_old_secret" } });
    await flushPromises();
    expect(w.text()).not.toContain("repo_old_secret");
    expect(w.vm.secret).toBe("");
    w.unmount();
  });
  it("ignores a late management response from the previous repository", async () => {
    let complete;
    api.manage.mockImplementation((target, { section }) => {
      if (target.name === repo.name && section === "invitations") {
        return new Promise((resolve) => {
          complete = resolve;
        });
      }
      return respond({ invitations: [{ id: 20, label: "Next repository" }] })(
        target,
        { section },
      );
    });
    const w = await mountManager();
    await w.setProps({ repository: { ...repo, name: "other" } });
    await flushPromises();
    complete({
      data: { invitations: [{ id: 1, label: "Previous repository" }] },
    });
    await flushPromises();
    expect(w.text()).toContain("Next repository");
    expect(w.text()).not.toContain("Previous repository");
    w.unmount();
  });
  it("does not write an issued secret after unmount", async () => {
    let complete;
    api.issue.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const w = await mountManager();
    if (!w.find("[data-el-dialog]").exists()) {
      await button(w, "Create code").trigger("click");
    }
    await button(w, "Create repository code").trigger("click");
    const instance = w.vm;
    w.unmount();
    complete({ data: { token: "repo_detached_secret" } });
    await flushPromises();
    expect(instance.secret).toBe("");
  });
  it("labels expired codes and account grants as expired", async () => {
    api.manage.mockImplementation(
      respond({
        invitations: [
          { id: 8, label: "Old code", expires_at: "2020-01-01T00:00:00Z" },
        ],
        grants: [
          { id: 9, username: "Old reader", expires_at: "2020-01-01T00:00:00Z" },
        ],
      }),
    );
    const w = await mountManager();
    expect(w.text()).not.toContain("Read access");
    expect(w.text()).not.toContain("Active");
    expect(w.text().match(/Expired/g)).toHaveLength(2);
    w.unmount();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    confirm.mockResolvedValue("confirm");
    api.manage.mockImplementation(
      respond({
        requests: [
          { id: 1, username: "reader", status: "pending", user_id: 3 },
          { id: 2, email: "anon@example.com", status: "approved" },
        ],
        invitations: [{ id: 4, label: "release", revoked_at: null }],
        grants: [{ id: 5, username: "reader", revoked_at: null }],
        guests: [],
        events: [],
      }),
    );
    api.review.mockResolvedValue({});
    api.issue.mockResolvedValue({
      data: { token: "repo_once", invitation: { id: 9 } },
    });
  });
  const mountManager = async () => {
    const w = mount(Manager, {
      props: { repository: repo },
      global: { stubs: ElementPlusStubs },
    });
    await flushPromises();
    return w;
  };
  it("reviews an account request directly, and signs no invitation on approval", async () => {
    const w = await mountManager();
    await button(application(w, "reader"), "Invite").trigger("click");
    await flushPromises();
    expect(confirm).toHaveBeenCalled();
    expect(api.review).toHaveBeenCalledWith(repo, 1, { approve: true });
    expect(api.issue).not.toHaveBeenCalled();
    w.unmount();
  });
  it("does not grant access when the Invite confirmation is cancelled", async () => {
    confirm.mockRejectedValueOnce("cancel");
    const w = await mountManager();
    await button(application(w, "reader"), "Invite").trigger("click");
    await flushPromises();
    expect(confirm).toHaveBeenCalled();
    expect(api.review).not.toHaveBeenCalled();
    expect(api.issue).not.toHaveBeenCalled();
    w.unmount();
  });
});
