// Read-only ONNX metadata projection, not a graph validator or inference engine.
// Field numbers: https://github.com/onnx/onnx/blob/v1.20.1/onnx/onnx.proto
// Tensor payloads are skipped in place; model text is never evaluated.
const TYPES = [
  "undefined",
  "float32",
  "uint8",
  "int8",
  "uint16",
  "int16",
  "int32",
  "int64",
  "string",
  "bool",
  "float16",
  "float64",
  "uint32",
  "uint64",
  "complex64",
  "complex128",
  "bfloat16",
  "float8e4m3fn",
  "float8e4m3fnuz",
  "float8e5m2",
  "float8e5m2fnuz",
  "uint4",
  "int4",
  "float4e2m1",
  "float8e8m0",
  "uint2",
  "int2",
];
const decoder = new TextDecoder("utf-8", { fatal: true });
const fail = (message) => {
  throw Object.assign(new Error(`无法读取 ONNX 元信息：${message}`), {
    code: "INVALID_ONNX",
  });
};
const limit = () => {
  throw Object.assign(new Error("ONNX 元信息超出读取限制"), {
    code: "ONNX_METADATA_LIMIT",
  });
};

class Reader {
  constructor(bytes, state, start = 0, end = bytes.length, depth = 0) {
    if (depth > 64) limit();
    this.bytes = bytes;
    this.state = state;
    this.pos = start;
    this.end = end;
    this.depth = depth;
  }
  varint() {
    let result = 0n;
    for (let i = 0; i < 10; i++) {
      if (this.pos >= this.end) fail("截断的整数");
      const byte = this.bytes[this.pos++];
      if (i === 9 && byte > 1) fail("整数溢出");
      result |= BigInt(byte & 127) << BigInt(i * 7);
      if (byte < 128) return result;
    }
    fail("无效整数");
  }
  *fields() {
    while (this.pos < this.end) {
      if (++this.state.fields > 1000000) limit();
      const tag = this.varint(),
        id = Number(tag >> 3n),
        wire = Number(tag & 7n);
      if (!id || id > 536870911) fail("无效字段编号");
      const field = { id, wire };
      if (wire === 0) field.value = this.varint();
      else {
        const length =
          wire === 2 ? this.varint() : wire === 1 ? 8n : wire === 5 ? 4n : null;
        if (length === null) fail("不支持的 protobuf 编码");
        if (length > BigInt(this.end - this.pos)) fail("字段长度超过文件边界");
        field.start = this.pos;
        this.pos += Number(length);
        field.end = this.pos;
      }
      yield field;
    }
  }
  message(field) {
    if (field.wire !== 2) fail("嵌套消息编码错误");
    return new Reader(
      this.bytes,
      this.state,
      field.start,
      field.end,
      this.depth + 1,
    );
  }
  text(field) {
    if (field.wire !== 2) fail("文本编码错误");
    const length = field.end - field.start;
    this.state.textBytes += length;
    if (length > 1048576 || this.state.textBytes > 4194304) limit();
    try {
      return decoder.decode(this.bytes.subarray(field.start, field.end));
    } catch {
      fail("文本不是有效 UTF-8");
    }
  }
  integer(field) {
    if (field.wire !== 0) fail("数值编码错误");
    const value = BigInt.asIntN(64, field.value);
    if (
      value < BigInt(Number.MIN_SAFE_INTEGER) ||
      value > BigInt(Number.MAX_SAFE_INTEGER)
    )
      return value.toString();
    return Number(value);
  }
}

function entry(reader) {
  const result = { key: "", value: "" };
  for (const field of reader.fields())
    if (field.id === 1 || field.id === 2)
      result[field.id === 1 ? "key" : "value"] = reader.text(field);
  return result;
}
function shape(reader) {
  const dimensions = [];
  for (const field of reader.fields())
    if (field.id === 1) {
      if (dimensions.length >= 64) limit();
      const dimension = reader.message(field);
      let value = null;
      for (const part of dimension.fields()) {
        if (part.id === 1) value = dimension.integer(part);
        if (part.id === 2) value = dimension.text(part) || null;
      }
      dimensions.push(value);
    }
  return dimensions;
}
function tensorType(reader, sparse = false) {
  let element = 0,
    dimensions = null;
  for (const field of reader.fields()) {
    if (field.id === 1) element = reader.integer(field);
    if (field.id === 2) dimensions = shape(reader.message(field));
  }
  const type = TYPES[element] || `unknown(${element})`;
  return { type: sparse ? `sparse_tensor<${type}>` : type, shape: dimensions };
}
function valueType(reader) {
  let result = { type: "unknown", shape: null };
  for (const field of reader.fields()) {
    if (field.id === 1 || field.id === 8)
      result = tensorType(reader.message(field), field.id === 8);
    else if ([4, 5, 9].includes(field.id)) {
      reader.message(field); // Validate the container boundary without interpreting unsupported semantics.
      result = {
        type: { 4: "sequence", 5: "map", 9: "optional" }[field.id],
        shape: null,
      };
    }
  }
  return result;
}
function valueInfo(reader) {
  let name = "",
    type = null;
  for (const field of reader.fields()) {
    if (field.id === 1) name = reader.text(field);
    if (field.id === 2) type = valueType(reader.message(field));
  }
  if (!name || !type) fail("输入或输出缺少名称/类型");
  return { name, ...type };
}

function tensor(reader) {
  let name = "",
    external = false;
  const locations = [];
  for (const field of reader.fields()) {
    if (field.id === 8) name = reader.text(field);
    else if (field.id === 14) external ||= reader.integer(field) === 1;
    else if (field.id === 13) {
      external = true;
      const pair = entry(reader.message(field));
      if (pair.key === "location") locations.push(pair.value);
    }
    // raw_data and typed numeric data are intentionally not decoded or copied.
  }
  if (external) {
    reader.state.externalData = true;
    for (const location of locations) reader.state.locations.add(location);
  }
  return name;
}
function sparseTensor(reader) {
  let name = "";
  for (const field of reader.fields())
    if (field.id === 1 || field.id === 2) {
      const tensorName = tensor(reader.message(field));
      if (field.id === 1) name = tensorName;
    }
  return name;
}
function attribute(reader) {
  for (const field of reader.fields()) {
    if (field.id === 5 || field.id === 10) tensor(reader.message(field));
    else if (field.id === 6 || field.id === 11) graph(reader.message(field));
    else if (field.id === 22 || field.id === 23)
      sparseTensor(reader.message(field));
  }
}
function node(reader) {
  for (const field of reader.fields())
    if (field.id === 5) attribute(reader.message(field));
}
function graph(reader, main = false) {
  const result = {
    name: "",
    docString: "",
    inputs: [],
    outputs: [],
    initializerNames: [],
    properties: [],
  };
  for (const field of reader.fields()) {
    if (field.id === 1) node(reader.message(field));
    else if (field.id === 5 || field.id === 15) {
      const name =
        field.id === 5
          ? tensor(reader.message(field))
          : sparseTensor(reader.message(field));
      if (main) result.initializerNames.push(name);
    } else if (main) {
      if (field.id === 2) result.name = reader.text(field);
      else if (field.id === 10) result.docString = reader.text(field);
      else if (field.id === 11 || field.id === 12)
        result[field.id === 11 ? "inputs" : "outputs"].push(
          valueInfo(reader.message(field)),
        );
      else if (field.id === 16)
        result.properties.push(entry(reader.message(field)));
    }
  }
  return result;
}
function training(reader) {
  for (const field of reader.fields())
    if (field.id === 1 || field.id === 2) graph(reader.message(field));
}
function localFunction(reader) {
  for (const field of reader.fields()) {
    if (field.id === 7) node(reader.message(field));
    if (field.id === 11) attribute(reader.message(field));
  }
}
function opset(reader) {
  const result = { domain: "", version: null };
  for (const field of reader.fields()) {
    if (field.id === 1) result.domain = reader.text(field);
    if (field.id === 2) result.version = reader.integer(field);
  }
  return result;
}

export function readOnnxMetadata(bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.length)
    fail("文件为空或数据无效");
  const state = {
    fields: 0,
    textBytes: 0,
    externalData: false,
    locations: new Set(),
  };
  const reader = new Reader(bytes, state),
    metadata = {
      irVersion: null,
      producerName: "",
      producerVersion: "",
      domain: "",
      modelVersion: null,
      docString: "",
      graphName: "",
      graphDocString: "",
      opsets: [],
      properties: [],
      graphProperties: [],
      externalData: false,
      externalDataLocations: [],
    };
  let main = null;
  for (const field of reader.fields()) {
    if (field.id === 1) metadata.irVersion = reader.integer(field);
    else if (field.id >= 2 && field.id <= 4)
      metadata[
        { 2: "producerName", 3: "producerVersion", 4: "domain" }[field.id]
      ] = reader.text(field);
    else if (field.id === 5) metadata.modelVersion = reader.integer(field);
    else if (field.id === 6) metadata.docString = reader.text(field);
    else if (field.id === 7) main = graph(reader.message(field), true);
    else if (field.id === 8) metadata.opsets.push(opset(reader.message(field)));
    else if (field.id === 14)
      metadata.properties.push(entry(reader.message(field)));
    else if (field.id === 20) training(reader.message(field));
    else if (field.id === 25) localFunction(reader.message(field));
  }
  if (
    !main ||
    !Number.isInteger(metadata.irVersion) ||
    metadata.irVersion < 1 ||
    !main.outputs.length
  )
    fail("缺少有效模型版本、主图或输出");
  metadata.graphName = main.name;
  metadata.graphDocString = main.docString;
  metadata.graphProperties = main.properties;
  metadata.externalData = state.externalData;
  metadata.externalDataLocations = [...state.locations];
  const initializers = new Set(main.initializerNames);
  const inputs = main.inputs.filter((input) => !initializers.has(input.name)),
    outputs = main.outputs,
    issues = [];
  for (const [direction, values] of [
    ["input", inputs],
    ["output", outputs],
  ])
    for (const value of values) {
      if (value.type !== "float32")
        issues.push({
          code: "UNSUPPORTED_TYPE",
          direction,
          name: value.name,
          message: `${value.name} 的 ${value.type} 类型不受当前图像流程支持`,
        });
      if (
        value.shape === null ||
        value.shape.some(
          (dimension) => typeof dimension !== "number" || dimension < 0,
        )
      )
        issues.push({
          code: "DYNAMIC_SHAPE",
          direction,
          name: value.name,
          message: `${value.name} 包含动态或未声明的尺寸，需要作者指定实际尺寸`,
        });
    }
  if (state.externalData)
    issues.push({
      code: "EXTERNAL_DATA",
      message: "模型使用外置权重，当前浏览器推理流程不支持",
    });
  return { inputs, outputs, metadata, issues };
}

export async function inspectOnnxBytes(bytes) {
  const info = readOnnxMetadata(bytes);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return {
    bytes: bytes.byteLength,
    sha256: [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join(""),
    ...info,
  };
}
