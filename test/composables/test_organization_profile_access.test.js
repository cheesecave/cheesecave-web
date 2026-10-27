import { h, reactive, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import api, { orgAPI } from "@/utils/api";
import { KIND } from "@/errors";
import { useOrganizationProfileAccess } from "@/composables/useOrganizationProfileAccess";

const mocks = vi.hoisted(() => ({ auth: null, route: null, replace: vi.fn() }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("vue-router/auto", async (original) => ({
  ...(await original()),
  useRoute: () => mocks.route,
  useRouter: () => ({ replace: mocks.replace }),
}));

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const failure = (status) =>
  Object.assign(new Error("Request failed"), {
    isAxiosError: true,
    response: { status, headers: {}, data: {} },
  });
const memberInfo = (role = "admin", name = "alice", organization = "team") => ({
  name,
  orgs: [{ name: organization, roleInOrg: role }],
});

let wrapper;
let get;
beforeEach(() => {
  wrapper = undefined;
  vi.clearAllMocks();
  mocks.route = reactive({ query: {}, hash: "#models" });
  mocks.auth = reactive({
    isAuthenticated: true,
    username: "alice",
    user: { id: "1" },
    token: null,
    fetchUserInfo: vi.fn().mockResolvedValue(memberInfo()),
  });
  get = vi.spyOn(api, "get").mockResolvedValue({ data: { type: "org" } });
});
afterEach(() => wrapper?.unmount());

function mountAccess(orgname = ref("team")) {
  let access;
  wrapper = mount({
    setup() {
      access = useOrganizationProfileAccess(orgname);
      return () => h("div");
    },
  });
  return access;
}

describe("independent organization profile access", () => {
  it("uses encoded profile endpoints through the shared authenticated API client", async () => {
    await orgAPI.getProfileInfo("a/b");
    expect(get).toHaveBeenLastCalledWith("/org/a%2Fb", {
      params: { fallback: true },
    });
    await orgAPI.getProfileReadme("a/b");
    expect(get).toHaveBeenLastCalledWith(
      "/spaces/a%2Fb/a%2Fb/resolve/main/README.md",
    );
    await orgAPI.getPublicQuota("a/b");
    expect(get).toHaveBeenLastCalledWith("/api/quota/a%2Fb/public", {
      withCredentials: true,
    });
  });

  it("starts identity and member role together without waiting for either", async () => {
    const identity = deferred();
    const role = deferred();
    get.mockReturnValueOnce(identity.promise);
    mocks.auth.fetchUserInfo.mockReturnValueOnce(role.promise);
    const access = mountAccess();
    expect(get).toHaveBeenCalledExactlyOnceWith("/api/users/team/type", {
      params: { fallback: false },
    });
    expect(mocks.auth.fetchUserInfo).toHaveBeenCalledExactlyOnceWith();
    expect(access.identityLoading.value).toBe(true);
    expect(access.roleLoading.value).toBe(true);
    expect(access.isMember.value).toBe(false);

    identity.resolve({ data: { type: "org" } });
    await flushPromises();
    expect(access.localOrgReady.value).toBe(true);
    expect(access.identityLoading.value).toBe(false);
    expect(access.roleLoading.value).toBe(true);
    role.resolve(memberInfo());
    await flushPromises();
    expect(access.userRole.value).toBe("admin");
    expect(access.isMember.value).toBe(true);
    expect(access.canManage.value).toBe(true);
    expect(access.roleLoading.value).toBe(false);
  });

  it("does not request membership for a signed-out visitor", async () => {
    mocks.auth.isAuthenticated = false;
    mocks.auth.username = null;
    mocks.auth.user = null;
    const access = mountAccess();
    await flushPromises();
    expect(access.localOrgReady.value).toBe(true);
    expect(access.roleLoading.value).toBe(false);
    expect(access.roleError.value).toBeNull();
    expect(access.isMember.value).toBe(false);
    expect(access.canManage.value).toBe(false);
    expect(mocks.auth.fetchUserInfo).not.toHaveBeenCalled();
  });

  it("filters visitor content before access resolves and lets a member toggle the preview", async () => {
    mocks.route.query = { view: "visitor", sort: "likes" };
    const pending = deferred();
    get.mockReturnValueOnce(pending.promise);
    mocks.auth.fetchUserInfo.mockResolvedValue(memberInfo("member"));
    const access = mountAccess();
    const repos = [
      { id: "public", private: false },
      { id: "private", private: true },
    ];
    expect(access.publicOnly.value).toBe(true);
    expect(access.visibleRepos(repos)).toEqual([repos[0]]);
    expect(access.profileLink("/organizations/team/models")).toBe(
      "/organizations/team/models?view=visitor",
    );
    await access.toggleVisitorView();
    expect(mocks.replace).not.toHaveBeenCalled();
    pending.resolve({ data: { type: "org" } });
    await flushPromises();
    expect(access.isMember.value).toBe(true);
    expect(access.canManage.value).toBe(false);
    expect(access.visitorView.value).toBe(true);
    await access.toggleVisitorView();
    expect(mocks.replace).toHaveBeenLastCalledWith({
      query: { sort: "likes" },
      hash: "#models",
    });
    mocks.route.query = { sort: "likes" };
    expect(access.visitorView.value).toBe(false);
    expect(access.publicOnly.value).toBe(false);
    expect(access.visibleRepos(repos)).toEqual(repos);
    await access.toggleVisitorView();
    expect(mocks.replace).toHaveBeenLastCalledWith({
      query: { sort: "likes", view: "visitor" },
      hash: "#models",
    });
  });

  it("clears access and hides cached private content immediately when the account changes", async () => {
    const access = mountAccess();
    await flushPromises();
    expect(access.canManage.value).toBe(true);
    const previous = deferred();
    mocks.auth.fetchUserInfo.mockReturnValueOnce(previous.promise);
    const reloading = access.reloadRole();
    mocks.auth.fetchUserInfo.mockResolvedValue(memberInfo("member", "bob"));
    mocks.auth.username = "bob";
    expect(access.isMember.value).toBe(false);
    expect(access.publicOnly.value).toBe(true);
    expect(access.visibleRepos([{ private: true }])).toEqual([]);
    await flushPromises();
    expect(access.userRole.value).toBe("member");
    expect(access.canManage.value).toBe(false);
    previous.resolve(memberInfo("super-admin"));
    await reloading;
    expect(access.userRole.value).toBe("member");
    expect(access.publicOnly.value).toBe(true);
    mocks.auth.isAuthenticated = false;
    expect(access.isMember.value).toBe(false);
    expect(access.userRole.value).toBeNull();
    expect(access.roleLoading.value).toBe(false);
  });

  it.each(["namespace", "retry", "unmount"])(
    "ignores obsolete identity and role responses after %s",
    async (change) => {
      const oldIdentity = deferred();
      const oldRole = deferred();
      get.mockReturnValueOnce(oldIdentity.promise);
      mocks.auth.fetchUserInfo.mockReturnValueOnce(oldRole.promise);
      const namespace = ref("team");
      const access = mountAccess(namespace);
      if (change === "unmount") wrapper.unmount();
      else {
        mocks.auth.fetchUserInfo.mockResolvedValue(
          memberInfo(
            "member",
            "alice",
            change === "namespace" ? "next" : "team",
          ),
        );
        if (change === "namespace") namespace.value = "next";
        else await Promise.all([access.reloadIdentity(), access.reloadRole()]);
      }
      await flushPromises();
      oldIdentity.reject(failure(404));
      oldRole.resolve(memberInfo("super-admin"));
      await flushPromises();
      expect(access.identityMissing.value).toBe(false);
      expect(access.identityError.value).toBeNull();
      expect(access.localOrgReady.value).toBe(change !== "unmount");
      expect(access.userRole.value).toBe(
        change === "unmount" ? null : "member",
      );
      if (change === "unmount") {
        await Promise.all([access.reloadIdentity(), access.reloadRole()]);
        expect(get).toHaveBeenCalledOnce();
        expect(mocks.auth.fetchUserInfo).toHaveBeenCalledOnce();
      }
    },
  );

  it.each([
    ["super-admin", true],
    ["admin", true],
    ["member", false],
    ["visitor", false],
  ])("grants %s membership with management=%s", async (role, canManage) => {
    mocks.auth.fetchUserInfo.mockResolvedValue(memberInfo(role));
    const access = mountAccess();
    await flushPromises();
    expect(access.isMember.value).toBe(true);
    expect(access.canManage.value).toBe(canManage);
  });

  it("accepts legacy roles but never adopts another account's cached role", async () => {
    mocks.auth.fetchUserInfo.mockResolvedValue({
      name: "alice",
      orgs: [{ name: "team", role: "admin" }],
    });
    const access = mountAccess();
    await flushPromises();
    expect(access.canManage.value).toBe(true);
    mocks.auth.fetchUserInfo.mockResolvedValue(memberInfo("admin", "bob"));
    await access.reloadRole();
    expect(access.isMember.value).toBe(false);
    expect(access.userRole.value).toBeNull();
    expect(access.roleLoading.value).toBe(false);
  });

  it.each(["404", "user"])(
    "identifies %s as a missing local organization without granting membership",
    async (result) => {
      if (result === "404") get.mockRejectedValueOnce(failure(404));
      else get.mockResolvedValueOnce({ data: { type: "user" } });
      const access = mountAccess();
      await flushPromises();
      expect(access.identityMissing.value).toBe(true);
      expect(access.identityError.value).toBeNull();
      expect(access.localOrgReady.value).toBe(false);
      expect(access.isMember.value).toBe(false);
      expect(access.canManage.value).toBe(false);
      const retry = deferred();
      get.mockReturnValueOnce(retry.promise);
      const reloading = access.reloadIdentity();
      expect(access.identityMissing.value).toBe(false);
      retry.resolve({ data: { type: "org" } });
      await reloading;
      expect(access.localOrgReady.value).toBe(true);
    },
  );

  it("keeps identity and role failures local and retries each independently", async () => {
    get.mockRejectedValueOnce(failure(503));
    mocks.auth.fetchUserInfo.mockRejectedValueOnce(failure(500));
    const access = mountAccess();
    await flushPromises();
    expect(access.identityError.value.kind).toBe(KIND.UNAVAILABLE);
    expect(access.identityMissing.value).toBe(false);
    expect(access.roleError.value).not.toBeNull();
    await access.reloadIdentity();
    expect(access.localOrgReady.value).toBe(true);
    expect(access.identityError.value).toBeNull();
    expect(access.roleError.value).not.toBeNull();
    expect(mocks.auth.fetchUserInfo).toHaveBeenCalledOnce();
    await access.reloadRole();
    expect(access.canManage.value).toBe(true);
    expect(access.roleError.value).toBeNull();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("ignores cancellation and invalid visitor query values", async () => {
    const cancelled = Object.assign(new Error("Cancelled"), {
      code: "ERR_CANCELED",
    });
    get.mockRejectedValueOnce(cancelled);
    mocks.auth.fetchUserInfo.mockRejectedValueOnce(cancelled);
    mocks.route.query.view = ["visitor"];
    const access = mountAccess();
    await flushPromises();
    expect(access.identityError.value).toBeNull();
    expect(access.roleError.value).toBeNull();
    expect(access.identityMissing.value).toBe(false);
    expect(access.identityLoading.value).toBe(false);
    expect(access.roleLoading.value).toBe(false);
    expect(access.publicOnly.value).toBe(false);
    expect(access.profileLink("/organizations/team")).toBe(
      "/organizations/team",
    );
    expect(access.visibleRepos()).toEqual([]);
  });
});
