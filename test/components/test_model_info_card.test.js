import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import ModelInfoCard from "@/components/repo/metadata/ModelInfoCard.vue";
import { modelSummary } from "@/utils/repo-derived";

const mountCard = (info) =>
  mount(ModelInfoCard, { props: { summary: modelSummary(info) } });
const rows = (wrapper) =>
  wrapper
    .findAll("[data-row]")
    .map((row) => [
      row.attributes("data-row"),
      row.find("[data-value]").text(),
    ]);

describe("the card of a model", () => {
  it("tells the size, the tensor type, the architecture and the model type", () => {
    const wrapper = mountCard({
      safetensors: { parameters: { BF16: 1235814400 }, total: 1235814400 },
      config: { architectures: ["LlamaForCausalLM"], model_type: "llama" },
    });

    expect(wrapper.find("h3").text()).toBe("Model");
    expect(rows(wrapper)).toEqual([
      ["size", "1.24B params"],
      ["types", "BF16"],
      ["architecture", "LlamaForCausalLM"],
      ["model-type", "llama"],
    ]);
  });

  it("says how a model with several tensor types is made up, the biggest first", () => {
    const wrapper = mountCard({
      safetensors: { parameters: { F32: 25, BF16: 7500 }, total: 7525 },
    });

    expect(rows(wrapper).find(([row]) => row === "types")[1]).toBe(
      "BF16 99.7% · F32 0.3%",
    );
  });

  it("lists several architectures", () => {
    const wrapper = mountCard({ config: { architectures: ["A", "B"] } });

    expect(rows(wrapper)).toEqual([["architecture", "A, B"]]);
  });

  it("shows only what the API has: a config without weights", () => {
    expect(rows(mountCard({ config: { model_type: "bert" } }))).toEqual([
      ["model-type", "bert"],
    ]);
  });

  it("shows only what the API has: weights without a config", () => {
    expect(
      rows(mountCard({ safetensors: { parameters: { F32: 8 }, total: 8 } })),
    ).toEqual([
      ["size", "8 params"],
      ["types", "F32"],
    ]);
  });
});
