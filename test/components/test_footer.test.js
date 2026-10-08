import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSiteBrandingStore } from "@/stores/siteBranding";
import { useSiteAppearanceStore } from "@/stores/siteAppearance";
import {
  CACHE_KEY,
  DEFAULT_APPEARANCE,
  FOOTER_ATTRIBUTION,
} from "../../src/shared/site-appearance.js";
import TheFooter from "@/components/layout/TheFooter.vue";
import SiteAttribution from "@/components/layout/SiteAttribution.vue";
import WorkspaceTrending from "@/components/home/workspace/WorkspaceTrending.vue";
import { RouterLinkStub, ElementPlusStubs } from "../helpers/vue";

const commit = "0123456789abcdef0123456789abcdef01234567";
const legacyOverride = {
  project_label: "Spoofed project",
  project_url: "https://github.com/Example/Unrelated",
  upstream_label: "Spoofed upstream",
  upstream_url: "javascript:alert(1)",
  copyright_text: "© Someone else",
  license_label: "Unrestricted",
  license_url: "https://example.com/fake-license",
};
const customGroups = [
  {
    title: "Community",
    links: [{ label: "Our docs", url: "/community-docs" }],
  },
];
const response = (value) => ({
  ok: true,
  headers: new Headers(),
  json: async () => value,
});
function expectFixedCredits(wrapper) {
  const credit = wrapper.get(".footer-attribution");
  expect(credit.text()).toContain("Powered by DeepGHS · Based on KohakuHub");
  expect(credit.text()).toContain("Derived from KohakuHub © 2025 KohakuBlueLeaf and contributors");
  expect(credit.get(`a[href="${FOOTER_ATTRIBUTION.project_url}"]`).text()).toBe(
    FOOTER_ATTRIBUTION.project_label,
  );
  expect(
    credit.get(`a[href="${FOOTER_ATTRIBUTION.upstream_url}"]`).text(),
  ).toBe(FOOTER_ATTRIBUTION.upstream_label);
  expect(credit.get(`a[href="${FOOTER_ATTRIBUTION.license_url}"]`).text()).toBe(
    FOOTER_ATTRIBUTION.license_label,
  );
  expect(
    credit.get('a[href="https://github.com/cheesecave/cheesecave-web"]').text(),
  ).toBe("CheeseCave");
  expect(
    credit
      .get(
        'a[href="https://github.com/cheesecave/cheesecave-web/blob/main/LICENSE"]',
      )
      .text(),
  ).toBe("Project license");
  expect(credit.text()).not.toContain("Spoofed");
  expect(credit.text()).not.toContain("Someone else");
  expect(credit.find('a[href^="javascript:"]').exists()).toBe(false);
}

describe("TheFooter", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal("__BUILD_INFO__", { commit, dirty: false });
  });

  it.each([false, true])("shows the frontend commit with dirty=%s", (dirty) => {
    vi.stubGlobal("__BUILD_INFO__", { commit, dirty });
    const version = mount(TheFooter).get('[data-testid="frontend-version"]');
    expect(version.text()).toBe(`Frontend 0123456${dirty ? "-dirty" : ""}`);
    expect(version.attributes("title")).toContain(commit);
    expect(version.attributes("title").includes("uncommitted changes")).toBe(
      dirty,
    );
    expect(version.get("a").attributes("href")).toBe(
      `https://github.com/cheesecave/cheesecave-web/commit/${commit}`,
    );
    expect(version.get("a").attributes("rel")).toBe("noopener noreferrer");
  });

  it("shows an explicit unknown version when metadata is unavailable", () => {
    vi.stubGlobal("__BUILD_INFO__", { commit: "unknown", dirty: false });
    const version = mount(TheFooter).get('[data-testid="frontend-version"]');
    expect(version.text()).toBe("Frontend unknown");
    expect(version.attributes("title")).toBe("Frontend Git commit unavailable");
    expect(version.find("a").exists()).toBe(false);
  });

  it("groups navigation by usage, open source and policies while retaining fixed credits", () => {
    const wrapper = mount(TheFooter);
    expect(wrapper.findAll("h3").map((heading) => heading.text())).toEqual([
      "CheeseCave",
      "Using this hub",
      "Open source",
      "Policies",
    ]);
    expectFixedCredits(wrapper);
    expect(wrapper.findAll("a").map((link) => link.attributes("href"))).toEqual(
      expect.arrayContaining([
        "/docs",
        "/get-started",
        "/about",
        "/self-hosted",
        "/terms",
        "/privacy",
        "https://github.com/cheesecave/cheesecave-web/issues",
        "https://discord.gg/xWYrkyvJ2s",
      ]),
    );
    for (const link of wrapper.findAll('a[target="_blank"]'))
      expect(link.attributes("rel")).toBe("noopener noreferrer");
  });

  it("renders configurable group labels as plain text and can hide build details without hiding credits", async () => {
    const store = useSiteAppearanceStore();
    const wrapper = mount(TheFooter);
    store.apply({
      footer: {
        groups: [
          {
            title: "<b>Explore</b>",
            links: [{ label: "<img src=x>", url: "/discover" }],
          },
        ],
        show_build_info: false,
      },
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll("h3").map((heading) => heading.text())).toEqual([
      "CheeseCave",
      "<b>Explore</b>",
    ]);
    expect(wrapper.find("b").exists()).toBe(false);
    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.get('a[href="/discover"]').text()).toBe("<img src=x>");
    expect(
      wrapper.get('a[href="/discover"]').attributes("target"),
    ).toBeUndefined();
    expect(wrapper.find('[data-testid="frontend-version"]').exists()).toBe(
      false,
    );
    expectFixedCredits(wrapper);
  });

  it("updates branding introduction independently of fixed upstream attribution", async () => {
    const store = useSiteBrandingStore();
    const wrapper = mount(TheFooter);
    store.apply({
      ...store.branding,
      site_name: "DeepGHS Hub",
      footer_description: "A community model hub.\nModels and datasets.",
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.find("h3").text()).toBe("DeepGHS Hub");
    expect(wrapper.get(".whitespace-pre-wrap").text()).toBe(
      "A community model hub.\nModels and datasets.",
    );
    expectFixedCredits(wrapper);
  });

  it.each(["API", "cache"])(
    "does not accept protected attribution overrides from an old %s payload",
    async (source) => {
      const oldAppearance = {
        footer: {
          ...DEFAULT_APPEARANCE.footer,
          ...legacyOverride,
          groups: customGroups,
        },
        theme: {
          ...DEFAULT_APPEARANCE.theme,
          default_mode: "dark",
          primary_dark: "#aa6633",
        },
      };
      if (source === "cache")
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ version: 1, appearance: oldAppearance }),
        );
      const store = useSiteAppearanceStore();
      const wrapper = mount(TheFooter);
      if (source === "API") {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue(response(oldAppearance)),
        );
        expect(await store.refresh()).toBe(true);
      }
      await flushPromises();
      expectFixedCredits(wrapper);
      expect(
        wrapper.get('[data-testid="frontend-version"] a').attributes("href"),
      ).toBe(`https://github.com/cheesecave/cheesecave-web/commit/${commit}`);
      expect(wrapper.get('a[href="/community-docs"]').text()).toBe("Our docs");
      expect(store.theme.primary_dark).toBe("#aa6633");
      expect(store.footer).toEqual({
        groups: customGroups,
        show_build_info: true,
      });
    },
  );

  it("uses fixed build provenance even if an in-memory legacy footer object carries protected fields", () => {
    const store = useSiteAppearanceStore();
    Object.assign(store.appearance.footer, legacyOverride);
    const wrapper = mount(TheFooter);
    expectFixedCredits(wrapper);
    expect(
      wrapper.get('[data-testid="frontend-version"] a').attributes("href"),
    ).toBe(`https://github.com/cheesecave/cheesecave-web/commit/${commit}`);
  });

  it("can remove all navigation groups while keeping the site description and fixed credits", () => {
    useSiteAppearanceStore().apply({ footer: { groups: [] } });
    const wrapper = mount(TheFooter);
    expect(wrapper.findAll("h3")).toHaveLength(1);
    expect(wrapper.text()).toContain("Self-hosted HuggingFace Hub alternative");
    expectFixedCredits(wrapper);
  });
  it("reuses the fixed footer attribution under the workspace resources with compact layout", () => {
    const wrapper = mount(WorkspaceTrending, {
      global: { stubs: { ...ElementPlusStubs, RouterLink: RouterLinkStub } },
    });
    expectFixedCredits(wrapper);
    const credit = wrapper.getComponent(SiteAttribution);
    expect(credit.props("compact")).toBe(true);
    expect(wrapper.findAll(".footer-attribution")).toHaveLength(1);
    expect(wrapper.get(".workspace-footer").element.nextElementSibling).toBe(
      credit.element,
    );
    expect(credit.get('[data-testid="frontend-version"]').text()).toBe(
      "Frontend 0123456",
    );
    for (const link of credit.findAll('a[target="_blank"]'))
      expect(link.attributes("rel")).toBe("noopener noreferrer");
    expect(
      mount(TheFooter).getComponent(SiteAttribution).props("compact"),
    ).toBe(false);
    wrapper.unmount();
  });

  it("honors build visibility in the workspace while always retaining protected credits", async () => {
    const wrapper = mount(WorkspaceTrending, {
      global: { stubs: { ...ElementPlusStubs, RouterLink: RouterLinkStub } },
    });
    useSiteAppearanceStore().apply({
      footer: { ...legacyOverride, show_build_info: false },
    });
    await wrapper.vm.$nextTick();
    expectFixedCredits(wrapper);
    expect(wrapper.find('[data-testid="frontend-version"]').exists()).toBe(
      false,
    );
    wrapper.unmount();
  });
});
