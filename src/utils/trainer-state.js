// src/utils/trainer-state.js
//
// `trainer_state.json` is written by the HF Trainer next to every checkpoint, whether or
// not TensorBoard is installed. Its `log_history` is a list of flat dicts:
//   {"epoch": 0.07, "learning_rate": 0.0, "loss": 1.83, "step": 1}
//   {"epoch": 1.0, "eval_loss": 0.9, "eval_runtime": 3.1, "step": 15}
//   {"epoch": 5.9, "step": 90, "train_loss": 0.97, "train_runtime": 2307.8, ...}   (final summary)
// It is turned into the series the TensorBoard writer of the same Trainer would have
// produced, with the same tag names (`train/loss`, `eval/loss`, ...), so a run read from
// either source looks the same. There is no wall time in it (NaN).

/** `eval_loss` -> `eval/loss`; everything else is a training metric. */
export function trainerTag(key) {
  if (key.startsWith("eval_")) return `eval/${key.slice(5)}`;
  if (key.startsWith("test_")) return `test/${key.slice(5)}`;
  return `train/${key}`;
}

/**
 * @param {unknown} json parsed trainer_state.json
 * @returns {Map<string, {step: number[], wall: number[], value: number[]}>}
 */
export function parseTrainerState(json) {
  const out = new Map();
  const history = json && Array.isArray(json.log_history) ? json.log_history : null;
  if (!history) return out;
  for (const entry of history) {
    if (!entry || typeof entry !== "object" || !Number.isFinite(entry.step)) continue;
    for (const [key, v] of Object.entries(entry)) {
      if (key === "step" || typeof v !== "number") continue;
      const tag = trainerTag(key);
      let s = out.get(tag);
      if (!s) out.set(tag, (s = { step: [], wall: [], value: [] }));
      s.step.push(entry.step);
      s.wall.push(NaN);
      s.value.push(v);
    }
  }
  return out;
}
