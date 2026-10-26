import { describe, expect, it } from "vitest";

import { parseTrainerState, trainerTag } from "@/utils/trainer-state";

describe("trainer_state.json", () => {
  it("names tags the way the Trainer's TensorBoard writer does", () => {
    expect(trainerTag("loss")).toBe("train/loss");
    expect(trainerTag("eval_loss")).toBe("eval/loss");
    expect(trainerTag("test_acc")).toBe("test/acc");
  });

  it("turns log_history into one series per metric, keyed by step", () => {
    const out = parseTrainerState({
      log_history: [
        { epoch: 0.1, learning_rate: 0.5, loss: 2, step: 10 },
        { epoch: 1, eval_loss: 1.5, eval_runtime: 3, step: 15 },
        { epoch: 1, step: 30, train_loss: 1.1, note: "not a number" },
        { loss: 9 }, // no step: skipped
      ],
    });
    expect([...out.get("train/loss").step]).toEqual([10]);
    expect([...out.get("eval/loss").value]).toEqual([1.5]);
    expect([...out.get("train/epoch").step]).toEqual([10, 15, 30]);
    expect(out.get("train/train_loss").value).toEqual([1.1]);
    expect(out.has("train/note")).toBe(false);
    expect(Number.isNaN(out.get("train/loss").wall[0])).toBe(true); // the file has no timestamps
  });

  it("returns nothing for anything that is not a Trainer state", () => {
    expect(parseTrainerState(null).size).toBe(0);
    expect(parseTrainerState({}).size).toBe(0);
    expect(parseTrainerState({ log_history: "x" }).size).toBe(0);
  });
});
