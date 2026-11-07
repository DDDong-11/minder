import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startDashboard } from "../src/dash/server.js";
import { saveWatchState } from "../src/watch/state.js";
import { PROXY_METRICS_DISCLAIMER } from "../src/watch/alert.js";
import type { MinderConfig } from "../src/config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const tinySrc = path.join(here, "fixtures/transcripts/tiny-session.jsonl");

describe("startDashboard", () => {
  let env: NodeJS.ProcessEnv;
  let claudeRoot: string;
  let close: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "minder-dash-home-"));
    env = { ...process.env, MINDER_HOME: home };
    claudeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "minder-dash-claude-"));
    const proj = path.join(claudeRoot, "projects", "-demo");
    await fs.mkdir(proj, { recursive: true });
    const sessionPath = path.join(proj, "tiny-session.jsonl");
    await fs.copyFile(tinySrc, sessionPath);
    await saveWatchState(
      {
        updatedAt: new Date().toISOString(),
        disclaimer: PROXY_METRICS_DISCLAIMER,
        sessions: [
          {
            id: "tiny-session",
            path: sessionPath,
            projectSlug: "-demo",
            bytes: 100,
            turns: 2,
            mtimeMs: Date.now(),
            bytesPerMinute: 0,
            overBytes: false,
            overTurns: false,
            alerting: false,
          },
        ],
      },
      env,
    );
  });

  afterEach(async () => {
    if (close) await close();
    if (env.MINDER_HOME) await fs.rm(env.MINDER_HOME, { recursive: true, force: true });
    await fs.rm(claudeRoot, { recursive: true, force: true });
  });

  it("serves session list and preview on 127.0.0.1", async () => {
    const config: MinderConfig = {
      repos: [],
      reportDir: "/tmp/reports",
      claudeDir: claudeRoot,
      dashboardPort: 0,
      thresholds: { maxBytes: 9_999_999, maxTurns: 999 },
      polish: { enabled: false, agent: "claude" },
    };
    const server = await startDashboard({ config, host: "127.0.0.1", port: 0, env });
    close = server.close;

    const listRes = await fetch(`${server.url}/api/sessions`);
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as { sessions: { id: string }[] };
    expect(list.sessions[0]?.id).toBe("tiny-session");

    const prevRes = await fetch(`${server.url}/api/session/tiny-session/preview`);
    expect(prevRes.status).toBe(200);
    const prev = (await prevRes.json()) as { preview: string };
    expect(prev.preview).toMatch(/hello|hi/i);

    const htmlRes = await fetch(`${server.url}/`);
    const html = await htmlRes.text();
    expect(html).toMatch(/minder/i);
    expect(html).toMatch(/tiny-session/);
    expect(html).toMatch(/Proxy metrics/i);
  });
});
