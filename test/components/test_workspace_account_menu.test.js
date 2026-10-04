import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { h } from "vue";
import { ElementPlusStubs } from "../helpers/vue";
import WorkspaceAccountMenu from "@/components/home/workspace/WorkspaceAccountMenu.vue";
import WorkspaceViewSelector from "@/components/home/workspace/WorkspaceViewSelector.vue";
import WorkspaceScopeFilter from "@/components/home/workspace/WorkspaceScopeFilter.vue";
import EntityAvatar from "@/components/common/EntityAvatar.vue";

describe("shared workspace account menu", () => {
  const wrappers = [];
  afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));
  function render(component, props, slots) {
    const wrapper = mount(component, {
      props,
      slots,
      global: { stubs: ElementPlusStubs },
    });
    wrappers.push(wrapper);
    return wrapper;
  }
  const organizations = [{ name: "team?#" }, { name: "other-team" }];

  it("renders a supplied trigger and entity or conceptual avatars with selected state and an organization divider", async () => {
    const wrapper = render(
      WorkspaceAccountMenu,
      {
        modelValue: "all",
        label: "Available accounts",
        options: [
          { value: "all", label: "All", icon: "i-carbon-events" },
          { value: "self", label: "Self", username: "alice", name: "Alice" },
          {
            value: "org:team?#",
            label: "Team",
            username: "team?#",
            isOrg: true,
            divided: true,
          },
        ],
      },
      {
        trigger: () =>
          h("button", { "aria-label": "Choose account" }, "Select"),
      },
    );
    expect(wrapper.get('[aria-label="Choose account"]').element.tagName).toBe(
      "BUTTON",
    );
    expect(wrapper.get('[aria-label="Available accounts"]').exists()).toBe(
      true,
    );
    const rows = wrapper.findAllComponents({ name: "ElDropdownItem" });
    expect(rows.map((row) => row.attributes("command"))).toEqual([
      "all",
      "self",
      "org:team?#",
    ]);
    expect(rows.map((row) => row.vm.$attrs.divided)).toEqual([
      false,
      false,
      true,
    ]);
    expect(rows.map((row) => row.attributes("aria-current"))).toEqual([
      "true",
      undefined,
      undefined,
    ]);
    expect(rows[0].getComponent(EntityAvatar).props("icon")).toBe(
      "i-carbon-events",
    );
    expect(rows[0].getComponent({ name: "ElAvatar" }).props("src")).toBeFalsy();
    expect(rows[1].getComponent({ name: "ElAvatar" }).props("src")).toBe(
      "/api/users/alice/avatar",
    );
    const orgAvatar = rows[2].getComponent({ name: "ElAvatar" });
    expect(orgAvatar.props("src")).toBe("/api/organizations/team%3F%23/avatar");
    await orgAvatar.get("img").trigger("error");
    expect(orgAvatar.text()).toBe("TE");
    const dropdown = wrapper.getComponent({ name: "ElDropdown" });
    dropdown.vm.$emit("command", "org:team?#");
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("update:modelValue")).toEqual([["org:team?#"]]);
    expect(rows[0].find(".workspace-account-check").exists()).toBe(false);
    expect(rows[2].get(".workspace-account-check").exists()).toBe(true);
    expect(rows[2].attributes("aria-current")).toBe("true");
  });

  it("shares menu rendering while keeping workspace selection and activity scope separate", async () => {
    const workspace = render(WorkspaceViewSelector, {
      username: "alice",
      organizations,
    });
    const activity = render(WorkspaceScopeFilter, {
      username: "alice",
      organizations,
    });
    expect(workspace.findComponent(WorkspaceAccountMenu).exists()).toBe(true);
    expect(activity.findComponent(WorkspaceAccountMenu).exists()).toBe(true);
    expect(
      workspace
        .findAllComponents({ name: "ElDropdownItem" })
        .map((row) => row.attributes("command")),
    ).toEqual(["self", "org:team?#", "org:other-team"]);
    expect(
      activity
        .findAllComponents({ name: "ElDropdownItem" })
        .map((row) => row.attributes("command")),
    ).toEqual(["all", "self", "following", "org:team?#", "org:other-team"]);
    workspace
      .getComponent({ name: "ElDropdown" })
      .vm.$emit("command", "org:team?#");
    await workspace.vm.$nextTick();
    expect(workspace.get(".account-label strong").text()).toBe("team?#");
    expect(workspace.get(".account-label small").text()).toBe(
      "Organization workspace",
    );
    expect(activity.get(".scope-label").text()).toBe("All");
    expect(activity.emitted("update:modelValue")).toBeUndefined();
    activity
      .getComponent({ name: "ElDropdown" })
      .vm.$emit("command", "following");
    await activity.vm.$nextTick();
    expect(activity.get(".scope-label").text()).toBe("Following");
    expect(workspace.get(".account-label strong").text()).toBe("team?#");
    expect(workspace.emitted("update:modelValue")).toEqual([["org:team?#"]]);
    expect(activity.emitted("update:modelValue")).toEqual([["following"]]);
    await workspace.setProps({ modelValue: "org:team?#" });
    await workspace.setProps({ modelValue: "self" });
    expect(workspace.get(".account-label strong").text()).toBe("alice");
    expect(
      workspace
        .get('[aria-label="Select workspace"]')
        .getComponent(EntityAvatar)
        .props("isOrg"),
    ).toBe(false);
  });
});
