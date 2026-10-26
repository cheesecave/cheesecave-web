import { describe, expect, it } from "vitest";

import { findMetricRuns, formatBytes, shortRunLabels, tagGroup } from "@/utils/metrics-discovery";

const f = (path, size = 100, extra = {}) => ({ type: "file", path, size, ...extra });

describe("findMetricRuns", () => {
  it("makes one run of the event files of a directory, in start-time order, and keeps the content ids", () => {
    const { runs } = findMetricRuns([
      f("tensorboard/main/events.out.tfevents.300.host.1.0", 3, { lfs: { oid: "c" } }),
      f("tensorboard/main/events.out.tfevents.100.host.1.0", 1, { oid: "a" }),
      f("tensorboard/main/events.out.tfevents.200.host.1.0", 2, { oid: "b" }),
      f("README.md"),
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ id: "tensorboard/main", kind: "tfevents", bytes: 6 });
    expect(runs[0].files.map((x) => x.oid)).toEqual(["a", "b", "c"]);
  });

  it("treats the hparams sub-directory of a Trainer run as a run of its own, as the Hub does", () => {
    const { runs } = findMetricRuns([
      f("runs/Dec12/events.out.tfevents.10.h.1.0"),
      f("runs/Dec12/events.out.tfevents.90.h.1.2"),
      f("runs/Dec12/1670844895.41/events.out.tfevents.10.h.1.1"),
    ]);
    expect(runs.map((r) => [r.id, r.files.length])).toEqual([
      ["runs/Dec12", 2],
      ["runs/Dec12/1670844895.41", 1],
    ]);
  });

  it("names a run at the repository root", () => {
    expect(findMetricRuns([f("events.out.tfevents.1.h.1.0")]).runs[0].id).toBe("(root)");
  });

  it("ignores directories and entries without a path", () => {
    expect(findMetricRuns([{ type: "directory", path: "runs" }, { type: "file" }]).runs).toEqual([]);
  });

  it("takes the root trainer_state.json, else the latest checkpoint of each parent", () => {
    const withRoot = findMetricRuns([f("trainer_state.json"), f("checkpoint-500/trainer_state.json"), f("checkpoint-1500/trainer_state.json")]);
    expect(withRoot.runs.map((r) => r.files[0].path)).toEqual(["trainer_state.json"]);
    const onlyCheckpoints = findMetricRuns([
      f("out/checkpoint-500/trainer_state.json"),
      f("out/checkpoint-1500/trainer_state.json"),
      f("out/checkpoint-900/trainer_state.json"),
      f("other/trainer_state.json"),
    ]);
    expect(onlyCheckpoints.runs.map((r) => r.files[0].path).sort()).toEqual(["other/trainer_state.json", "out/checkpoint-1500/trainer_state.json"]);
    expect(onlyCheckpoints.runs.every((r) => r.kind === "trainer_state")).toBe(true);
  });

  it("adds up the bytes of everything it found", () => {
    const { totalBytes } = findMetricRuns([f("a/events.out.tfevents.1", 10), f("trainer_state.json", 5)]);
    expect(totalBytes).toBe(15);
  });
});

describe("tagGroup and formatBytes", () => {
  it("groups by the first path segment like TensorBoard", () => {
    expect(tagGroup("train/loss")).toBe("train");
    expect(tagGroup("loss")).toBe("(other)");
  });
  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(30 * 1024)).toBe("30 KB");
    expect(formatBytes(5 * 1024 ** 2)).toBe("5.0 MB");
    expect(formatBytes(546 * 1024 ** 2)).toBe("546 MB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3.0 GB");
    expect(formatBytes(NaN)).toBe("");
  });
});

describe("shortRunLabels", () => {
  it("leaves off the directories every run shares, but never the whole name", () => {
    expect(shortRunLabels(["lightning_logs/version_3", "lightning_logs/version_4"])).toEqual(["version_3", "version_4"]);
    expect(shortRunLabels(["runs/a/x", "runs/b/x"])).toEqual(["a/x", "b/x"]);
    expect(shortRunLabels(["runs/a", "runs/a"])).toEqual(["a", "a"]);
    expect(shortRunLabels(["one/two", "one"])).toEqual(["one/two", "one"]);
  });
  it("keeps a lone run's full path", () => {
    expect(shortRunLabels(["tensorboard/main"])).toEqual(["tensorboard/main"]);
    expect(shortRunLabels([])).toEqual([]);
  });
});
