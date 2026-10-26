import { computed, onScopeDispose, ref, watch } from "vue";
import { inspectModelResource } from "./model-resource.js";
import { applyModelFacts, modelFacts } from "./model-facts.js";

export function useModelResource(model, pipeline, changed) {
  const state = ref({ status: "loading", url: "", error: "" });
  let generation = 0,
    timer,
    controller,
    deadline;
  function refresh(delay = 0) {
    const current = model.value,
      url = current.url;
    const previous = { bytes: current.bytes, sha256: current.sha256 };
    const request = ++generation;
    clearTimeout(timer);
    clearTimeout(deadline);
    controller?.abort();
    // Invalidate synchronously so no save can pair a new URL with the old hash.
    current.bytes = 0;
    current.sha256 = "";
    if (!url) {
      state.value = { status: "idle", url, error: "" };
      return;
    }
    state.value = { status: "loading", url, error: "" };
    timer = setTimeout(async () => {
      const aborter = new AbortController();
      controller = aborter;
      deadline = setTimeout(
        () => aborter.abort(new Error("模型读取超时，请重试")),
        60000,
      );
      try {
        const metadata = await inspectModelResource(url, {
          signal: aborter.signal,
        });
        if (
          request !== generation ||
          model.value !== current ||
          current.url !== url
        )
          return;
        Object.assign(current, {
          bytes: metadata.bytes,
          sha256: metadata.sha256,
        });
        applyModelFacts(metadata, pipeline.value);
        state.value = { status: "ready", url, ...metadata, error: "" };
        if (
          previous.bytes !== metadata.bytes ||
          previous.sha256 !== metadata.sha256
        )
          changed();
      } catch (error) {
        if (request !== generation) return;
        state.value = {
          status: "error",
          url,
          error: error.message || "模型读取失败，请重试",
        };
      } finally {
        if (request === generation) clearTimeout(deadline);
      }
    }, delay);
  }
  watch([model, () => model.value.url], () => refresh(300), {
    immediate: true,
    flush: "sync",
  });
  const facts = computed(() => modelFacts(state.value, pipeline.value));
  const ready = computed(
    () =>
      state.value.status === "ready" &&
      state.value.url === model.value.url &&
      state.value.bytes === model.value.bytes &&
      state.value.sha256 === model.value.sha256 &&
      !facts.value.error,
  );
  watch(
    () => [
      pipeline.value.input.layout,
      pipeline.value.output.name,
      pipeline.value.output.kind,
      pipeline.value.output.labels.length,
    ],
    () => {
      if (state.value.status === "ready")
        applyModelFacts(state.value, pipeline.value);
    },
    { flush: "sync" },
  );
  onScopeDispose(() => {
    generation++;
    clearTimeout(timer);
    clearTimeout(deadline);
    controller?.abort();
  });
  return { state, ready, facts, refresh: () => refresh() };
}
