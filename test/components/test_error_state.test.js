import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import ErrorState from "@/components/common/ErrorState.vue";
import { AppError, KIND } from "@/errors";
import { describeError } from "@/errors/copy";
import { ElementPlusStubs, RouterLinkStub } from "../helpers/vue";

const clipboard = vi.hoisted(() => ({
  copyToClipboard: vi.fn(async () => true),
}));
vi.mock("@/utils/clipboard", () => clipboard);

// ErrorState shows the fallback sources in an el-table
const ElTableStub = defineComponent({
  name: "ElTable",
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => {
      const cols = (slots.default?.() ?? []).filter(
        (n) => n.type?.name === "ElTableColumn",
      );
      return h(
        "table",
        {},
        (props.data || []).map((row) =>
          h(
            "tr",
            {},
            cols.map((col) => h("td", {}, String(row[col.props?.prop] ?? ""))),
          ),
        ),
      );
    };
  },
});
const ElTableColumnStub = defineComponent({
  name: "ElTableColumn",
  props: { prop: { type: String, default: "" } },
  setup: () => () => null,
});
const stubs = {
  ...ElementPlusStubs,
  ElTable: ElTableStub,
  ElTableColumn: ElTableColumnStub,
  RouterLink: RouterLinkStub,
};

const err = (kind, extra = {}) => new AppError({ kind, ...extra });
const mountWith = (error, props = {}) =>
  mount(ErrorState, { props: { error, ...props }, global: { stubs } });
const q = (w, id) => w.find(`[data-testid="${id}"]`);

afterEach(() => vi.restoreAllMocks());

describe("ErrorState", () => {
  for (const kind of Object.values(KIND).filter((k) => k !== KIND.CANCELLED)) {
    it(`says what the copy table says for ${kind}`, () => {
      const error = err(kind);
      const w = mountWith(error);
      const d = describeError(error);
      expect(q(w, "error-title").text()).toBe(d.title);
      expect(q(w, "error-hint").text()).toBe(d.description);
      expect(q(w, "error-icon").classes()).toContain(d.icon);
      expect(w.get('[data-testid="error-state"]').attributes("data-kind")).toBe(
        kind,
      );
    });
  }

  it("decodes whatever it is given, so a page can pass the thrown error as it is", () => {
    const w = mountWith({
      isAxiosError: true,
      response: { status: 404, headers: {}, data: { detail: "Not Found" } },
    });
    expect(q(w, "error-title").text()).toBe("Page not found");
  });

  it("renders nothing for a cancelled request", () => {
    expect(
      mountWith(err(KIND.CANCELLED))
        .find('[data-testid="error-state"]')
        .exists(),
    ).toBe(false);
  });

  it("uses the context: the noun, and whether you are signed in", () => {
    const w = mountWith(err(KIND.NOT_FOUND), {
      context: { noun: "repository", signedIn: true },
    });
    expect(q(w, "error-title").text()).toBe("Repository not found");
    expect(q(w, "error-hint").text()).toContain("don't have access");
    expect(w.find('[data-testid="error-action-signin"]').exists()).toBe(false);
    const expired = mountWith(err(KIND.NOT_FOUND), {
      context: { noun: "repository", sessionExpired: true },
    });
    expect(q(expired, "error-hint").text()).toContain("session has expired");
  });

  it("lets a caller replace the words", () => {
    const w = mountWith(err(KIND.GATED), {
      titleOverride: "Log in to view this file",
      hintOverride: "Attach a token.",
    });
    expect(q(w, "error-title").text()).toBe("Log in to view this file");
    expect(q(w, "error-hint").text()).toBe("Attach a token.");
  });

  it("offers the actions the copy asks for, and only those it can do", async () => {
    const retry = vi.fn();
    const w = mountWith(err(KIND.UNAVAILABLE), { retry });
    expect(w.findAll("button").map((b) => b.text())).toEqual(["Retry"]);
    await q(w, "error-action-retry").trigger("click");
    expect(retry).toHaveBeenCalledTimes(1);
    // no handler: no Retry button
    expect(
      q(mountWith(err(KIND.UNAVAILABLE)), "error-action-retry").exists(),
    ).toBe(false);
  });

  it("links to the sign-in page, coming back here afterwards", () => {
    window.history.replaceState({}, "", "/datasets/a/b?tab=files");
    const w = mountWith(err(KIND.AUTH_REQUIRED));
    expect(q(w, "error-action-signin").attributes("href")).toBe(
      "/login?return=%2Fdatasets%2Fa%2Fb%3Ftab%3Dfiles",
    );
  });

  it("goes back, goes home, opens settings, and reloads", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const w = mountWith(err(KIND.NOT_FOUND));
    await q(w, "error-action-back").trigger("click");
    expect(back).toHaveBeenCalled();
    expect(q(w, "error-action-home").attributes("href")).toBe("/");
    expect(
      q(mountWith(err(KIND.GATED)), "error-action-settings").attributes("href"),
    ).toBe("/settings");
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, reload },
    });
    await q(mountWith(err(KIND.BUG)), "error-action-reload").trigger("click");
    expect(reload).toHaveBeenCalled();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: original,
    });
  });

  it("shows Retry as busy while it retries", () => {
    const w = mountWith(err(KIND.TIMEOUT), { retry: () => {}, retrying: true });
    expect(q(w, "error-action-retry").attributes("data-loading")).toBe("true");
  });

  it("counts down to an automatic retry, which can be cancelled", async () => {
    const w = mountWith(err(KIND.RATE_LIMITED), {
      retry: () => {},
      autoRetryIn: 3,
    });
    expect(q(w, "error-autoretry").text()).toContain("Retrying in 3 s");
    await q(w, "error-autoretry-cancel").trigger("click");
    expect(w.emitted("cancel-auto-retry")).toHaveLength(1);
    expect(
      q(
        mountWith(err(KIND.RATE_LIMITED), { retry: () => {} }),
        "error-autoretry",
      ).exists(),
    ).toBe(false);
  });

  it("keeps what to quote in a disclosure, and copies it", async () => {
    const w = mountWith(
      err(KIND.SERVER, {
        status: 500,
        code: "ServerError",
        requestId: "r-42",
        serverMessage: "internal text",
      }),
    );
    expect(q(w, "error-technical").text()).toContain(
      "HTTP 500 · ServerError · request r-42",
    );
    expect(q(w, "error-technical").text()).toContain("internal text");
    await q(w, "error-copy").trigger("click");
    expect(clipboard.copyToClipboard).toHaveBeenCalledWith(
      "HTTP 500 · ServerError · request r-42",
    );
  });

  it("shows no disclosure when there is nothing to quote, and not the server's text for a 4xx", () => {
    expect(q(mountWith(err(KIND.NETWORK)), "error-technical").exists()).toBe(
      false,
    );
    const w = mountWith(
      err(KIND.FORBIDDEN, { status: 403, serverMessage: "Not allowed here" }),
    );
    expect(q(w, "error-technical").text()).toContain("HTTP 403");
    expect(q(w, "error-technical").text()).not.toContain("Not allowed here");
  });

  it("lists the fallback sources the hub tried", () => {
    const w = mountWith(
      err(KIND.NOT_FOUND, {
        sources: [
          {
            name: "HuggingFace",
            url: "https://huggingface.co",
            status: 404,
            category: "not-found",
            message: "gone",
          },
          { status: null },
          { name: "x", message: 3 },
        ],
      }),
    );
    const rows = w.findAll("tr").map((r) => r.text());
    expect(rows[0]).toContain("HuggingFace");
    expect(rows[1]).toContain("(unknown)");
    expect(w.text()).toContain("Fallback sources tried (3)");
    expect(
      mountWith(err(KIND.NOT_FOUND, { sources: "nope" }))
        .find("details")
        .exists(),
    ).toBe(false);
  });

  it("is sized for a page, or for a panel inside one", () => {
    expect(q(mountWith(err(KIND.SERVER)), "error-icon").classes()).toContain(
      "text-6xl",
    );
    expect(
      q(
        mountWith(err(KIND.SERVER), { mode: "inline-panel" }),
        "error-icon",
      ).classes(),
    ).toContain("text-5xl");
  });

  it("lets a caller supply its own actions", () => {
    const w = mount(ErrorState, {
      props: { error: err(KIND.NOT_FOUND) },
      slots: { actions: '<button data-testid="mine">Mine</button>' },
      global: { stubs },
    });
    expect(q(w, "mine").exists()).toBe(true);
    expect(q(w, "error-action-back").exists()).toBe(false);
  });

  it("colours the icon by tone", () => {
    expect(q(mountWith(err(KIND.FORBIDDEN)), "error-icon").classes()).toContain(
      "text-amber-500",
    );
    expect(q(mountWith(err(KIND.SERVER)), "error-icon").classes()).toContain(
      "text-red-500",
    );
    expect(q(mountWith(err(KIND.NOT_FOUND)), "error-icon").classes()).toContain(
      "text-gray-500",
    );
  });
});
