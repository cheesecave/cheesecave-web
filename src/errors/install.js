import { notifyError } from "./notify";
import { onAuthRequired } from "./session";

/**
 * App-wide error wiring: a refused sign-in reaches the auth store, and an
 * error nobody caught (an event handler, a watcher) is logged and shown
 * instead of vanishing. Returns the function that unhooks the first.
 */
export function installErrorHandling(app, authStore) {
  app.config.errorHandler = (err) => {
    console.error(err);
    notifyError(err, { fallback: "Something went wrong" });
  };
  return onAuthRequired((error) => authStore.handleAuthRequired(error));
}
