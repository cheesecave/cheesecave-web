// Only inspect message-bearing keys: metadata and unknown objects are never
// stringified into a user-facing message. Bound traversal for malformed bodies.
export function readErrorMessage(value) {
  const ancestors = new WeakSet();
  let remaining = 1000;
  function read(current, depth = 0) {
    if (--remaining < 0 || depth > 20) return "";
    if (typeof current === "string") return current.trim();
    if (!current || typeof current !== "object" || ancestors.has(current))
      return "";
    ancestors.add(current);
    try {
      if (Array.isArray(current))
        return current
          .map((item) => read(item, depth + 1))
          .filter(Boolean)
          .join("; ");
      for (const key of ["error", "msg", "message", "detail"]) {
        const message = read(current[key], depth + 1);
        if (message) return message;
      }
      return "";
    } finally {
      ancestors.delete(current);
    }
  }
  return read(value);
}

export function getErrorStatusMessage(error) {
  const status = error?.response?.status;
  return Number.isInteger(status) && status >= 100 && status <= 599
    ? `Request failed (HTTP ${status}).`
    : "Request failed.";
}

// Keep precedence at the application boundary: UI conflicts favor `error`,
// Site settings favor `detail` and the request message over their fallback.
export function parseApiError(
  error,
  fallback,
  {
    preferDetail = true,
    preferRequestMessage = false,
    includeThrownError = false,
  } = {},
) {
  const data = error?.response?.data;
  const candidates = preferDetail
    ? [data?.detail, data]
    : [data?.error, data?.detail, data?.message, data];
  const requestMessages = [
    error?.message,
    ...(includeThrownError ? [error] : []),
  ];
  candidates.push(
    ...(preferRequestMessage
      ? [...requestMessages, fallback]
      : [fallback, ...requestMessages]),
  );
  for (const candidate of candidates) {
    const message = readErrorMessage(candidate);
    if (message) return message;
  }
  return getErrorStatusMessage(error);
}
