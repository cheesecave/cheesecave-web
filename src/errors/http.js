// fetch with the same failure model as the axios calls: a bounded wait, and
// every failure an AppError (decoded from the response when there was one).

import { AppError, KIND } from "./appError";
import { decodeError, decodeResponse } from "./decode";
import { describeError } from "./copy";

const DEFAULT_TIMEOUT_MS = 30000;

/**
 * @param {RequestInfo|URL} input
 * @param {RequestInit} [init]
 * @param {{timeoutMs?:number, expect?:"json"|"any"}} [options]
 *   expect "json": a 200 whose body is an HTML page is a proxy answering for the API
 * @returns {Promise<Response>} an ok response; anything else throws an AppError
 */
export async function hubFetch(
  input,
  init = {},
  { timeoutMs = DEFAULT_TIMEOUT_MS, expect = "any" } = {},
) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const caller = init.signal;
  if (caller) {
    if (caller.aborted) controller.abort();
    else
      caller.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
  }
  let response;
  try {
    response = await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    throw timedOut
      ? new AppError({ kind: KIND.TIMEOUT, cause: err })
      : decodeError(err);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw decodeResponse(
      { status: response.status, headers: response.headers, body },
      response,
    );
  }
  if (
    expect === "json" &&
    /text\/html/i.test(response.headers.get("content-type") || "")
  ) {
    throw decodeResponse(
      { status: response.status, headers: response.headers, body: "<html>" },
      response,
    );
  }
  return response;
}

/**
 * Ask for one byte of `url`, to learn before a download starts whether it can.
 * @returns {Promise<{ok:true,error:null}|{ok:false,error:AppError}>}
 */
export async function probeUrl(url) {
  try {
    await hubFetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      redirect: "follow",
    });
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error };
  }
}

/** One line for the toast of a download that cannot start. */
export function downloadMessage(error) {
  const { title } = describeError(error, { noun: "file" });
  return `Download failed: ${title}`;
}
