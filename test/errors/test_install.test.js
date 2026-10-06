import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock("@/errors/notify", () => ({ notifyError: mocks.notify }));

import { emitAuthRequired } from "@/errors/session";
import { installErrorHandling } from "@/errors/install";

describe("installErrorHandling", () => {
  it("tells the auth store when a request was refused for want of a sign-in", () => {
    const auth = { handleAuthRequired: vi.fn() };
    const dispose = installErrorHandling({ config: {} }, auth);
    emitAuthRequired("e");
    expect(auth.handleAuthRequired).toHaveBeenCalledWith("e");
    dispose();
    emitAuthRequired("again");
    expect(auth.handleAuthRequired).toHaveBeenCalledTimes(1);
  });

  it("logs an uncaught error and tells the user, rather than failing silently", () => {
    const app = { config: {} };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    installErrorHandling(app, { handleAuthRequired() {} });
    const err = new Error("boom");
    app.config.errorHandler(err);
    expect(log).toHaveBeenCalledWith(err);
    expect(mocks.notify).toHaveBeenCalledWith(err, {
      fallback: "Something went wrong",
    });
  });
});
