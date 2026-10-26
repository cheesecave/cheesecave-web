import { mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";

import { RouterLinkStub } from "../helpers/vue";
import LinkPager from "@/components/discovery/LinkPager.vue";

const target = (page) => `/list?page=${page}`;

function mountPager(currentPage, pages, props = {}) {
  return mount(LinkPager, {
    props: { currentPage, pageSize: 10, total: pages * 10, target, ...props },
    global: { stubs: { RouterLink: RouterLinkStub } },
  });
}

// What the visitor reads, left to right: numbers, and "…" for a jump
const shown = (wrapper) =>
  wrapper
    .findAll("nav > *")
    .map((item) => item.text())
    .filter((text) => text !== "");

describe("LinkPager", () => {
  it("shows every page when there are few", () => {
    expect(shown(mountPager(2, 3))).toEqual(["1", "2", "3"]);
  });

  it.each([
    [1, ["1", "2", "3", "4", "…", "11"]],
    [3, ["1", "2", "3", "4", "…", "11"]],
    [4, ["1", "…", "3", "4", "5", "…", "11"]],
    [6, ["1", "…", "5", "6", "7", "…", "11"]],
    [8, ["1", "…", "7", "8", "9", "…", "11"]],
    [9, ["1", "…", "8", "9", "10", "11"]],
    [11, ["1", "…", "8", "9", "10", "11"]],
  ])(
    "on page %i of 11 it shows %j, as the Element Plus pager did",
    (page, expected) => {
      expect(shown(mountPager(page, 11))).toEqual(expected);
    },
  );

  it("makes every other page a real link, and the open page a marked non-link", () => {
    const wrapper = mountPager(6, 11);
    const links = wrapper
      .findAll("a")
      .map((link) => [link.text(), link.attributes("href")]);
    expect(links).toContainEqual(["1", "/list?page=1"]);
    expect(links).toContainEqual(["5", "/list?page=5"]);
    expect(links).toContainEqual(["7", "/list?page=7"]);
    expect(links).toContainEqual(["11", "/list?page=11"]);
    const current = wrapper.get("[aria-current='page']");
    expect(current.text()).toBe("6");
    expect(current.element.tagName).toBe("SPAN");
    expect(wrapper.findAll("a").some((link) => link.text() === "6")).toBe(
      false,
    );
  });

  it("names each page for a screen reader", () => {
    const labels = mountPager(1, 3)
      .findAll("a")
      .map((a) => a.attributes("aria-label"));
    expect(labels).toContain("Page 2");
    expect(labels).toContain("Page 3");
  });

  it("links previous and next, as rel links, and replaces history like the page did", () => {
    const wrapper = mountPager(5, 9);
    const prev = wrapper.get("a[rel='prev']");
    const next = wrapper.get("a[rel='next']");
    expect([prev.attributes("href"), next.attributes("href")]).toEqual([
      "/list?page=4",
      "/list?page=6",
    ]);
    expect([
      prev.attributes("aria-label"),
      next.attributes("aria-label"),
    ]).toEqual(["Previous page", "Next page"]);
    for (const link of wrapper.findAll("a"))
      expect(link.attributes("replace")).toBeDefined();
  });

  it("shows previous as unavailable, not as a link, on the first page, and next on the last", () => {
    const first = mountPager(1, 5);
    expect(first.find("a[rel='prev']").exists()).toBe(false);
    expect(first.get("[aria-disabled='true']").attributes("aria-label")).toBe(
      "Previous page",
    );
    expect(first.find("a[rel='next']").exists()).toBe(true);
    const last = mountPager(5, 5);
    expect(last.find("a[rel='next']").exists()).toBe(false);
    expect(last.get("[aria-disabled='true']").attributes("aria-label")).toBe(
      "Next page",
    );
  });

  it("jumps three pages from an ellipsis, and never past either end", () => {
    const middle = mountPager(6, 11);
    expect(
      middle.get("a[aria-label='Previous 3 pages']").attributes("href"),
    ).toBe("/list?page=3");
    expect(middle.get("a[aria-label='Next 3 pages']").attributes("href")).toBe(
      "/list?page=9",
    );
    const near = mountPager(4, 11);
    expect(
      near.get("a[aria-label='Previous 3 pages']").attributes("href"),
    ).toBe("/list?page=1");
    const end = mountPager(8, 11);
    expect(end.get("a[aria-label='Next 3 pages']").attributes("href")).toBe(
      "/list?page=11",
    );
  });

  it("counts pages from the total and the page size, and has at least one", () => {
    expect(shown(mountPager(1, 0, { total: 25, pageSize: 10 }))).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(shown(mountPager(1, 0, { total: 0 }))).toEqual(["1"]);
  });

  it("has a landmark of its own", () => {
    expect(mountPager(1, 3).get("nav").attributes("aria-label")).toBe(
      "Pagination",
    );
  });

  // The real RouterLink marks every link to the open route (query is not compared) as the
  // current page; a stub cannot show it, so this one runs against a real router.
  it("marks only the open page as current, not every link to the same route", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/list", component: { render: () => null } }],
    });
    await router.push("/list");
    const wrapper = mount(LinkPager, {
      props: {
        currentPage: 6,
        pageSize: 10,
        total: 110,
        target: (page) => ({ path: "/list", query: { page } }),
      },
      global: { plugins: [router] },
    });
    const current = wrapper.findAll("[aria-current]");
    expect(current).toHaveLength(1);
    expect(current[0].text()).toBe("6");
    expect(wrapper.get("a[rel='next']").attributes("href")).toBe(
      "/list?page=7",
    );
  });
});
