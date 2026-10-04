import { mount } from "@vue/test-utils";
import { h, nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import EntityAvatar from "@/components/common/EntityAvatar.vue";
import {
  buildEntityAvatarUrl,
  buildEntityProfilePath,
  invalidateEntityAvatar,
} from "@/utils/entity-avatar";

describe("shared entity avatars", () => {
  const wrappers = [];
  const render = (props = {}) => {
    const wrapper = mount(EntityAvatar, { props });
    wrappers.push(wrapper);
    return wrapper;
  };
  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
    vi.restoreAllMocks();
  });

  it("uses encoded user and organization endpoints and profile paths", async () => {
    const wrapper = render({ username: "team?#", name: "Research group" });
    expect(wrapper.get("img").attributes("src")).toBe(
      "/api/users/team%3F%23/avatar",
    );
    expect(buildEntityProfilePath("team?#")).toBe("/team%3F%23");
    await wrapper.setProps({ isOrg: true });
    expect(wrapper.get("img").attributes("src")).toBe(
      "/api/organizations/team%3F%23/avatar",
    );
    expect(buildEntityProfilePath("team?#", true)).toBe(
      "/organizations/team%3F%23",
    );
    expect(buildEntityProfilePath(null)).toBeNull();
  });

  it("uses Element Plus error fallback and retries when the entity or source changes", async () => {
    const wrapper = render({ username: "alice", name: "Alice", size: 36 });
    expect(wrapper.getComponent({ name: "ElAvatar" }).props("size")).toBe(36);
    await wrapper.get("img").trigger("error");
    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.text()).toBe("AL");
    await wrapper.setProps({ username: "builder", name: "" });
    expect(wrapper.get("img").attributes("src")).toBe(
      "/api/users/builder/avatar",
    );
    await wrapper.get("img").trigger("error");
    expect(wrapper.text()).toBe("BU");
    await wrapper.setProps({ src: "/images/new-avatar.png" });
    expect(wrapper.get("img").attributes("src")).toBe("/images/new-avatar.png");
  });

  it("does not request an avatar for conceptual choices or unknown actors", () => {
    const unknown = render();
    expect(unknown.find("img").exists()).toBe(false);
    expect(unknown.find(".i-carbon-user-avatar").exists()).toBe(true);
    const following = render({ icon: "i-carbon-group", name: "Following" });
    expect(following.find("img").exists()).toBe(false);
    expect(following.find(".i-carbon-group").exists()).toBe(true);
  });

  it("preserves external signed and unrelated local image URLs", async () => {
    const external =
      "https://cdn.example/avatar.png?signature=a%2Fb&v=original";
    const wrapper = render({
      username: "external-avatar",
      src: external,
      version: 123,
    });
    invalidateEntityAvatar("external-avatar");
    await nextTick();
    expect(wrapper.get("img").attributes("src")).toBe(external);
    await wrapper.setProps({ src: "/images/custom-avatar.svg?theme=dark" });
    expect(wrapper.get("img").attributes("src")).toBe(
      "/images/custom-avatar.svg?theme=dark",
    );
  });

  it("keeps URLs stable across unrelated rerenders and updates only when their version changes", async () => {
    const wrapper = render({
      username: "stable-avatar",
      version: "2026-10-04",
    });
    const source = wrapper.get("img").attributes("src");
    await wrapper.setProps({ size: 48, name: "New name" });
    expect(wrapper.get("img").attributes("src")).toBe(source);
    await wrapper.setProps({ version: "2026-10-05" });
    expect(wrapper.get("img").attributes("src")).not.toBe(source);
  });

  it("refreshes every mounted instance of the edited entity and retries failed images", async () => {
    const name = "refresh-avatar";
    const endpoint = `/api/users/${name}/avatar`;
    const wrapper = mount({
      render: () =>
        h("div", [
          h(EntityAvatar, { username: name }),
          h(EntityAvatar, { username: name, avatarUrl: `${endpoint}?t=stale` }),
          h(EntityAvatar, { username: name, isOrg: true }),
        ]),
    });
    wrappers.push(wrapper);
    const avatars = wrapper.findAllComponents(EntityAvatar);
    await avatars[0].get("img").trigger("error");
    vi.spyOn(Date, "now").mockReturnValue(1000);
    invalidateEntityAvatar(name);
    await nextTick();
    const source = avatars[0].get("img").attributes("src");
    expect(source).toBe(`${endpoint}?v=1000`);
    expect(avatars[1].get("img").attributes("src")).toBe(source);
    expect(avatars[2].get("img").attributes("src")).toBe(
      `/api/organizations/${name}/avatar`,
    );
    invalidateEntityAvatar(name);
    await nextTick();
    expect(avatars[0].get("img").attributes("src")).toBe(`${endpoint}?v=1001`);
  });

  it("handles missing identities and only cache-invalidates the matching local endpoint", () => {
    expect(buildEntityAvatarUrl()).toBeUndefined();
    expect(
      buildEntityAvatarUrl({
        username: "alice",
        src: "/api/users/bob/avatar",
        version: 2,
      }),
    ).toBe("/api/users/bob/avatar");
    expect(buildEntityAvatarUrl({ username: "unversioned" })).toBe(
      "/api/users/unversioned/avatar",
    );
  });
});
