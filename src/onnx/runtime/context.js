export const inferenceContext = Symbol("cheesecave-inference");
export const taskContext = Symbol("cheesecave-task");
export const formatMs = (value) =>
  Number.isFinite(value) ? `${value.toFixed(value < 10 ? 2 : 1)} ms` : "—";
export const formatBytes = (value) =>
  Number.isFinite(value) ? `${(value / 1e6).toFixed(2)} MB` : "—";

// Resources and execution parameters come from the validated document.
export function resolveTask(task) {
  return { model: task.model, sample: task.sample, pipeline: task.pipeline };
}
