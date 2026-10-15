// Every route had the document title "CheeseCave Dev": browser tabs, history, bookmarks and screen readers could not
// tell a model from a login page. The titles follow Hugging Face's, which people already read at a glance:
//
//   a page of the site              Models · <site>            the home page: <site> alone
//   a repository                    owner/name · <site>        a dataset: … · Datasets at <site>, a space: … · Spaces at <site>
//   inside a repository             config.json · owner/name at main      owner/name at main      Commits · owner/name
//
// A page inside a repository names the repository, not the site: the repository is what the tab is about and the
// room in a tab is short. The title is worked out from the route alone (a repository id and a file path are in the
// URL, so nothing is fetched); the site name comes from the branding settings.

import { afterEach, describe, expect, it, vi } from "vitest";

import { installPageTitle, titleForRoute } from "@/utils/page-title";
import {
  applyDocumentBranding,
  DEFAULT_BRANDING,
  formatDocumentTitle,
  setDocumentPageTitle,
} from "@/shared/site-branding";

const BRANDING = { ...DEFAULT_BRANDING, site_name: "CheeseCave Dev" };
const titleOf = (path) => formatDocumentTitle(titleForRoute({ path }), "Site");

describe("the title of each page", () => {
  it.each([
    ["/", "Site"],
    ["/models", "Models · Site"],
    ["/datasets", "Datasets · Site"],
    ["/spaces", "Spaces · Site"],
    ["/organizations", "Organizations · Site"],
    ["/organizations/new", "New organization · Site"],
    ["/new", "New repository · Site"],
    ["/login", "Log in · Site"],
    ["/register", "Create account · Site"],
    ["/settings", "Settings · Site"],
    ["/about", "About · Site"],
    ["/get-started", "Get started · Site"],
    ["/self-hosted", "Self-hosted · Site"],
    ["/contributing", "Contributing · Site"],
    ["/privacy", "Privacy · Site"],
    ["/terms", "Terms · Site"],
    ["/docs", "Documentation · Site"],
    ["/docs/setup", "Documentation · Site"],
    ["/invite/abc123", "Organization invitation · Site"],
  ])("%s is %j", (path, title) => {
    expect(titleOf(path)).toBe(title);
  });

  it.each([
    ["/demo", "demo · Site"],
    ["/demo/models", "Models · demo · Site"],
    ["/demo/datasets", "Datasets · demo · Site"],
    ["/demo/spaces", "Spaces · demo · Site"],
    ["/demo/storage", "Storage · demo · Site"],
    ["/organizations/acme-labs", "acme-labs · Site"],
    ["/organizations/acme-labs/models", "Models · acme-labs · Site"],
    ["/organizations/acme-labs/settings", "Settings · acme-labs · Site"],
    ["/organizations/acme-labs/storage", "Storage · acme-labs · Site"],
  ])("the page of an account, %s, is %j", (path, title) => {
    expect(titleOf(path)).toBe(title);
  });

  it.each([
    ["/models/demo/gamma-t5", "demo/gamma-t5 · Site"],
    ["/datasets/demo/data-one", "demo/data-one · Datasets at Site"],
    ["/spaces/demo/space-one", "demo/space-one · Spaces at Site"],
  ])("a repository, %s, is %j", (path, title) => {
    expect(titleOf(path)).toBe(title);
  });

  it.each([
    ["/models/demo/gamma-t5/tree/main", "demo/gamma-t5 at main"],
    ["/models/demo/gamma-t5/tree/main/src/lib", "lib · demo/gamma-t5 at main"],
    ["/datasets/demo/d/blob/dev/src/app.py", "app.py · demo/d at dev"],
    [
      "/models/demo/gamma-t5/edit/main/src/app.py",
      "Edit app.py · demo/gamma-t5 at main",
    ],
    ["/models/demo/gamma-t5/commits/main", "Commits · demo/gamma-t5"],
    [
      "/models/demo/gamma-t5/commit/0123456789abcdef",
      "Commit 0123456 · demo/gamma-t5",
    ],
    ["/spaces/demo/s/settings", "Settings · demo/s"],
    ["/models/demo/gamma-t5/upload/main", "Upload files · demo/gamma-t5"],
  ])(
    "inside a repository, %s, is %j: it names the repository and not the site",
    (path, title) => {
      expect(titleOf(path)).toBe(title);
    },
  );

  it("reads names that are percent-encoded, a branch with a slash in it, and bad encoding as it is", () => {
    expect(titleOf("/models/demo/a%20b/blob/main/x%2By.txt")).toBe(
      "x+y.txt · demo/a b at main",
    );
    expect(titleOf("/models/demo/m/tree/feature%2Fx/src")).toBe(
      "src · demo/m at feature/x",
    );
    expect(titleOf("/models/demo/100%/blob/main/f")).toBe(
      "f · demo/100% at main",
    );
  });

  it.each([
    "/demo/nothing",
    "/a/b/c/d",
    "/models/demo",
    "/x/y/z",
    "/models/demo/gamma-t5/nothing",
    "/models/demo/gamma-t5/commit",
    "/invite/a/b",
    "/organizations/acme/nothing",
    "/organizations/a/b/c",
  ])("calls a path that is no page, %s, a 404", (path) => {
    expect(titleOf(path)).toBe("404 · Site");
  });
});

describe("formatDocumentTitle", () => {
  it("puts the page before the site, the type of a repository before the site's name", () => {
    expect(formatDocumentTitle({ title: "a/b" }, "Site")).toBe("a/b · Site");
    expect(
      formatDocumentTitle({ title: "a/b", section: "Datasets" }, "Site"),
    ).toBe("a/b · Datasets at Site");
  });

  it("is the site alone for a page without a title, and the title alone where the site is left out", () => {
    expect(formatDocumentTitle({ title: "" }, "Site")).toBe("Site");
    expect(formatDocumentTitle({}, "Site")).toBe("Site");
    expect(
      formatDocumentTitle({ title: "a/b at main", site: false }, "Site"),
    ).toBe("a/b at main");
  });
});

describe("the document title", () => {
  afterEach(() => {
    setDocumentPageTitle({});
  });

  it("is the page, then the site name", () => {
    applyDocumentBranding(BRANDING);
    setDocumentPageTitle({ title: "demo/gamma-t5" });
    expect(document.title).toBe("demo/gamma-t5 · CheeseCave Dev");
    setDocumentPageTitle({ title: "demo/d", section: "Datasets" });
    expect(document.title).toBe("demo/d · Datasets at CheeseCave Dev");
  });

  it("is the site name alone on a page without a title of its own", () => {
    applyDocumentBranding(BRANDING);
    setDocumentPageTitle({ title: "Models" });
    setDocumentPageTitle({});
    expect(document.title).toBe("CheeseCave Dev");
  });

  it("leaves the site name out of a page inside a repository", () => {
    applyDocumentBranding(BRANDING);
    setDocumentPageTitle({ title: "Commits · demo/gamma-t5", site: false });
    expect(document.title).toBe("Commits · demo/gamma-t5");
  });

  it("follows a site name that arrives after the page's title", () => {
    setDocumentPageTitle({ title: "Models" });
    applyDocumentBranding({ ...DEFAULT_BRANDING, site_name: "Acme Hub" });
    expect(document.title).toBe("Models · Acme Hub");
  });

  it("shows a page inside a repository before the site name has arrived", () => {
    document.title = "";
    setDocumentPageTitle({ title: "f · demo/m at main", site: false });
    expect(document.title).toBe("f · demo/m at main");
  });

  it("keeps the administration portal's title as it was", () => {
    applyDocumentBranding(BRANDING, { admin: true });
    expect(document.title).toBe("CheeseCave Dev Admin Portal");
    applyDocumentBranding(BRANDING);
  });
});

describe("installPageTitle", () => {
  afterEach(() => {
    setDocumentPageTitle({});
  });

  function fakeRouter() {
    const router = {
      hooks: [],
      remove: vi.fn(),
      afterEach(hook) {
        router.hooks.push(hook);
        return router.remove;
      },
    };
    return router;
  }

  it("sets the title after each navigation that succeeded, and hands back the way to stop", () => {
    applyDocumentBranding(BRANDING);
    const router = fakeRouter();
    const stop = installPageTitle(router);
    const [hook] = router.hooks;

    hook({ path: "/login" }, {}, undefined);
    expect(document.title).toBe("Log in · CheeseCave Dev");
    hook({ path: "/datasets/demo/x" }, {}, undefined);
    expect(document.title).toBe("demo/x · Datasets at CheeseCave Dev");
    hook({ path: "/models/demo/x/commits/main" }, {}, undefined);
    expect(document.title).toBe("Commits · demo/x");
    expect(stop).toBe(router.remove);
  });

  it("leaves the title alone after a navigation that failed", () => {
    applyDocumentBranding(BRANDING);
    const router = fakeRouter();
    installPageTitle(router);
    router.hooks[0]({ path: "/login" }, {}, undefined);

    router.hooks[0]({ path: "/settings" }, {}, new Error("cancelled"));

    expect(document.title).toBe("Log in · CheeseCave Dev");
  });
});
