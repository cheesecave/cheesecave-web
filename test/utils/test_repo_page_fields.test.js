import { describe, expect, it } from "vitest";

import { CORE_REPO_FIELDS, repoPageFields } from "@/utils/repo-page-fields";

describe("the fields the repository page asks for", () => {
  it("asks a dataset for what the page always asked", () => {
    expect(repoPageFields("dataset")).toEqual([
      "sha",
      "lastModified",
      "createdAt",
      "private",
      "downloads",
      "likes",
      "tags",
      "storage",
      "createdBy",
    ]);
  });

  it("asks a model, besides, for what its files say: library, task, config and the size of its weights", () => {
    expect(repoPageFields("model")).toEqual([
      "sha",
      "lastModified",
      "createdAt",
      "private",
      "downloads",
      "likes",
      "tags",
      "storage",
      "createdBy",
      "pipeline_tag",
      "library_name",
      "config",
      "safetensors",
    ]);
  });

  it("asks a Space for its sdk, and not for downloads, which a Space does not have", () => {
    expect(repoPageFields("space")).toEqual([
      ...CORE_REPO_FIELDS,
      "storage",
      "createdBy",
      "sdk",
    ]);
    expect(repoPageFields("space")).not.toContain("downloads");
  });

  it("asks only for what the kind of repository has: pipeline_tag, config and safetensors are a model's", () => {
    for (const field of [
      "pipeline_tag",
      "library_name",
      "config",
      "safetensors",
    ]) {
      expect(repoPageFields("dataset")).not.toContain(field);
      expect(repoPageFields("space")).not.toContain(field);
    }
    expect(repoPageFields("model")).not.toContain("sdk");
  });

  it("asks for the creator on every kind of repository, but not in the fields every backend knows", () => {
    for (const kind of ["model", "dataset", "space"])
      expect(repoPageFields(kind)).toContain("createdBy");
    expect(CORE_REPO_FIELDS).not.toContain("createdBy");
  });

  it("never asks for the file list", () => {
    for (const kind of ["model", "dataset", "space"])
      expect(repoPageFields(kind)).not.toContain("siblings");
  });

  it("does not hand out the list it keeps", () => {
    repoPageFields("model").push("x");

    expect(repoPageFields("model")).not.toContain("x");
    expect(CORE_REPO_FIELDS).not.toContain("x");
  });
});
