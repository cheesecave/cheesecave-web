import { parseApiError } from "../shared/api-error.js";

/** Preserve HF conflict priority and action-specific network failure messages. */
export function getApiErrorMessage(error, fallback) {
  return parseApiError(error, fallback, { preferDetail: false });
}
