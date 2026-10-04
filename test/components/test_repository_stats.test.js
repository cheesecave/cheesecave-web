import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import RepositoryStats from "@/components/repo/RepositoryStats.vue";

describe("RepositoryStats", () => {
  afterEach(() => vi.useRealTimers());

  it("shows compact counts while keeping the exact totals accessible", () => {
    const wrapper = mount(RepositoryStats, {
      props: { repo: { downloads: 12345, likes: 1800 } },
    });
    expect(wrapper.get('[aria-label="12,345 downloads"]').text()).toBe("12.3K");
    expect(wrapper.get('[aria-label="1,800 likes"]').text()).toBe("1.8K");
    expect(wrapper.find(".repo-updated").exists()).toBe(false);
    wrapper.unmount();
  });

  it.each([undefined, null, -1, NaN, Infinity])(
    "displays zero for invalid or absent counters (%s)",
    (value) => {
      const wrapper = mount(RepositoryStats, {
        props: { repo: { downloads: value, likes: value } },
      });
      expect(wrapper.get('[aria-label="0 downloads"]').text()).toBe("0");
      expect(wrapper.get('[aria-label="0 likes"]').text()).toBe("0");
      wrapper.unmount();
    },
  );

  it("updates current counters and optionally displays the repository update time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T12:00:00Z"));
    const wrapper = mount(RepositoryStats, {
      props: {
        repo: { downloads: 7, likes: 3, lastModified: "2026-10-04T10:00:00Z" },
        showUpdated: true,
      },
    });
    expect(wrapper.get(".repo-updated").text()).toBe("Updated 2 hours ago");
    expect(wrapper.get(".repo-updated").attributes("title")).toBe(
      "2026-10-04T10:00:00Z",
    );
    await wrapper.setProps({ repo: { downloads: 8, likes: 4 } });
    expect(wrapper.get('[aria-label="8 downloads"]').text()).toBe("8");
    expect(wrapper.get('[aria-label="4 likes"]').text()).toBe("4");
    expect(wrapper.find(".repo-updated").exists()).toBe(false);
    wrapper.unmount();
  });
});
