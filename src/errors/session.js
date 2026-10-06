// The axios interceptor learns of a "sign in" answer before anything else
// does, but the auth store (which imports the API module) must decide what it
// means. This is the seam between them: no import in either direction.

let handler = null;

/** Register the one handler; returns the function that unregisters it. */
export function onAuthRequired(fn) {
  handler = fn;
  return () => {
    if (handler === fn) handler = null;
  };
}

export function emitAuthRequired(error) {
  if (handler) handler(error);
}
