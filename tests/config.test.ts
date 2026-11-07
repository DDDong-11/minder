import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  validateConfig,
  saveConfig,
  loadConfig,
  configExists,
  ConfigMissingError,
  type MinderConfig,
} from "../src/config.js";

function sampleConfig(): MinderConfig {
  return {
    repos: ["/tmp/repo-a"],
    reportDir: "/tmp/reports",
    claudeDir: "/tmp/fake-claude",
    dashboardPort: 3920,
    thresholds: { maxBytes: 5_000_000, maxTurns: 80 },
    polish: { enabled: false, agent: "claude" },
  };
}

describe("validateConfig", () => {
  it("accepts a complete config", () => {
    expect(validateConfig(sampleConfig()).dashboardPort).toBe(3920);
  });

  it("rejects missing thresholds (no hardcoded defaults)", () => {
    const raw = { ...sampleConfig(), thresholds: undefined };
    expect(() => validateConfig(raw)).toThrow(/thresholds/i);
  });

  it("rejects non-positive threshold numbers", () => {
    const raw = {
      ...sampleConfig(),
      thresholds: { maxBytes: 0, maxTurns: 10 },
    };
    expect(() => validateConfig(raw)).toThrow(/maxBytes/i);
  });
});

describe("saveConfig / loadConfig", () => {
  let tmp: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "minder-cfg-"));
    env = { ...process.env, MINDER_HOME: tmp };
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("round-trips config to disk", async () => {
    expect(await configExists(env)).toBe(false);
    await saveConfig(sampleConfig(), env);
    expect(await configExists(env)).toBe(true);
    const loaded = await loadConfig(env);
    expect(loaded).toEqual(sampleConfig());
  });

  it("throws ConfigMissingError when absent", async () => {
    await expect(loadConfig(env)).rejects.toBeInstanceOf(ConfigMissingError);
  });
});
