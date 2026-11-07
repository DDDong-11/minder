import http from "node:http";
import type { MinderConfig } from "../config.js";
import { loadWatchState } from "../watch/state.js";
import { buildPreview } from "../claude/preview.js";
import { renderDashboardHtml } from "./ui.js";

export async function startDashboard(opts: {
  config: MinderConfig;
  host?: string;
  port?: number;
  env?: NodeJS.ProcessEnv;
}): Promise<{ url: string; close: () => Promise<void> }> {
  const host = opts.host ?? "127.0.0.1";
  const port = opts.port ?? opts.config.dashboardPort;
  const env = opts.env ?? process.env;

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${host}`);
      if (req.method === "GET" && url.pathname === "/api/sessions") {
        const state = await loadWatchState(env);
        res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(state ?? { updatedAt: null, sessions: [], disclaimer: "" }));
        return;
      }

      const previewMatch = url.pathname.match(/^\/api\/session\/([^/]+)\/preview$/);
      if (req.method === "GET" && previewMatch) {
        const id = decodeURIComponent(previewMatch[1]!);
        const state = await loadWatchState(env);
        const session = state?.sessions.find((s) => s.id === id);
        if (!session) {
          res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: `session not found: ${id}` }));
          return;
        }
        const preview = await buildPreview(session.path);
        res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ id, preview }));
        return;
      }

      if (req.method === "GET" && url.pathname === "/") {
        const state = await loadWatchState(env);
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(renderDashboardHtml(state));
        return;
      }

      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
    } catch (err) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end(String(err));
    }
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => reject(err);
    server.once("error", onError);
    server.listen(port, host, () => {
      server.off("error", onError);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind dashboard server");
  }

  return {
    url: `http://${host}:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
