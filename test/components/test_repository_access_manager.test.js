import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs } from "../helpers/vue";
const api = vi.hoisted(() => ({
  manage: vi.fn(),
  review: vi.fn(),
  issue: vi.fn(),
  revokeInvitation: vi.fn(),
  grant: vi.fn(),
  revokeGrant: vi.fn(),
}));
vi.mock("@/utils/api", () => ({ repositoryAccessAPI: api }));
import Manager from "@/components/repo/RepositoryAccessManager.vue";
const repo = { type: "model", namespace: "owner", name: "demo" };
const button = (w, text) => w.findAll("button").find((b) => b.text() === text);
describe("repository manager workflows", () => {
  it("never shows a late issued secret under a different repository", async () => {
    let complete;
    api.issue.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const w = await mountManager();
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
    api.manage
      .mockReturnValueOnce(
        new Promise((resolve) => {
          complete = resolve;
        }),
      )
      .mockResolvedValueOnce({
        data: { invitations: [{ id: 20, label: "Next repository" }] },
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
    await button(w, "Create repository code").trigger("click");
    const instance = w.vm;
    w.unmount();
    complete({ data: { token: "repo_detached_secret" } });
    await flushPromises();
    expect(instance.secret).toBe("");
  });
  it("labels expired codes and account grants as expired", async () => {
    api.manage.mockResolvedValueOnce({
      data: {
        invitations: [
          { id: 8, label: "Old code", expires_at: "2020-01-01T00:00:00Z" },
        ],
        grants: [
          { id: 9, username: "Old reader", expires_at: "2020-01-01T00:00:00Z" },
        ],
      },
    });
    const w = await mountManager();
    expect(w.text()).not.toContain("Read access");
    expect(w.text()).not.toContain("Active");
    expect(w.text().match(/Expired/g)).toHaveLength(2);
    w.unmount();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    api.manage.mockResolvedValue({
      data: {
        requests: [
          { id: 1, username: "reader", status: "pending", user_id: 3 },
          { id: 2, email: "anon@example.com", status: "approved" },
        ],
        invitations: [{ id: 4, label: "release", revoked_at: null }],
        grants: [{ id: 5, username: "reader", revoked_at: null }],
        guests: [],
        events: [],
      },
    });
    api.review.mockResolvedValue({});
    api.issue.mockResolvedValue({
      data: { token: "repo_once", invitation: { id: 9 } },
    });
    api.grant.mockResolvedValue({});
    api.revokeGrant.mockResolvedValue({});
    api.revokeInvitation.mockResolvedValue({});
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
    await button(w, "Approve").trigger("click");
    await flushPromises();
    expect(api.review).toHaveBeenCalledWith(repo, 1, { approve: true });
    expect(api.issue).not.toHaveBeenCalled();
    w.unmount();
  });
  it("issues a code for an approved anonymous application only when requested", async () => {
    const w = await mountManager();
    await button(w, "Prepare invitation").trigger("click");
    await button(w, "Create repository code").trigger("click");
    await flushPromises();
    expect(api.issue).toHaveBeenCalledWith(
      repo,
      expect.objectContaining({
        request_id: 2,
        expires_days: 7,
        max_redemptions: 1,
        max_guest_sessions: 1,
        guest_ttl_seconds: 86400,
      }),
    );
    expect(w.text()).toContain("repo_once");
    await button(w, "Hide secret").trigger("click");
    expect(w.text()).not.toContain("repo_once");
    w.unmount();
  });
  it("revokes an invitation separately from an account grant", async () => {
    const w = await mountManager();
    await button(w, "Revoke code").trigger("click");
    await flushPromises();
    expect(api.revokeInvitation).toHaveBeenCalledWith(repo, 4);
    expect(api.revokeGrant).not.toHaveBeenCalled();
    await button(w, "Revoke account access").trigger("click");
    await flushPromises();
    expect(api.revokeGrant).toHaveBeenCalledWith(repo, 5);
    w.unmount();
  });
});
