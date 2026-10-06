// What went wrong, in the terms the interface acts on. Everything the SPA can
// meet (an axios error, a failed fetch, a status carried by a domain error, a
// bug) is decoded into one of these by decode.js, and shown by copy.js and the
// components that read it.

export const KIND = Object.freeze({
  CANCELLED: "cancelled", // the caller gave up: never shown
  NETWORK: "network", // no answer: offline, DNS, refused
  TIMEOUT: "timeout",
  BUG: "bug", // a mistake in the app itself, not in the request
  UNEXPECTED: "unexpected-response", // an answer that is not the API's (a proxy page)
  UNAVAILABLE: "unavailable", // 502/503/504, an upstream source is down
  SERVER: "server", // the backend failed
  UNSUPPORTED: "unsupported", // 501
  GATED: "gated",
  AUTH_REQUIRED: "auth-required",
  INVALID_CREDENTIALS: "invalid-credentials",
  SESSION_EXPIRED: "session-expired",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not-found",
  CONFLICT: "conflict",
  INVALID: "invalid", // the request is wrong: carries `fields` when the server named them
  TOO_LARGE: "too-large", // too big, or over a quota
  RATE_LIMITED: "rate-limited",
  REJECTED: "rejected", // any other 4xx
});

const RETRIABLE = new Set([
  KIND.NETWORK,
  KIND.TIMEOUT,
  KIND.UNAVAILABLE,
  KIND.SERVER,
  KIND.RATE_LIMITED,
  KIND.UNEXPECTED,
]);

export class AppError extends Error {
  /**
   * @param {object} o
   * @param {string} o.kind                one of KIND
   * @param {string|null} [o.code]         the code the server sent (RepoNotFound, ...)
   * @param {number|null} [o.status]
   * @param {string|null} [o.serverMessage] the server's wording, cleaned; shown for 4xx only
   * @param {{path:string,message:string}[]} [o.fields]
   * @param {string|null} [o.requestId]    X-Request-Id: what to quote to whoever runs the server
   * @param {number|null} [o.retryAfter]   milliseconds
   * @param {object[]|null} [o.sources]    the fallback sources the hub tried
   * @param {boolean} [o.offline]          the browser says it has no network
   * @param {unknown} [o.cause]            what was thrown
   */
  constructor({
    kind,
    code = null,
    status = null,
    serverMessage = null,
    fields = [],
    requestId = null,
    retryAfter = null,
    sources = null,
    offline = false,
    cause = null,
  }) {
    super(serverMessage || kind);
    this.name = "AppError";
    this.kind = kind;
    this.code = code;
    this.status = status;
    this.serverMessage = serverMessage;
    this.fields = fields;
    this.requestId = requestId;
    this.retryAfter = retryAfter;
    this.sources = sources;
    this.offline = offline;
    // not enumerable: a logged or serialised error should not drag the raw one along
    Object.defineProperty(this, "cause", {
      value: cause,
      enumerable: false,
      writable: true,
    });
  }

  /** Worth offering "Retry": trying the same request again might work. */
  get retriable() {
    if (RETRIABLE.has(this.kind)) return true;
    // the repository name is still being released after a delete
    return this.kind === KIND.CONFLICT && this.code === "RepoNameRecycling";
  }

  toJSON() {
    const {
      kind,
      code,
      status,
      serverMessage,
      fields,
      requestId,
      retryAfter,
      offline,
    } = this;
    return {
      kind,
      code,
      status,
      serverMessage,
      fields,
      requestId,
      retryAfter,
      offline,
    };
  }
}
