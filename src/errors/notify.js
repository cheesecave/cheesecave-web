// The toast for a failed action. One wording rule everywhere: what was being
// attempted, then why, in a line; for a failure on the server's side, the
// request ID follows, with a button to copy it.

import { h } from "vue";
import { ElMessage } from "element-plus";

import { copyToClipboard } from "@/utils/clipboard";
import { KIND } from "./appError";
import { describeError } from "./copy";
import { decodeError } from "./decode";

const SERVER_SIDE = new Set([
  KIND.SERVER,
  KIND.UNAVAILABLE,
  KIND.UNEXPECTED,
  KIND.BUG,
  KIND.TIMEOUT,
]);
const REPEAT_WINDOW_MS = 1500;
let recent = new Map();

export function resetNotifyDedupe() {
  recent = new Map();
}

/**
 * @param {unknown} input        whatever was thrown
 * @param {{fallback?:string, noun?:string}} [options]  `fallback`: what was being attempted
 * @returns the toast, or null when there was nothing to say
 */
export function notifyError(
  input,
  { fallback = "Something went wrong", noun } = {},
) {
  const error = decodeError(input);
  const described = describeError(error, { noun });
  if (!described) return null;

  const reason =
    error.serverMessage &&
    !SERVER_SIDE.has(error.kind) &&
    described.description === error.serverMessage
      ? error.serverMessage
      : described.title;
  const line = `${fallback}: ${reason}`;

  const now = Date.now();
  const key = `${error.kind}|${line}`;
  for (const [k, at] of recent)
    if (now - at > REPEAT_WINDOW_MS) recent.delete(k);
  if (recent.has(key)) return null;
  recent.set(key, now);

  const showId = error.requestId && SERVER_SIDE.has(error.kind);
  const message = showId
    ? h("span", [
        line,
        h(
          "span",
          { style: "opacity:.7;margin-left:.5em" },
          `(request ${error.requestId})`,
        ),
        h(
          "button",
          {
            style: "margin-left:.5em;text-decoration:underline;cursor:pointer",
            onClick: () => copyToClipboard(error.requestId),
          },
          "Copy ID",
        ),
      ])
    : line;
  return ElMessage.error({
    message,
    duration: showId ? 8000 : 4500,
    showClose: true,
  });
}
