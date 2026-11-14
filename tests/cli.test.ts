import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { buildProgram } from "../src/cli.js";
import { saveConfig, ConfigMissingError, type MinderConfig } from "../src/config.js";

function sample(over: Partial<MinderConfig> = {}): MinderConfig {
  return {
    repos: [],
    reportDir: "/tmp/reports",
    claudeDir: "/tmp/missing-claude",
    dashboardPort: 3920,
    thresholds: { maxBytes: 5_000_000, maxTurns: 80 },
    polish: { enabled: false, agent: "claude" },
    ...over,
  };
}

describe("cli", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    process.exitCode = undefined;
    while (cleanups.length) {
      const fn = cleanups.pop();
      if (fn) await fn();
    }
  });

  it("registers init/daily/watch/dash", () => {
    const program = buildProgram({ exitOverride: true });
    const names = program.commands.map((c) => c.name()).sort();
    expect(names).toEqual(["daily", "dash", "init", "watch"]);
  });

  it("daily fails with ConfigMissingError before init", async () => {
    const env = {
      ...process.env,
      MINDER_HOME: path.join(os.tmpdir(), `minder-missing-${Date.now()}`),
    };
    delete env.CLAUDE_CONFIG_DIR;
    const program = buildProgram({ exitOverride: true, env });
    await expect(program.parseAsync(["daily"], { from: "user" })).rejects.toBeInstanceOf(
      ConfigMissingError,
    );
  });

  it("daily writes a deterministic report and skips polish when disabled", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "minder-cli-home-"));
    const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), "minder-cli-reports-"));
    cleanups.push(async () => {
      await fs.rm(home, { recursive: true, force: true });
      await fs.rm(reportDir, { recursive: true, force: true });
    });
    const env = { ...process.env, MINDER_HOME: home };
    delete env.CLAUDE_CONFIG_DIR;
    await saveConfig(sample({ reportDir, polish: { enabled: true, agent: "claude" } }), env);
    const program = buildProgram({ exitOverride: true, env });
    await program.parseAsync(["daily", "--no-polish"], { from: "user" });
    const files = await fs.readdir(reportDir);
    expect(files.some((f) => /^daily-\d{4}-\d{2}-\d{2}\.md$/.test(f))).toBe(true);
    expect(files.some((f) => f.includes("polished"))).toBe(false);
  });

  it("watch --once errors with the missing Claude directory path", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "minder-cli-watch-"));
    cleanups.push(() => fs.rm(home, { recursive: true, force: true }));
    const missing = path.join(home, "no-claude");
    const env = { ...process.env, MINDER_HOME: home };
    delete env.CLAUDE_CONFIG_DIR;
    await saveConfig(sample({ claudeDir: missing }), env);
    const program = buildProgram({ exitOverride: true, env });
    await expect(program.parseAsync(["watch", "--once"], { from: "user" })).rejects.toThrow(
      /Claude directory not found/i,
    );
  });

  it("dash tells the user when the port is already taken", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "minder-cli-dash-"));
    cleanups.push(() => fs.rm(home, { recursive: true, force: true }));
    const blocker = http.createServer();
    await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", () => resolve()));
    cleanups.push(
      () =>
        new Promise<void>((resolve, reject) => {
          blocker.close((err) => (err ? reject(err) : resolve()));
        }),
    );
    const address = blocker.address();
    if (!address || typeof address === "string") throw new Error("blocker failed to bind");
    const env = { ...process.env, MINDER_HOME: home };
    delete env.CLAUDE_CONFIG_DIR;
    await saveConfig(sample({ dashboardPort: address.port }), env);
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    };
    try {
      const program = buildProgram({ exitOverride: true, env });
      await program.parseAsync(["dash"], { from: "user" });
      expect(process.exitCode).toBe(1);
      expect(errors.join("\n")).toMatch(/port in use/i);
    } finally {
      console.error = original;
    }
  });
});
