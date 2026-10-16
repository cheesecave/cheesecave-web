// PROTOTYPE ONLY. Stands in for the backend's per-user preferences endpoint while there is none, with the contract
// the frontend expects of the real one:
//   GET /api/users/{username}/preferences  ->  { markdown_style: "vitepress" | null }
//   PUT /api/users/{username}/preferences  <-  { markdown_style: "vitepress" | null }   (merges; null clears)
// State is a JSON file, so it outlives the page, the browser and the dev server, as a database row would.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const FILE = "/tmp/md-dev-preferences.json";
const read = () =>
  existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};

export function devPreferences() {
  return {
    name: "dev-preferences",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = /^\/api\/users\/([^/]+)\/preferences(?:\?.*)?$/.exec(
          req.url ?? "",
        );
        if (!match) return next();
        const user = decodeURIComponent(match[1]);
        const send = (status, body) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(body));
        };
        if (req.method === "GET")
          return send(200, read()[user] ?? { markdown_style: null });
        if (req.method === "PUT") {
          let raw = "";
          req.on("data", (chunk) => (raw += chunk));
          req.on("end", () => {
            try {
              const patch = JSON.parse(raw);
              const all = read();
              all[user] = {
                ...(all[user] ?? { markdown_style: null }),
                ...patch,
              };
              writeFileSync(FILE, JSON.stringify(all));
              send(200, all[user]);
            } catch {
              send(400, { error: "bad request" });
            }
          });
          return;
        }
        next();
      });
    },
  };
}
