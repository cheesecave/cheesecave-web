import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs } from "../helpers/vue";
const api = vi.hoisted(() => ({
  manage: vi.fn(),
  review: vi.fn(),
  issue: vi.fn(),
  grant: vi.fn(),
  revokeInvitation: vi.fn(),
  revokeGrant: vi.fn(),
  revokeGuest: vi.fn(),
}));
vi.mock("@/utils/api", () => ({ repositoryAccessAPI: api }));
import Manager from "@/components/repo/RepositoryAccessManager.vue";
const repository = { type: "dataset", namespace: "owner", name: "data" };
const records = () => ({
  requests: [
    {
      id: 11,
      user_id: 2,
      username: "reader",
      status: "pending",
      message: "Review this request",
      created_at: "2026-11-10T00:00:00Z",
    },
    {
      id: 12,
      email: "reviewer@example.com",
      status: "approved",
      message: "Anonymous review",
    },
  ],
  invitations: [
    {
      id: 21,
      label: "First code",
      expires_at: "2099-01-01T00:00:00Z",
      redemption_count: 2,
      max_redemptions: 4,
      guest_session_count: 3,
      max_guest_sessions: 8,
      guest_ttl_seconds: 3600,
    },
    { id: 22, label: "Second code", revoked_at: "2026-11-10T00:00:00Z" },
  ],
  grants: [
    {
      id: 31,
      username: "approved-reader",
      expires_at: null,
      created_at: "2026-11-10T00:00:00Z",
    },
    { id: 32, username: "revoked-reader", revoked_at: "2026-11-10T00:00:00Z" },
  ],
  guests: [
    {
      id: 41,
      invite_id: 21,
      created_at: "2026-11-10T00:00:00Z",
      expires_at: "2099-01-01T00:00:00Z",
    },
  ],
  events: [
    {
      id: 51,
      action: "guest_session_issued",
      actor_username: "owner",
      created_at: "2026-11-10T00:00:00Z",
    },
  ],
  limit: 100,
});
const mountManager = () =>
  mount(Manager, {
    props: { repository },
    global: { stubs: { ...ElementPlusStubs, ErrorState: true } },
  });
const namedTable = (w, name) => w.get(`table[aria-label="${name}"]`);
const rowWith = (table, text) =>
  table.findAll("tbody tr").find((row) => row.text().includes(text));
const button = (w, text) => w.findAll("button").find((b) => b.text() === text);
beforeEach(() => {
  vi.clearAllMocks();
  api.manage.mockResolvedValue({ data: records() });
  for (const key of [
    "review",
    "grant",
    "revokeInvitation",
    "revokeGrant",
    "revokeGuest",
  ])
    api[key].mockResolvedValue({});
  api.issue.mockResolvedValue({ data: { token: "repo_test_once" } });
});
describe("repository access management tables", () => {
  it("separates all five collections into named semantic tables with scoped scrolling", async () => {
    const w = mountManager();
    await flushPromises();
    for (const name of [
      "Applications",
      "Repository codes",
      "Account grants",
      "Visitor sessions",
      "Audit log",
    ]) {
      const table = namedTable(w, name);
      expect(table.findAll("thead th").length).toBeGreaterThan(2);
      expect(
        table.element.parentElement.classList.contains("access-table-scroll"),
      ).toBe(true);
    }
    expect(w.findAll("table")).toHaveLength(5);
    expect(
      namedTable(w, "Repository codes")
        .findAll("th")
        .map((c) => c.text()),
    ).toEqual([
      "Code",
      "Status",
      "Redeem by",
      "Accounts",
      "Visitors",
      "Visitor lifetime",
      "Actions",
    ]);
    expect(namedTable(w, "Audit log").text()).toContain("guest_session_issued");
    expect(namedTable(w, "Visitor sessions").text()).not.toContain(
      "guest_session_issued",
    );
    w.unmount();
  });
  it("displays separate usage counters, meaningful statuses and unknown values", async () => {
    const w = mountManager();
    await flushPromises();
    const codes = namedTable(w, "Repository codes");
    const first = rowWith(codes, "First code");
    expect(first.text()).toContain("2 / 4");
    expect(first.text()).toContain("3 / 8");
    expect(first.text()).toContain("1 hour");
    expect(first.text()).toContain("Active");
    const second = rowWith(codes, "Second code");
    expect(second.text()).toContain("Revoked");
    expect(second.text()).toContain("—");
    expect(second.text()).not.toContain("Infinity");
    expect(second.text()).not.toContain("undefined");
    expect(
      rowWith(namedTable(w, "Account grants"), "approved-reader").text(),
    ).toContain("No expiry");
    w.unmount();
  });
  it("binds each row action to its own record and keeps grant revocation separate", async () => {
    const w = mountManager();
    await flushPromises();
    await button(
      rowWith(namedTable(w, "Applications"), "reader"),
      "Approve",
    ).trigger("click");
    await flushPromises();
    expect(api.review).toHaveBeenLastCalledWith(repository, 11, {
      approve: true,
    });
    await button(
      rowWith(namedTable(w, "Repository codes"), "First code"),
      "Revoke",
    ).trigger("click");
    await flushPromises();
    expect(api.revokeInvitation).toHaveBeenLastCalledWith(repository, 21);
    expect(api.revokeGrant).not.toHaveBeenCalled();
    await button(
      rowWith(namedTable(w, "Account grants"), "approved-reader"),
      "Revoke",
    ).trigger("click");
    await flushPromises();
    expect(api.revokeGrant).toHaveBeenLastCalledWith(repository, 31);
    await button(
      rowWith(namedTable(w, "Visitor sessions"), "#41"),
      "Revoke",
    ).trigger("click");
    await flushPromises();
    expect(api.revokeGuest).toHaveBeenLastCalledWith(repository, 41);
    expect(
      rowWith(namedTable(w, "Repository codes"), "Second code")
        .find("button")
        .exists(),
    ).toBe(false);
    w.unmount();
  });
  it("keeps anonymous application association and the one-time secret workflow", async () => {
    const w = mountManager();
    await flushPromises();
    await button(
      rowWith(namedTable(w, "Applications"), "reviewer@example.com"),
      "Invite",
    ).trigger("click");
    expect(w.text()).toContain("For anonymous application #12");
    await button(w, "Create repository code").trigger("click");
    await flushPromises();
    expect(api.issue).toHaveBeenCalledWith(
      repository,
      expect.objectContaining({ request_id: 12 }),
    );
    expect(w.text()).toContain("repo_test_once");
    w.vm.issueDialogOpen = false;
    w.getComponent({ name: "ElDialog" }).vm.$emit("close");
    await flushPromises();
    expect(w.text()).not.toContain("repo_test_once");
    w.unmount();
  });
  it("represents each empty collection with a table row rather than a loose paragraph", async () => {
    api.manage.mockResolvedValueOnce({ data: {} });
    const w = mountManager();
    await flushPromises();
    for (const name of [
      "Applications",
      "Repository codes",
      "Account grants",
      "Visitor sessions",
      "Audit log",
    ]) {
      const table = namedTable(w, name);
      expect(table.findAll("tbody tr")).toHaveLength(1);
      expect(table.get("tbody td").attributes("colspan")).toBe(
        String(table.findAll("th").length),
      );
    }
    expect(w.text()).toContain("No visitor sessions.");
    expect(w.text()).toContain("No audit events.");
    w.unmount();
  });
  it("distinguishes initial loading from empty collections and clears stale loading", async () => {
    let finish;
    api.manage.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const w = mountManager();
    expect(w.get('[role="status"]').text()).toContain(
      "Loading repository access",
    );
    expect(w.attributes("aria-busy")).toBe("true");
    expect(w.text()).not.toContain("No applications.");
    await w.setProps({ repository: { ...repository, name: "other" } });
    await flushPromises();
    finish({ data: records() });
    await flushPromises();
    expect(w.attributes("aria-busy")).toBe("false");
    w.unmount();
  });
});
