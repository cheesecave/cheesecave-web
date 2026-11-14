import { mount } from "@vue/test-utils";
import dayjs from "dayjs";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it, vi } from "vitest";
import RepositoryFiles from "@/components/repo/RepositoryFiles.vue";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

describe("shared repository file-list time cache", () => {
  it.each([false, true])(
    "formats a shared commit timestamp once across rows and rerenders (guest=%s)",
    async (guest) => {
      setActivePinia(createPinia());
      const format = vi.spyOn(dayjs.prototype, "fromNow");
      const timestamp = guest ? "2091-04-01T01:00:00Z" : "2091-04-02T01:00:00Z";
      const entries = Array.from({ length: 100 }, (_, index) => ({
        path: `file-${index}.txt`,
        type: "file",
        size: 100,
        lastCommit: { id: "head", title: "Shared commit", date: timestamp },
      }));
      const wrapper = mount(RepositoryFiles, {
        props: {
          repoType: "model",
          namespace: "owner",
          name: "demo",
          fileTree: entries,
          source: guest ? {} : null,
          getEntryHref: (file) => `/models/owner/demo/blob/main/${file.path}`,
          getCommitPath: () => "/models/owner/demo/commits/main",
        },
        global: {
          stubs: {
            ...ElementPlusStubs,
            RouterLink: RouterLinkStub,
            RepoLatestCommit: true,
            RepoHistoryLink: true,
          },
        },
      });
      try {
        expect(
          wrapper.findAll('[data-testid="filelist-row-link"]'),
        ).toHaveLength(100);
        expect(format).toHaveBeenCalledTimes(1);
        await wrapper.setProps({
          fileTree: [...entries, { ...entries[0], path: "extra.txt" }],
        });
        expect(
          wrapper.findAll('[data-testid="filelist-row-link"]'),
        ).toHaveLength(101);
        expect(format).toHaveBeenCalledTimes(1);
      } finally {
        wrapper.unmount();
        format.mockRestore();
      }
    },
  );
});
