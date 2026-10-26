const fixed = (value) => Number.isInteger(value) && value > 0;

// Shape only identifies a layout when exactly one supported channel axis fits.
// It cannot tell us RGB/BGR, normalization, class meaning or output semantics.
export function modelFacts(metadata, pipeline) {
  const inputs = metadata.inputs || [],
    outputs = metadata.outputs || [];
  const input =
    inputs.find((item) => item.name === pipeline.input.name) ||
    (inputs.length === 1 ? inputs[0] : null);
  const output =
    outputs.find((item) => item.name === pipeline.output.name) ||
    (outputs.length === 1 ? outputs[0] : null);
  const shape = input?.shape;
  const layouts =
    Array.isArray(shape) && shape.length === 4
      ? ["NCHW", "NHWC"].filter(
          (layout) =>
            !fixed(shape[layout === "NCHW" ? 1 : 3]) ||
            shape[layout === "NCHW" ? 1 : 3] === 3,
        )
      : [];
  const autoLayout = layouts.length === 1 ? layouts[0] : null;
  const layout = autoLayout || pipeline.input.layout;
  const width = shape?.[layout === "NCHW" ? 3 : 2],
    height = shape?.[layout === "NCHW" ? 2 : 1];
  const outputShape = output?.shape,
    outputConfig = pipeline.output;
  const detectionLayouts =
    Array.isArray(outputShape) && outputShape.length === 3
      ? ["BCN", "BNC"].filter(
          (value) =>
            !fixed(outputShape[value === "BCN" ? 1 : 2]) ||
            outputShape[value === "BCN" ? 1 : 2] ===
              4 + outputConfig.labels.length,
        )
      : [];
  const autoOutputLayout =
    detectionLayouts.length === 1 ? detectionLayouts[0] : null;
  let error = "";
  if (metadata.metadata?.externalData)
    error = "此模型使用外置权重，当前图像演示尚不支持，请选择单文件 ONNX 模型";
  else if (
    [...(shape || []), ...(outputShape || [])].some(
      (value) =>
        typeof value === "number" && (!Number.isInteger(value) || value <= 0),
    )
  )
    error = "模型声明了非正数或无效的固定维度，当前图像流程不支持";
  else if (inputs.length !== 1)
    error = "当前图像流程需要一个图像输入，此模型包含多个输入或没有输入";
  else if (
    input?.type !== "float32" ||
    !Array.isArray(shape) ||
    shape.length !== 4
  )
    error = "当前图像流程需要四维 float32 输入张量";
  else if (fixed(shape[0]) && shape[0] !== 1)
    error = "当前图像流程每次处理一张图片，模型固定 batch 必须为 1";
  else if (!layouts.includes(layout)) error = "当前图像流程需要 3 个颜色通道";
  else if ([width, height].some((value) => fixed(value) && value > 1024))
    error = "模型固定输入尺寸超过当前流程支持的 1024 像素";
  else if (!output) error = "请选择一个模型输出张量";
  else if (output.type !== "float32" || !Array.isArray(output.shape))
    error = "当前输出解码需要 float32 张量";
  else if (
    outputConfig.kind === "classification" &&
    (outputShape.length < 1 ||
      outputShape.length > 2 ||
      (outputShape.length === 2 &&
        fixed(outputShape[0]) &&
        outputShape[0] !== 1))
  )
    error = "所选输出形状不适用于图像分类，请选择匹配的输出类型";
  else if (
    outputConfig.kind === "classification" &&
    fixed(outputShape.at(-1)) &&
    outputShape.at(-1) !== outputConfig.labels.length
  )
    error = `模型输出 ${outputShape.at(-1)} 个类别，请配置对应的类别标签`;
  else if (
    outputConfig.kind === "yolo-detection" &&
    (outputShape.length !== 3 ||
      (fixed(outputShape[0]) && outputShape[0] !== 1))
  )
    error = "所选输出形状不适用于目标检测，请选择匹配的输出类型";
  else if (
    outputConfig.kind === "yolo-detection" &&
    fixed(
      outputShape[(autoOutputLayout || outputConfig.layout) === "BCN" ? 1 : 2],
    ) &&
    outputShape[(autoOutputLayout || outputConfig.layout) === "BCN" ? 1 : 2] !==
      4 + outputConfig.labels.length
  )
    error = "检测输出的通道数量与类别标签不匹配";
  return {
    input,
    output,
    layouts,
    autoLayout,
    autoOutputLayout,
    width: fixed(width) ? width : null,
    height: fixed(height) ? height : null,
    error,
  };
}

export function applyModelFacts(metadata, pipeline) {
  if (metadata.inputs.length === 1)
    pipeline.input.name = metadata.inputs[0].name;
  else if (!metadata.inputs.some((item) => item.name === pipeline.input.name))
    pipeline.input.name = "";
  if (metadata.outputs.length === 1)
    pipeline.output.name = metadata.outputs[0].name;
  else if (!metadata.outputs.some((item) => item.name === pipeline.output.name))
    pipeline.output.name = "";
  const facts = modelFacts(metadata, pipeline);
  if (facts.autoLayout) pipeline.input.layout = facts.autoLayout;
  if (facts.width) pipeline.input.width = facts.width;
  if (facts.height) pipeline.input.height = facts.height;
  if (facts.autoOutputLayout && pipeline.output.kind === "yolo-detection")
    pipeline.output.layout = facts.autoOutputLayout;
  return facts;
}

export function formatShape(shape) {
  return Array.isArray(shape)
    ? `[${shape.map((value) => value ?? "?").join(", ")}]`
    : "未声明形状";
}
