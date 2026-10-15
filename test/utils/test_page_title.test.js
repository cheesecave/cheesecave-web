// Every route had the document title "CheeseCave Dev": browser tabs, history, bookmarks and screen readers could not
// tell a model from a login page. The title is now `<page> · <site name>`, with the page worked out from the route
// alone (a repository id is in the URL; nothing has to be fetched), and the site name from the branding settings.

import { afterEach, describe, expect, it, vi } from "vitest";

import { installPageTitle, titleForRoute } from "@/utils/page-title";
import {
  applyDocumentBranding,
  DEFAULT_BRANDING,
  setDocumentPageTitle,
} from "@/shared/site-branding";

const BRANDING = { ...DEFAULT_BRANDING, site_name: "CheeseCave Dev" };

describe("titleForRoute", () => {
  it.each([
    ["/", ""],
    ["/models", "Models"],
    ["/datasets", "Datasets"],
    ["/spaces", "Spaces"],
    ["/organizations", "Organizations"],
    ["/organizations/new", "New organization"],
    ["/new", "New repository"],
    ["/login", "Log in"],
    ["/register", "Create account"],
    ["/settings", "Settings"],
    ["/about", "About"],
    ["/get-started", "Get started"],
    ["/self-hosted", "Self-hosted"],
    ["/contributing", "Contributing"],
    ["/privacy", "Privacy"],
    ["/terms", "Terms"],
    ["/docs", "Documentation"],
    ["/docs/setup", "Documentation"],
    ["/invite/abc123", "Organization invitation"],
  ])("%s is %j", (path, title) => {
    expect(titleForRoute({ path })).toBe(title);
  });

  it.each([
    ["/demo", "demo"],
    ["/demo/models", "Models · demo"],
    ["/demo/datasets", "Datasets · demo"],
    ["/demo/spaces", "Spaces · demo"],
    ["/demo/storage", "Storage · demo"],
    ["/organizations/acme-labs", "acme-labs"],
    ["/organizations/acme-labs/models", "Models · acme-labs"],
    ["/organizations/acme-labs/settings", "Settings · acme-labs"],
    ["/organizations/acme-labs/storage", "Storage · acme-labs"],
  ])("the page of an account, %s, is %j", (path, title) => {
    expect(titleForRoute({ path })).toBe(title);
  });

  it.each([
    ["/models/demo/gamma-t5", "demo/gamma-t5"],
    ["/datasets/demo/data-one", "demo/data-one"],
    ["/spaces/demo/space-one", "demo/space-one"],
    ["/models/demo/gamma-t5/tree/main", "demo/gamma-t5"],
    ["/models/demo/gamma-t5/tree/main/src/lib", "lib · demo/gamma-t5"],
    ["/models/demo/gamma-t5/blob/main/src/app.py", "app.py · demo/gamma-t5"],
    [
      "/models/demo/gamma-t5/edit/main/src/app.py",
      "Edit app.py · demo/gamma-t5",
    ],
    ["/models/demo/gamma-t5/commits/main", "Commits · demo/gamma-t5"],
    [
      "/models/demo/gamma-t5/commit/0123456789abcdef",
      "Commit 0123456 · demo/gamma-t5",
    ],
    ["/models/demo/gamma-t5/settings", "Settings · demo/gamma-t5"],
    ["/models/demo/gamma-t5/upload/main", "Upload files · demo/gamma-t5"],
  ])("the page of a repository, %s, is %j", (path, title) => {
    expect(titleForRoute({ path })).toBe(title);
  });

  it("reads a name that is percent-encoded, and keeps one that is not valid encoding as it is", () => {
    expect(
      titleForRoute({ path: "/models/demo/a%20b/blob/main/x%2By.txt" }),
    ).toBe("x+y.txt · demo/a b");
    expect(titleForRoute({ path: "/models/demo/100%/blob/main/f" })).toBe(
      "f · demo/100%",
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
  ])("says a path that is no page, %s, is not found", (path) => {
    expect(titleForRoute({ path })).toBe("Page not found");
  });
});

describe("the document title", () => {
  afterEach(() => {
    setDocumentPageTitle("");
  });

  it("is the page, then the site name", () => {
    applyDocumentBranding(BRANDING);
    setDocumentPageTitle("demo/gamma-t5");
    expect(document.title).toBe("demo/gamma-t5 · CheeseCave Dev");
  });

  it("is the site name alone on a page without a title of its own", () => {
    applyDocumentBranding(BRANDING);
    setDocumentPageTitle("Models");
    setDocumentPageTitle("");
    expect(document.title).toBe("CheeseCave Dev");
  });

  it("follows a site name that arrives after the page's title", () => {
    setDocumentPageTitle("Models");
    applyDocumentBranding({ ...DEFAULT_BRANDING, site_name: "Acme Hub" });
    expect(document.title).toBe("Models · Acme Hub");
  });

  it("keeps the administration portal's title as it was", () => {
    applyDocumentBranding(BRANDING, { admin: true });
    expect(document.title).toBe("CheeseCave Dev Admin Portal");
    applyDocumentBranding(BRANDING);
  });
});

describe("installPageTitle", () => {
  afterEach(() => {
    setDocumentPageTitle("");
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
    hook({ path: "/models/demo/x" }, {}, undefined);
    expect(document.title).toBe("demo/x · CheeseCave Dev");
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
