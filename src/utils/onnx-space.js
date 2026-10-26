import { AppError, KIND, decodeError } from "@/errors";
import { validateDocument } from "@/onnx/config/document.js";
import { parseSpaceResourceUrl } from "@/onnx/engine/pipeline-config.js";
import { onnxSpaceAPI, repoAPI } from "./api.js";
import { onnxContext, onnxResourceUrl } from "./onnx-space-paths.js";

export const ONNX_SPACE_PATH = ".cheesecave/onnx-space.json";
const MAX_CONFIG_BYTES = 1_048_576;
const invalid = (message) =>
  new AppError({ kind: KIND.INVALID, serverMessage: message });
const defaultConfig = () => ({ version: 1, enabled: false, document: null });

function headCommit(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{40,64}$/i.test(value))
    throw invalid("仓库没有返回有效提交版本");
  return value;
}

// A repository document may only use that repository's resources. On another
// branch or historical view the paths stay the same and the revision follows it.
export function bindOnnxDocument(raw, context) {
  const target = onnxContext(context);
  let document;
  try {
    document = validateDocument(raw);
  } catch (error) {
    throw invalid(error.message || "Demo 配置无效");
  }
  const rebind = (url) => {
    const parsed = parseSpaceResourceUrl(url);
    if (!parsed || parsed.id !== target.id)
      throw invalid("Demo 只能引用当前 Space 仓库中的资源");
    return onnxResourceUrl(target, parsed.path);
  };
  document.task.model.url = rebind(document.task.model.url);
  if (document.task.sample)
    document.task.sample.url = rebind(document.task.sample.url);
  if (document.task.labelFile != null)
    document.task.labelFile = rebind(document.task.labelFile);
  return validateDocument(document);
}

export function validateOnnxSpaceConfig(context, raw) {
  onnxContext(context);
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(raw))
  )
    throw invalid("ONNX Space 配置需要 JSON 对象");
  const keys = Reflect.ownKeys(raw);
  if (
    keys.length !== 3 ||
    keys.some(
      (key) =>
        !["version", "enabled", "document"].includes(key) ||
        !Object.hasOwn(Object.getOwnPropertyDescriptor(raw, key), "value"),
    )
  )
    throw invalid("ONNX Space 配置字段无效");
  if (raw.version !== 1 || typeof raw.enabled !== "boolean")
    throw invalid("ONNX Space 配置版本或启用状态无效");
  const document =
    raw.document === null ? null : bindOnnxDocument(raw.document, context);
  const config = { version: 1, enabled: raw.enabled, document };
  if (
    new TextEncoder().encode(JSON.stringify(config)).byteLength >
    MAX_CONFIG_BYTES
  )
    throw invalid("ONNX Space 配置不能超过 1 MiB");
  return config;
}

async function readConfig(response) {
  if (!response.body) throw invalid("ONNX Space 配置文件为空");
  if (Number(response.headers.get("content-length")) > MAX_CONFIG_BYTES) {
    await response.body?.cancel();
    throw invalid("ONNX Space 配置不能超过 1 MiB");
  }
  const reader = response.body.getReader(),
    chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_CONFIG_BYTES) {
        await reader.cancel();
        throw invalid("ONNX Space 配置不能超过 1 MiB");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw invalid("ONNX Space 配置不是有效的 UTF-8 JSON");
  }
}

export async function loadOnnxSpace(context, { signal } = {}) {
  onnxContext(context);
  const commit = headCommit(await onnxSpaceAPI.getHead(context, { signal }));
  let response;
  try {
    response = await onnxSpaceAPI.readResource(
      onnxResourceUrl({ ...context, revision: commit }, ONNX_SPACE_PATH),
      { signal },
    );
  } catch (error) {
    const decoded = decodeError(error);
    if (
      decoded.status === 404 &&
      !["RepoNotFound", "RevisionNotFound"].includes(decoded.code)
    )
      return { config: defaultConfig(), commit };
    throw decoded;
  }
  return {
    config: validateOnnxSpaceConfig(context, await readConfig(response)),
    commit,
  };
}

export async function saveOnnxSpace(
  context,
  config,
  { parentCommit, message = "Update ONNX browser demo" } = {},
) {
  const { encodedId, encodedRevision } = onnxContext(context);
  headCommit(parentCommit);
  const validated = validateOnnxSpaceConfig(context, config);
  const [namespace, name] = encodedId.split("/");
  let response;
  try {
    response = await repoAPI.commitFiles(
      "space",
      namespace,
      name,
      encodedRevision,
      {
        message,
        parentCommit,
        files: [
          {
            path: ONNX_SPACE_PATH,
            content: JSON.stringify(validated, null, 2) + "\n",
          },
        ],
      },
    );
  } catch (error) {
    const decoded = decodeError(error);
    if (decoded.status === 412)
      throw new AppError({
        ...decoded,
        kind: KIND.CONFLICT,
        serverMessage: "仓库已有新提交，请重新载入后再保存。",
        cause: error,
      });
    throw decoded;
  }
  return { config: validated, commit: headCommit(response.data.commitOid) };
}

export function canEditOnnxSpace(authStore, namespace, isExternal = false) {
  if (isExternal || !authStore?.isAuthenticated || !namespace) return false;
  if (authStore.username === namespace) return true;
  const organizations =
    authStore.organizations || authStore.userOrganizations || [];
  return organizations.some(
    (org) =>
      org.name === namespace &&
      ["member", "admin", "super-admin"].includes(org.roleInOrg ?? org.role),
  );
}

export function onnxEditorLocation(context) {
  const { encodedId, encodedRevision } = onnxContext(context);
  return { path: `/spaces/${encodedId}/onnx-editor/${encodedRevision}` };
}

export function onnxAppLocation(context) {
  const { encodedId, revision } = onnxContext(context);
  return { path: `/spaces/${encodedId}`, query: { revision } };
}
