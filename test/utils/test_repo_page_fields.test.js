import { describe, expect, it } from "vitest";

import { CORE_REPO_FIELDS, repoPageFields } from "@/utils/repo-page-fields";

describe("the fields the repository page asks for", () => {
  it("asks a model and a dataset for downloads, in the order the page always did", () => {
    const expected = ["sha", "lastModified", "createdAt", "private", "downloads", "likes", "tags", "storage"];

    expect(repoPageFields("model")).toEqual(expected);
    expect(repoPageFields("dataset")).toEqual(expected);
  });

  it("does not ask a Space for downloads, which a Space does not have", () => {
    expect(repoPageFields("space")).toEqual([...CORE_REPO_FIELDS, "storage"]);
    expect(repoPageFields("space")).not.toContain("downloads");
  });

  it("never asks for the file list", () => {
    for (const kind of ["model", "dataset", "space"]) expect(repoPageFields(kind)).not.toContain("siblings");
  });

  it("does not hand out the list it keeps", () => {
    repoPageFields("model").push("x");

    expect(repoPageFields("model")).not.toContain("x");
    expect(CORE_REPO_FIELDS).not.toContain("x");
  });
});
