import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanOnce } from "../src/watch/scan.js";
import type { MinderConfig } from "../src/config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const tinySrc = path.join(here, "fixtures/transcripts/tiny-session.jsonl");

describe("scanOnce", () => {
  let claudeRoot: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    claudeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "minder-scan-"));
    const proj = path.join(claudeRoot, "projects", "-demo");
    await fs.mkdir(proj, { recursive: true });
    await fs.copyFile(tinySrc, path.join(proj, "tiny-session.jsonl"));
    env = { ...process.env, MINDER_HOME: await fs.mkdtemp(path.join(os.tmpdir(), "minder-home-")) };
  });

  afterEach(async () => {
    await fs.rm(claudeRoot, { recursive: true, force: true });
    if (env.MINDER_HOME) await fs.rm(env.MINDER_HOME, { recursive: true, force: true });
  });

  it("builds session snapshots with alert flags", async () => {
    const config: MinderConfig = {
      repos: [],
      reportDir: "/tmp/reports",
      claudeDir: claudeRoot,
      dashboardPort: 3920,
      thresholds: { maxBytes: 10, maxTurns: 100 },
      polish: { enabled: false, agent: "claude" },
    };
    const state = await scanOnce(config, null, env);
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0]?.overBytes).toBe(true);
    expect(state.disclaimer).toMatch(/Proxy metrics/);
  });
});
