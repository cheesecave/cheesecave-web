import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ElementPlusStubs } from "../helpers/vue";

const api = vi.hoisted(() => ({ manage: vi.fn(), review: vi.fn() }));
vi.mock("@/utils/api", () => ({ repositoryAccessAPI: api }));
import Manager from "@/components/repo/RepositoryAccessManager.vue";

const repository = { type: "model", namespace: "owner", name: "demo" };
const sections = {
  requests: "Applications",
  invitations: "Repository codes",
  grants: "Account grants",
  events: "Audit log",
};
let totals;
function response(section, offset) {
  return {
    data: {
      [section]: Array.from(
        { length: Math.max(0, Math.min(20, totals[section] - offset)) },
        (_, index) => ({
          id: offset + index + 1,
          username: `reader-${offset + index + 1}`,
          user_id: offset + index + 1,
          status: "pending",
          label: `code-${offset + index + 1}`,
          action: `event-${offset + index + 1}`,
        }),
      ),
      totals: { [section]: totals[section] },
    },
  };
}
const mountManager = () =>
  mount(Manager, {
    props: { repository },
    global: { stubs: { ...ElementPlusStubs, ErrorState: true } },
  });
const pager = (wrapper, name) =>
  wrapper.get(`[aria-label="${name} pagination"]`);
const goto = (wrapper, name, page) =>
  pager(wrapper, name)
    .get(`[data-el-pagination-page="${page}"]`)
    .trigger("click");
const table = (wrapper, name) => wrapper.get(`table[aria-label="${name}"]`);

beforeEach(() => {
  vi.resetAllMocks();
  totals = Object.fromEntries(Object.keys(sections).map((key) => [key, 137]));
  api.manage.mockImplementation((_repo, { section, offset }) =>
    Promise.resolve(response(section, offset)),
  );
});

describe("repository access pagination", () => {
  it("deduplicates repeated page-change events while that page is loading", async () => {
    const wrapper = mountManager();
    await flushPromises();
    let finish;
    api.manage.mockClear();
    api.manage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const control = wrapper.findAllComponents({ name: "ElPagination" })[0];
    control.vm.$emit("current-change", 2);
    control.vm.$emit("current-change", 2);
    await flushPromises();
    expect(api.manage).toHaveBeenCalledTimes(1);
    finish(response("requests", 20));
    await flushPromises();
    expect(table(wrapper, "Applications").text()).toContain("reader-21");
    wrapper.unmount();
  });
  it("loads four independent pages and exposes records beyond the first hundred", async () => {
    const wrapper = mountManager();
    await flushPromises();
    expect(api.manage).toHaveBeenCalledTimes(4);
    for (const [section, name] of Object.entries(sections)) {
      expect(api.manage).toHaveBeenCalledWith(repository, {
        section,
        limit: 20,
        offset: 0,
      });
      expect(table(wrapper, name).findAll("tbody tr")).toHaveLength(20);
    }
    for (const [section, name] of Object.entries(sections)) {
      api.manage.mockClear();
      await goto(wrapper, name, 7);
      await flushPromises();
      expect(api.manage).toHaveBeenCalledTimes(1);
      expect(api.manage).toHaveBeenLastCalledWith(repository, {
        section,
        limit: 20,
        offset: 120,
      });
      expect(table(wrapper, name).findAll("tbody tr")).toHaveLength(17);
      expect(table(wrapper, name).text()).toContain(
        section === "invitations"
          ? "code-121"
          : section === "events"
            ? "event-121"
            : "reader-121",
      );
    }
    expect(wrapper.text()).not.toContain("Up to");
    expect(wrapper.text()).not.toContain("More records");
    expect(wrapper.find('table[aria-label="Visitor sessions"]').exists()).toBe(
      false,
    );
    wrapper.unmount();
  });

  it("keeps other tables in place during a page request, and retries a failed page", async () => {
    const wrapper = mountManager();
    await flushPromises();
    let reject;
    api.manage.mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    await goto(wrapper, "Applications", 2);
    expect(
      pager(wrapper, "Applications")
        .get("[data-el-pagination-next]")
        .attributes("disabled"),
    ).toBeDefined();
    expect(
      pager(wrapper, "Repository codes")
        .get("[data-el-pagination-next]")
        .attributes("disabled"),
    ).toBeUndefined();
    expect(table(wrapper, "Account grants").text()).toContain("reader-1");
    reject(new Error("Page unavailable"));
    await flushPromises();
    expect(
      pager(wrapper, "Applications").get('[data-active="true"]').text(),
    ).toBe("1");
    expect(wrapper.findComponent({ name: "ErrorState" }).exists()).toBe(true);
    await wrapper.findComponent({ name: "ErrorState" }).props("retry")();
    await flushPromises();
    expect(api.manage).toHaveBeenLastCalledWith(repository, {
      section: "requests",
      limit: 20,
      offset: 20,
    });
    expect(table(wrapper, "Applications").text()).toContain("reader-21");
    expect(wrapper.findComponent({ name: "ErrorState" }).exists()).toBe(false);
    wrapper.unmount();
  });

  it("clamps a page after records disappear without resetting the other tables", async () => {
    const wrapper = mountManager();
    await flushPromises();
    await goto(wrapper, "Repository codes", 7);
    await flushPromises();
    totals.invitations = 21;
    api.manage.mockClear();
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Refresh")
      .trigger("click");
    await flushPromises();
    expect(api.manage).toHaveBeenCalledWith(repository, {
      section: "invitations",
      limit: 20,
      offset: 20,
    });
    expect(
      pager(wrapper, "Repository codes").get('[data-active="true"]').text(),
    ).toBe("2");
    expect(table(wrapper, "Repository codes").text()).toContain("code-21");
    expect(
      pager(wrapper, "Applications").get('[data-active="true"]').text(),
    ).toBe("1");
    wrapper.unmount();
  });

  it("resets every page on repository changes and ignores a late previous-repository page", async () => {
    const wrapper = mountManager();
    await flushPromises();
    let resolve;
    api.manage.mockImplementationOnce(
      () =>
        new Promise((finish) => {
          resolve = finish;
        }),
    );
    await goto(wrapper, "Applications", 7);
    await wrapper.setProps({ repository: { ...repository, name: "other" } });
    await flushPromises();
    resolve(response("requests", 120));
    await flushPromises();
    expect(table(wrapper, "Applications").text()).toContain("reader-1");
    expect(table(wrapper, "Applications").text()).not.toContain("reader-121");
    for (const name of Object.values(sections)) {
      expect(pager(wrapper, name).get('[data-active="true"]').text()).toBe("1");
    }
    wrapper.unmount();
  });
});
