import { parseSpaceResourceUrl } from "@/onnx/engine/pipeline-config.js";
import { AppError, KIND } from "@/errors";

const invalid = (message) =>
  new AppError({ kind: KIND.INVALID, serverMessage: message });
const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");

export function onnxContext(context) {
  if (
    !context ||
    typeof context.id !== "string" ||
    typeof context.revision !== "string"
  )
    throw invalid("Space 仓库和分支无效");
  const id = encodePath(context.id),
    revision = encodeURIComponent(context.revision);
  const parsed = parseSpaceResourceUrl(
    `/spaces/${id}/resolve/${revision}/check.json`,
  );
  if (
    !parsed ||
    parsed.id !== context.id ||
    parsed.revision !== context.revision ||
    context.revision.length > 255
  )
    throw invalid("Space 仓库和分支无效");
  return {
    id: context.id,
    revision: context.revision,
    encodedId: id,
    encodedRevision: revision,
  };
}

export function onnxResourceUrl(context, path) {
  const { encodedId, encodedRevision } = onnxContext(context);
  if (typeof path !== "string") throw invalid("Space 文件路径无效");
  const url = `/spaces/${encodedId}/resolve/${encodedRevision}/${encodePath(path)}`;
  if (!parseSpaceResourceUrl(url)) throw invalid("Space 文件路径无效");
  return url;
}

export function requireOnnxResourceUrl(url) {
  if (!parseSpaceResourceUrl(url))
    throw invalid("请选择同源 Space 仓库中的文件");
  return url;
}
