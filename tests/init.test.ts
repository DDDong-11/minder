import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildConfigFromAnswers, runInit, type InitAnswers } from "../src/init.js";
import { loadConfig } from "../src/config.js";

const baseAnswers = (): InitAnswers => ({
  repos: ["/work/a"],
  reportDir: "/work/reports",
  claudeDir: "/work/claude",
  dashboardPort: 3920,
  maxBytes: 8_000_000,
  maxTurns: 100,
  polishEnabled: true,
  polishAgent: "claude",
  overwrite: true,
});

describe("buildConfigFromAnswers", () => {
  it("maps answers into MinderConfig without inventing thresholds", () => {
    const cfg = buildConfigFromAnswers(baseAnswers());
    expect(cfg.thresholds.maxBytes).toBe(8_000_000);
    expect(cfg.thresholds.maxTurns).toBe(100);
    expect(cfg.polish.enabled).toBe(true);
    expect(cfg.dashboardPort).toBe(3920);
  });
});

describe("runInit", () => {
  let tmp: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "minder-init-"));
    env = { ...process.env, MINDER_HOME: tmp };
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("writes config via injected prompter", async () => {
    const cfg = await runInit({
      env,
      prompt: { async ask() { return baseAnswers(); } },
    });
    expect(cfg.repos).toEqual(["/work/a"]);
    const loaded = await loadConfig(env);
    expect(loaded.thresholds.maxTurns).toBe(100);
  });

  it("refuses to overwrite when overwrite=false and config exists", async () => {
    await runInit({
      env,
      prompt: { async ask() { return baseAnswers(); } },
    });
    await expect(
      runInit({
        env,
        prompt: {
          async ask() {
            return { ...baseAnswers(), overwrite: false };
          },
        },
      }),
    ).rejects.toThrow(/exists/i);
  });
});
