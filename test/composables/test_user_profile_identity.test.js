import { computed, h, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import api, { getLocalProfileType } from "@/utils/api";
import { KIND } from "@/errors";
import { useUserProfileIdentity } from "@/composables/useUserProfileIdentity";

const mocks = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("vue-router/auto", async (original) => ({
  ...(await original()),
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

let wrapper;
let get;
beforeEach(() => {
  wrapper = undefined;
  vi.clearAllMocks();
  get = vi.spyOn(api, "get").mockResolvedValue({ data: { type: "user" } });
});
afterEach(() => wrapper?.unmount());

function mountIdentity(
  username = ref("alice"),
  organizationPath = computed(() => `/organizations/${username.value}`),
) {
  let identity;
  wrapper = mount({
    setup() {
      identity = useUserProfileIdentity(username, organizationPath);
      return () => h("div");
    },
  });
  return identity;
}

describe("independent local profile identity", () => {
  it("encodes the namespace and explicitly disables upstream fallback", async () => {
    await getLocalProfileType("a/b");
    expect(get).toHaveBeenCalledExactlyOnceWith("/api/users/a%2Fb/type", {
      params: { fallback: false },
    });
  });

  it("starts once on mount and accepts a local user without requiring a source or repository list", async () => {
    const pending = deferred();
    get.mockReturnValue(pending.promise);
    const identity = mountIdentity();
    expect(identity.identityLoading.value).toBe(true);
    expect(identity.identityMissing.value).toBe(false);
    expect(identity.localUserReady.value).toBe(false);
    expect(identity.isOrganization.value).toBe(false);
    expect(get).toHaveBeenCalledTimes(1);
    pending.resolve({ data: { type: "user" } });
    await flushPromises();
    expect(identity.localUserReady.value).toBe(true);
    expect(identity.identityLoading.value).toBe(false);
    expect(identity.identityError.value).toBeNull();
    expect(identity.identityMissing.value).toBe(false);
    expect(get).toHaveBeenCalledTimes(1);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it.each(["computed", "getter"])(
    "redirects a confirmed organization using a %s destination",
    async (kind) => {
      get.mockResolvedValue({ data: { type: "org", _source: "local" } });
      const destination = () => "/organizations/team/models";
      const identity = mountIdentity(
        ref("team"),
        kind === "computed" ? computed(destination) : destination,
      );
      await flushPromises();
      expect(identity.isOrganization.value).toBe(true);
      expect(identity.localUserReady.value).toBe(false);
      expect(identity.identityMissing.value).toBe(false);
      expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(
        "/organizations/team/models",
      );
    },
  );

  it("treats a local 404 as non-local without claiming the profile is missing", async () => {
    get.mockRejectedValue(failure(404));
    const identity = mountIdentity();
    await flushPromises();
    expect(identity.localUserReady.value).toBe(false);
    expect(identity.isOrganization.value).toBe(false);
    expect(identity.identityLoading.value).toBe(false);
    expect(identity.identityError.value).toBeNull();
    expect(identity.identityMissing.value).toBe(true);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it.each(["user", "org", "error", "cancelled"])(
    "clears a local miss during retry and keeps it clear after %s",
    async (result) => {
      get.mockRejectedValueOnce(failure(404));
      const identity = mountIdentity();
      await flushPromises();
      expect(identity.identityMissing.value).toBe(true);

      const retry = deferred();
      get.mockReturnValueOnce(retry.promise);
      const reloading = identity.reloadIdentity();
      expect(identity.identityLoading.value).toBe(true);
      expect(identity.identityMissing.value).toBe(false);

      if (result === "error") retry.reject(failure(503));
      else if (result === "cancelled") {
        retry.reject(Object.assign(new Error("Cancelled"), { code: "ERR_CANCELED" }));
      } else retry.resolve({ data: { type: result } });
      await reloading;
      expect(identity.identityMissing.value).toBe(false);
      expect(identity.identityLoading.value).toBe(false);
    },
  );

  it("exposes a decoded local error and retries identity independently", async () => {
    get.mockRejectedValueOnce(failure(503));
    const identity = mountIdentity();
    await flushPromises();
    expect(identity.identityError.value.kind).toBe(KIND.UNAVAILABLE);
    expect(identity.identityMissing.value).toBe(false);
    const retry = deferred();
    get.mockReturnValueOnce(retry.promise);
    const reloading = identity.reloadIdentity();
    expect(identity.identityLoading.value).toBe(true);
    expect(identity.identityError.value).toBeNull();
    retry.resolve({ data: { type: "user" } });
    await reloading;
    expect(identity.localUserReady.value).toBe(true);
    expect(identity.identityLoading.value).toBe(false);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("rejects the old namespace's response and redirect after a target change", async () => {
    const old = deferred();
    get.mockReturnValueOnce(old.promise);
    const username = ref("team");
    const identity = mountIdentity(username);
    username.value = "alice";
    await flushPromises();
    expect(identity.localUserReady.value).toBe(true);
    old.resolve({ data: { type: "org" } });
    await flushPromises();
    expect(identity.localUserReady.value).toBe(true);
    expect(identity.isOrganization.value).toBe(false);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(get).toHaveBeenLastCalledWith("/api/users/alice/type", {
      params: { fallback: false },
    });
  });

  it("ignores a superseded retry's error", async () => {
    const old = deferred();
    get.mockReturnValueOnce(old.promise);
    const identity = mountIdentity();
    await identity.reloadIdentity();
    old.reject(failure(404));
    await flushPromises();
    expect(identity.localUserReady.value).toBe(true);
    expect(identity.identityError.value).toBeNull();
    expect(identity.identityLoading.value).toBe(false);
    expect(identity.identityMissing.value).toBe(false);
  });

  it("does not apply or redirect a response after unmount", async () => {
    const pending = deferred();
    get.mockReturnValueOnce(pending.promise);
    const identity = mountIdentity();
    wrapper.unmount();
    pending.resolve({ data: { type: "org" } });
    await flushPromises();
    expect(identity.isOrganization.value).toBe(false);
    expect(mocks.replace).not.toHaveBeenCalled();
    await identity.reloadIdentity();
    expect(get).toHaveBeenCalledOnce();
  });

  it("does not expose a cancelled lookup as an error", async () => {
    get.mockRejectedValueOnce(
      Object.assign(new Error("Cancelled"), {
        code: "ERR_CANCELED",
      }),
    );
    const identity = mountIdentity();
    await flushPromises();
    expect(identity.identityLoading.value).toBe(false);
    expect(identity.identityError.value).toBeNull();
    expect(identity.identityMissing.value).toBe(false);
  });
});
