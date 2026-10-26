// Prototype only: choose between the candidate designs of an open question from the address bar,
// e.g. `?chips=popover`, so one build shows every option side by side. Not meant to ship: the
// chosen design replaces the call with a constant.
export function protoVariant(key, allowed, fallback) {
  try {
    const value = new URLSearchParams(window.location.search).get(key);
    return allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}
