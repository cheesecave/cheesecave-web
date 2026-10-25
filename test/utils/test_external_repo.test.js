import { describe, expect, it } from "vitest";

import { externalRepoUrl } from "@/utils/external-repo";

const repo = (extra) => ({ id: "alice/thing", ...extra });

describe("externalRepoUrl", () => {
  it("has nowhere to send you without a source address", () => {
    expect(externalRepoUrl(repo({ _source: "hf" }), "model")).toBeNull();
  });

  it("puts a Hugging Face model at the root of the source", () => {
    const hf = repo({
      _source: "HuggingFace",
      _source_url: "https://huggingface.co",
    });
    expect(externalRepoUrl(hf, "model")).toBe(
      "https://huggingface.co/alice/thing",
    );
  });

  it("puts a Hugging Face dataset and space under their type", () => {
    const hf = repo({
      _source: "huggingface mirror",
      _source_url: "https://huggingface.co",
    });
    expect(externalRepoUrl(hf, "dataset")).toBe(
      "https://huggingface.co/datasets/alice/thing",
    );
    expect(externalRepoUrl(hf, "space")).toBe(
      "https://huggingface.co/spaces/alice/thing",
    );
  });

  it("recognises Hugging Face by its address when the source has another name", () => {
    const hf = repo({
      _source: "my mirror",
      _source_url: "https://huggingface.co",
    });
    expect(externalRepoUrl(hf, "model")).toBe(
      "https://huggingface.co/alice/thing",
    );
  });

  it("recognises Hugging Face by its name when the address is a proxy", () => {
    const hf = repo({
      _source: "HuggingFace",
      _source_url: "https://proxy.example.org/hf",
    });
    expect(externalRepoUrl(hf, "model")).toBe(
      "https://proxy.example.org/hf/alice/thing",
    );
  });

  it("always uses the type prefix for any other source, models included", () => {
    const other = repo({
      _source: "partner hub",
      _source_url: "https://hub.example.org",
    });
    expect(externalRepoUrl(other, "model")).toBe(
      "https://hub.example.org/models/alice/thing",
    );
    expect(externalRepoUrl(other, "space")).toBe(
      "https://hub.example.org/spaces/alice/thing",
    );
  });

  it("copes with a source that has an address but no name", () => {
    const other = repo({ _source_url: "https://hub.example.org" });
    expect(externalRepoUrl(other, "dataset")).toBe(
      "https://hub.example.org/datasets/alice/thing",
    );
  });
});
