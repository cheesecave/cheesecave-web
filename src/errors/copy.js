// What to say about an AppError, and what to offer. Words live here and
// nowhere else: pages hand an error and a little context to describeError()
// and render what comes back, so the same failure reads the same everywhere.
//
// Whose words: for the client mistakes (4xx) the server's own sentence is the
// best explanation ("Email already exists", "Image too large. Maximum: 10MB")
// and is shown. For failures on the server's side the sentence is internal and
// is never shown; the request ID is what to quote instead.

import { KIND } from "./appError";

const CLIENT_SIDE = new Set([
  KIND.NOT_FOUND,
  KIND.AUTH_REQUIRED,
  KIND.INVALID_CREDENTIALS,
  KIND.FORBIDDEN,
  KIND.CONFLICT,
  KIND.INVALID,
  KIND.TOO_LARGE,
  KIND.RATE_LIMITED,
  KIND.REJECTED,
  KIND.UNSUPPORTED,
]);
// a status line says nothing the title does not
const BARE_STATUS =
  /^(not found|not authenticated|forbidden|internal server error|method not allowed|service unavailable|bad gateway|unauthorized)\.?$/i;

const cap = (word) => word.charAt(0).toUpperCase() + word.slice(1);

export function retryDelaySeconds(error) {
  return error.retryAfter > 0 ? Math.ceil(error.retryAfter / 1000) : 5;
}

/** The sign-in page, coming back to `path` afterwards. Only a local path is kept. */
export function signInPath(path) {
  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.startsWith("/login")
  )
    return "/login";
  return `/login?return=${encodeURIComponent(path)}`;
}

/** "HTTP 500 · ServerError · request abc": the line to quote when reporting it. */
export function requestLine(error) {
  const parts = [];
  if (error.status) parts.push(`HTTP ${error.status}`);
  if (error.code) parts.push(error.code);
  if (error.requestId) parts.push(`request ${error.requestId}`);
  return parts.join(" · ");
}

/**
 * @param {import("./appError").AppError} error
 * @param {{noun?:string, signedIn?:boolean, sessionExpired?:boolean, storage?:boolean}} [context]
 *   `storage`: the request went from the browser to the object-storage host, where a blocked request is usually missing CORS headers
 * @returns {{title:string, description:string, icon:string, tone:"warning"|"neutral"|"danger", actions:string[]}|null}
 */
export function describeError(error, context = {}) {
  const {
    noun = "page",
    signedIn = false,
    sessionExpired = false,
    storage = false,
  } = context;
  if (error.kind === KIND.CANCELLED) return null;
  const said =
    error.serverMessage && !BARE_STATUS.test(error.serverMessage)
      ? error.serverMessage
      : null;
  const theirs = CLIENT_SIDE.has(error.kind) ? said : null;
  const make = (title, description, icon, tone, actions = []) => ({
    title,
    description,
    icon,
    tone,
    actions,
  });

  switch (error.kind) {
    case KIND.NOT_FOUND: {
      let hint;
      if (sessionExpired) {
        hint =
          "Your session has expired. Sign in again to check whether it is there.";
      } else if (signedIn) {
        hint =
          "It may not exist, or it may be private and you don't have access.";
      } else {
        hint = "It may not exist. If it is private, sign in and try again.";
      }
      const actions =
        sessionExpired || !signedIn
          ? ["signin", "back", "home"]
          : ["back", "home"];
      // only a repository can be hidden from you: for anything else the
      // server's sentence, or a plain "gone", is the whole story
      if (noun === "repository") {
        // their sentence, then ours: end theirs properly so they do not run together
        if (theirs)
          hint = `${/[.!?]$/.test(theirs) ? theirs : `${theirs}.`} ${hint}`;
      } else {
        hint = theirs || "It may have been moved or deleted.";
      }
      return make(
        `${cap(noun)} not found`,
        hint,
        "i-carbon-document-unknown",
        "neutral",
        actions,
      );
    }
    case KIND.AUTH_REQUIRED:
      if (sessionExpired)
        return describeError(
          new error.constructor({ ...error, kind: KIND.SESSION_EXPIRED }),
          context,
        );
      return make(
        "Sign in required",
        theirs && !/^not authenticated/i.test(theirs)
          ? theirs
          : "Sign in to continue.",
        "i-carbon-user",
        "warning",
        ["signin", "back"],
      );
    case KIND.SESSION_EXPIRED:
      return make(
        "Your session has expired",
        "Sign in again to continue. Changes you hadn't saved were not kept.",
        "i-carbon-time",
        "warning",
        ["signin"],
      );
    case KIND.INVALID_CREDENTIALS:
      return make(
        "Sign-in failed",
        theirs || "Check your username and password.",
        "i-carbon-misuse",
        "warning",
      );
    case KIND.FORBIDDEN:
      return make(
        "You don't have access",
        theirs || "You don't have permission to do this.",
        "i-carbon-locked",
        "warning",
        ["back", "home"],
      );
    case KIND.GATED:
      return make(
        "Access needs a token",
        "This repository is gated. Add an access token for its source in your account settings, then try again.",
        "i-carbon-locked",
        "warning",
        ["settings", "back"],
      );
    case KIND.CONFLICT:
      return make(
        "Conflict",
        `${theirs || "This conflicts with something that already exists."}${error.retriable ? " Try again in a moment." : ""}`,
        "i-carbon-warning-alt",
        "warning",
        error.retriable ? ["retry"] : [],
      );
    case KIND.INVALID:
      return make(
        "Check your input",
        theirs || "Some of the values are not valid.",
        "i-carbon-warning-alt",
        "warning",
      );
    case KIND.TOO_LARGE:
      return make(
        "Over the limit",
        theirs || "That is bigger than is allowed.",
        "i-carbon-warning-alt",
        "warning",
      );
    case KIND.RATE_LIMITED: {
      const seconds = retryDelaySeconds(error);
      return make(
        "Too many requests",
        `Wait ${seconds} ${seconds === 1 ? "second" : "seconds"} and try again.`,
        "i-carbon-time",
        "warning",
        ["retry"],
      );
    }
    case KIND.REJECTED:
      return make(
        "Request not accepted",
        theirs || "The server refused this request.",
        "i-carbon-warning-alt",
        "warning",
      );
    case KIND.UNSUPPORTED:
      return make(
        "Not supported",
        theirs || "The server doesn't support this yet.",
        "i-carbon-warning-alt",
        "neutral",
      );
    case KIND.UNAVAILABLE:
      return make(
        "Service unavailable",
        "The server, or a source it depends on, isn't responding. This is usually temporary.",
        "i-carbon-cloud-offline",
        "neutral",
        ["retry"],
      );
    case KIND.SERVER:
      return make(
        "Something went wrong on the server",
        "It was not your doing. Try again, and if it keeps happening, quote the details below.",
        "i-carbon-warning-alt",
        "danger",
        ["retry"],
      );
    case KIND.TIMEOUT:
      return make(
        "The server took too long",
        "Try again. If it keeps happening, the server may be busy.",
        "i-carbon-time",
        "neutral",
        ["retry"],
      );
    case KIND.NETWORK:
      return error.offline
        ? make(
            "You're offline",
            "Reconnect and try again.",
            "i-carbon-cloud-offline",
            "neutral",
            ["retry"],
          )
        : storage
          ? make(
              "Browser blocked the request",
              "This looks like a CORS failure on the object-storage host. Preview needs the S3/MinIO backend to advertise Access-Control-Allow-Origin (see docs/development/local-dev.md, 'MinIO CORS'). If your connection dropped instead, try again.",
              "i-carbon-cloud-offline",
              "neutral",
              ["retry"],
            )
          : make(
              "Can't reach the server",
              "Check your connection, then try again.",
              "i-carbon-cloud-offline",
              "neutral",
              ["retry"],
            );
    case KIND.UNEXPECTED:
      return make(
        "Unexpected response",
        "Something between you and the server answered instead of the API, such as a proxy or a maintenance page. Try again shortly.",
        "i-carbon-warning-alt",
        "neutral",
        ["retry"],
      );
    case KIND.BUG:
      return make(
        "Something went wrong in the app",
        "Reload the page. If it keeps happening, report it with the details below.",
        "i-carbon-warning-alt",
        "danger",
        ["retry", "reload"],
      );
    default:
      return make(
        "Something went wrong",
        "Try again in a moment.",
        "i-carbon-warning-alt",
        "neutral",
        ["retry"],
      );
  }
}
