import { computed, onScopeDispose, ref, watch } from "vue";
import { listSpaceFiles, readLabels, resourcePath } from "./space-resources.js";

export function useSpaceResources(task, changed, repositoryContext) {
  const context = ref(null),
    files = ref([]),
    status = ref("loading"),
    error = ref("");
  const labelState = ref({ status: "ready", error: "" });
  let controller,
    labelController,
    generation = 0,
    labelGeneration = 0;
  const models = computed(() =>
    files.value.filter((file) => /\.onnx$/i.test(file.path)),
  );
  const images = computed(() =>
    files.value.filter((file) =>
      /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.path),
    ),
  );
  const labelFiles = computed(() =>
    files.value.filter((file) => /\.json$/i.test(file.path)),
  );
  const selectedModel = computed(() =>
    context.value ? resourcePath(context.value, task.value.model.url) : "",
  );
  const selectedSample = computed(() =>
    context.value && task.value.sample
      ? resourcePath(context.value, task.value.sample.url)
      : "",
  );
  const selectedLabels = computed(() =>
    context.value && task.value.labelFile
      ? resourcePath(context.value, task.value.labelFile)
      : "",
  );
  const selectionError = computed(() => {
    if (status.value !== "ready") return error.value || "正在读取 Space 仓库";
    if (!task.value.model.url) return "";
    if (!models.value.some((file) => file.path === selectedModel.value))
      return "模型不在当前 Space 仓库中，请重新选择";
    if (
      task.value.sample &&
      !images.value.some((file) => file.path === selectedSample.value)
    )
      return "示例图片不在当前 Space 仓库中，请重新选择";
    if (
      task.value.labelFile &&
      !labelFiles.value.some((file) => file.path === selectedLabels.value)
    )
      return "标签文件不在当前 Space 仓库中，请重新选择";
    return labelState.value.status !== "ready"
      ? labelState.value.error || "正在读取标签文件"
      : "";
  });
  const ready = computed(() => !!selectedModel.value && !selectionError.value);
  async function refresh() {
    const request = ++generation;
    controller?.abort();
    controller = new AbortController();
    status.value = "loading";
    error.value = "";
    try {
      const next = { ...repositoryContext.value };
      const entries = await listSpaceFiles(next, controller.signal);
      if (request !== generation) return;
      context.value = next;
      files.value = entries;
      status.value = "ready";
      if (task.value.labelFile) refreshLabels();
    } catch (cause) {
      if (request === generation) {
        status.value = "error";
        error.value = cause.message;
      }
    }
  }
  function selectModel(path) {
    const file = models.value.find((item) => item.path === path);
    if (!file) return;
    task.value.model.url = file.url;
    task.value.model.id = path;
    task.value.model.label = path;
    task.value.pipeline.input.name = "";
    task.value.pipeline.output.name = "";
    // Class meaning belongs to the chosen model. Never silently carry old labels across models.
    const directory = path.slice(0, path.lastIndexOf("/") + 1);
    const candidates = labelFiles.value.filter(
      (item) =>
        item.path === `${directory}labels.json` ||
        item.path === `${directory}meta.json`,
    );
    task.value.pipeline.output.labels = [""];
    task.value.pipeline.output.topK = 1;
    delete task.value.labelFile;
    if (candidates.length === 1) task.value.labelFile = candidates[0].url;
    changed();
  }
  function selectSample(path) {
    if (!path) {
      task.value.sample = null;
      changed();
      return;
    }
    const file = images.value.find((item) => item.path === path);
    if (!file) return;
    task.value.sample = {
      id: path.slice(-100),
      label: path.split("/").pop(),
      url: file.url,
    };
    changed();
  }
  function selectLabels(path) {
    const file = labelFiles.value.find((item) => item.path === path);
    if (file && task.value.labelFile === file.url) refreshLabels();
    else if (file) task.value.labelFile = file.url;
    else delete task.value.labelFile;
    changed();
  }
  async function refreshLabels() {
    const request = ++labelGeneration;
    labelController?.abort();
    const current = task.value,
      url = current.labelFile;
    if (!url) {
      labelState.value = { status: "ready", error: "" };
      return;
    }
    labelState.value = { status: "loading", error: "" };
    labelController = new AbortController();
    try {
      const labels = await readLabels(url, labelController.signal);
      if (
        request !== labelGeneration ||
        current !== task.value ||
        current.labelFile !== url
      )
        return;
      const different =
        JSON.stringify(current.pipeline.output.labels) !==
        JSON.stringify(labels);
      current.pipeline.output.labels = labels;
      current.pipeline.output.topK = Math.min(
        current.pipeline.output.topK,
        labels.length,
      );
      labelState.value = { status: "ready", error: "" };
      if (different) changed();
    } catch (cause) {
      if (request === labelGeneration)
        labelState.value = { status: "error", error: cause.message };
    }
  }
  watch(() => [task.value, task.value.labelFile], refreshLabels, {
    immediate: true,
    flush: "sync",
  });
  watch(repositoryContext, refresh, { immediate: true });
  onScopeDispose(() => {
    generation++;
    labelGeneration++;
    controller?.abort();
    labelController?.abort();
  });
  return {
    context,
    status,
    error,
    models,
    images,
    labelFiles,
    selectedModel,
    selectedSample,
    selectedLabels,
    labelState,
    selectionError,
    ready,
    refresh,
    selectModel,
    selectSample,
    selectLabels,
  };
}
