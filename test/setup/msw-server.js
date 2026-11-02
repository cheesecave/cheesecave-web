import { http, HttpResponse, setupServer } from "@/testing/msw";

// Every profile page asks for the owner's collections; tests that care override this
export const server = setupServer(
  http.get("*/api/collections", () => HttpResponse.json([])),
);
