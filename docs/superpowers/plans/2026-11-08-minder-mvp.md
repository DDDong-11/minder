# minder MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an npm-installable TypeScript CLI (`minder`) that configures itself via `init`, writes deterministic git daily reports (optional herdr polish), watches Claude Code transcript files for proxy size/turn alerts, and serves a localhost dashboard on port 3920.

**Architecture:** Single npm package with four Commander commands sharing `~/.minder/config.json` and `~/.minder/state/sessions.json`. Watch scans `claudeDir/projects/*/*.jsonl` (top-level session files only), computes bytes/turns growth, writes shared state, and prints/alerts. Dash binds `127.0.0.1` and reads that state plus on-demand transcript summary previews. Daily runs git summary first; polish is an optional subprocess to `herdr` that never blocks a successful report. No Router, Alma, Electron, or Java.

**Tech Stack:** TypeScript (Node 20+), Commander, Vitest, `node:http` + inline HTML for dash, `node:child_process` for git/herdr, `@clack/prompts` for init.

## Global Constraints

- Package name on npm: `@dddong-11/minder` (unscoped `minder@1.1.2` already taken by an unrelated audit tool); CLI bin name remains `minder`.
- GitHub remote target: `DDDong-11/minder`.
- Config path: `~/.minder/config.json`; state path: `~/.minder/state/sessions.json`.
- Thresholds `thresholds.maxBytes` and `thresholds.maxTurns` are required and set only in `init` — never invent numeric defaults in code.
- Dashboard default bind: `127.0.0.1:3920` (port overridable via config or `--port`).
- Metrics are **proxy** (file bytes / JSONL turn counts), never advertised as real model context-window %.
- Claude sessions: only top-level `*.jsonl` under `projects/<slug>/` whose basename does **not** start with `agent-`; respect `CLAUDE_CONFIG_DIR` then config `claudeDir` then `~/.claude`.
- No Router / Alma / Electron / Java in MVP.
- herdr is optional; missing herdr must still succeed daily without polish.
- All network for dash is localhost-only; no upload paths.
- Tests run with Vitest; use fixtures under `tests/fixtures/`.

---

## File Structure

```text
minder/
  package.json                 # @dddong-11/minder, bin minder → dist/cli.js
  tsconfig.json                # strict ESM NodeNext
  vitest.config.ts
  README.md
  .gitignore
  src/
    cli.ts                     # Commander entry: init|daily|watch|dash
    paths.ts                   # resolve minder home, config/state paths (HOME-aware)
    config.ts                  # MinderConfig types, load/save/validate
    init.ts                    # interactive wizard → config
    claude/
      locate.ts                # resolve claudeDir, list session jsonl paths
      metrics.ts               # bytes, turns, mtime from a transcript
      preview.ts               # head/tail message summary for dash
    watch/
      scan.ts                  # scan all sessions + growth vs prior state
      alert.ts                 # threshold checks + console (+ optional notify)
      state.ts                 # read/write ~/.minder/state/sessions.json
      run.ts                   # watch loop (interval)
    dash/
      server.ts                # 127.0.0.1 HTTP: /, /api/sessions, /api/session/:id/preview
      ui.ts                    # HTML string for dashboard page
    daily/
      git-summary.ts           # git log/status/files → markdown
      polish.ts                # optional herdr call
      run.ts                   # orchestrate daily
  tests/
    fixtures/
      transcripts/
        tiny-session.jsonl
        large-session.jsonl
    config.test.ts
    paths.test.ts
    init.test.ts
    claude-locate.test.ts
    claude-metrics.test.ts
    claude-preview.test.ts
    watch-alert.test.ts
    watch-scan.test.ts
    watch-state.test.ts
    dash-server.test.ts
    daily-git-summary.test.ts
    daily-polish.test.ts
    cli.test.ts
  docs/superpowers/...
```

---

### Task 1: Package scaffold + path helpers

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/paths.ts`
- Create: `tests/paths.test.ts`

**Interfaces:**
- Consumes: none
- Produces: `getMinderHome(env?: NodeJS.ProcessEnv): string`, `getConfigPath(env?: NodeJS.ProcessEnv): string`, `getStatePath(env?: NodeJS.ProcessEnv): string`, `getStateDir(env?: NodeJS.ProcessEnv): string`

- [ ] **Step 1: Write the failing test**

```ts
// tests/paths.test.ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import { getMinderHome, getConfigPath, getStatePath, getStateDir } from "../src/paths.js";

describe("paths", () => {
  it("resolves minder home under HOME", () => {
    const env = { HOME: "/tmp/fake-home" };
    expect(getMinderHome(env)).toBe(path.join("/tmp/fake-home", ".minder"));
    expect(getConfigPath(env)).toBe(path.join("/tmp/fake-home", ".minder", "config.json"));
    expect(getStateDir(env)).toBe(path.join("/tmp/fake-home", ".minder", "state"));
    expect(getStatePath(env)).toBe(
      path.join("/tmp/fake-home", ".minder", "state", "sessions.json"),
    );
  });

  it("prefers MINDER_HOME when set", () => {
    const env = { HOME: "/tmp/fake-home", MINDER_HOME: "/tmp/custom-minder" };
    expect(getMinderHome(env)).toBe("/tmp/custom-minder");
    expect(getConfigPath(env)).toBe(path.join("/tmp/custom-minder", "config.json"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /workspace/dongzhiwei/minder && npm test -- tests/paths.test.ts 2>&1 | tail -20`

Expected: FAIL (no package.json / cannot find module `../src/paths.js`).

- [ ] **Step 3: Write package scaffold + implementation**

```json
// package.json
{
  "name": "@dddong-11/minder",
  "version": "0.1.0",
  "description": "Local CLI for git daily reports and Claude Code session context monitoring",
  "type": "module",
  "bin": {
    "minder": "./dist/cli.js"
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx src/cli.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepublishOnly": "npm run build"
  },
  "engines": { "node": ">=20" },
  "keywords": ["claude", "cli", "daily-report", "dashboard"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/DDDong-11/minder.git"
  },
  "dependencies": {
    "@clack/prompts": "^0.10.0",
    "commander": "^13.1.0"
  },
  "devDependencies": {
    "@types/node": "^22.13.10",
    "tsx": "^4.19.3",
    "typescript": "^5.8.2",
    "vitest": "^3.0.8"
  }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"]
}
```

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
```

```gitignore
# .gitignore
node_modules/
dist/
coverage/
*.log
.DS_Store
```

```ts
// src/paths.ts
import path from "node:path";
import os from "node:os";

export function getMinderHome(env: NodeJS.ProcessEnv = process.env): string {
  if (env.MINDER_HOME && env.MINDER_HOME.trim()) {
    return path.resolve(env.MINDER_HOME);
  }
  const home = env.HOME || env.USERPROFILE || os.homedir();
  return path.join(home, ".minder");
}

export function getConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(getMinderHome(env), "config.json");
}

export function getStateDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(getMinderHome(env), "state");
}

export function getStatePath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(getStateDir(env), "sessions.json");
}
```

- [ ] **Step 4: Install deps and run test to verify it passes**

Run:

```bash
cd /workspace/dongzhiwei/minder
npm install
npx vitest run tests/paths.test.ts
```

Expected: PASS (1 file, 2 tests).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore src/paths.ts tests/paths.test.ts
git commit -m "chore: scaffold minder package and path helpers"
```

---

### Task 2: Config load / save / validate

**Files:**
- Create: `src/config.ts`
- Create: `tests/config.test.ts`

**Interfaces:**
- Consumes: `getConfigPath` from `src/paths.ts`
- Produces:
  - `export type MinderThresholds = { maxBytes: number; maxTurns: number }`
  - `export type MinderPolish = { enabled: boolean; agent: string }`
  - `export type MinderConfig = { repos: string[]; reportDir: string; claudeDir: string; dashboardPort: number; thresholds: MinderThresholds; polish: MinderPolish }`
  - `loadConfig(env?: NodeJS.ProcessEnv): Promise<MinderConfig>`
  - `saveConfig(config: MinderConfig, env?: NodeJS.ProcessEnv): Promise<void>`
  - `configExists(env?: NodeJS.ProcessEnv): Promise<boolean>`
  - `validateConfig(raw: unknown): MinderConfig`
  - `ConfigMissingError` class

- [ ] **Step 1: Write the failing test**

```ts
// tests/config.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config.test.ts`

Expected: FAIL with cannot find module `../src/config.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/config.ts
import fs from "node:fs/promises";
import { getConfigPath, getMinderHome } from "./paths.js";

export type MinderThresholds = {
  maxBytes: number;
  maxTurns: number;
};

export type MinderPolish = {
  enabled: boolean;
  agent: string;
};

export type MinderConfig = {
  repos: string[];
  reportDir: string;
  claudeDir: string;
  dashboardPort: number;
  thresholds: MinderThresholds;
  polish: MinderPolish;
};

export class ConfigMissingError extends Error {
  constructor(configPath: string) {
    super(`No minder config found at ${configPath}. Run \`minder init\` first.`);
    this.name = "ConfigMissingError";
  }
}

function isPositiveInt(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 && Number.isInteger(n);
}

export function validateConfig(raw: unknown): MinderConfig {
  if (!raw || typeof raw !== "object") {
    throw new Error("Config must be an object");
  }
  const o = raw as Record<string, unknown>;

  // Empty repos [] is allowed (watch-only setups). Non-strings / blank entries are not.
  if (!Array.isArray(o.repos) || o.repos.some((r) => typeof r !== "string" || !String(r).trim())) {
    throw new Error("Config.repos must be an array of non-empty strings (empty array allowed)");
  }
  if (typeof o.reportDir !== "string" || !o.reportDir.trim()) {
    throw new Error("Config.reportDir must be a non-empty string");
  }
  if (typeof o.claudeDir !== "string" || !o.claudeDir.trim()) {
    throw new Error("Config.claudeDir must be a non-empty string");
  }
  if (!isPositiveInt(o.dashboardPort) || (o.dashboardPort as number) > 65535) {
    throw new Error("Config.dashboardPort must be an integer 1–65535");
  }

  const th = o.thresholds;
  if (!th || typeof th !== "object") {
    throw new Error("Config.thresholds is required (set during minder init; no hardcoded defaults)");
  }
  const thresholds = th as Record<string, unknown>;
  if (!isPositiveInt(thresholds.maxBytes)) {
    throw new Error("Config.thresholds.maxBytes must be a positive integer");
  }
  if (!isPositiveInt(thresholds.maxTurns)) {
    throw new Error("Config.thresholds.maxTurns must be a positive integer");
  }

  const polishRaw = o.polish;
  if (!polishRaw || typeof polishRaw !== "object") {
    throw new Error("Config.polish is required");
  }
  const polish = polishRaw as Record<string, unknown>;
  if (typeof polish.enabled !== "boolean") {
    throw new Error("Config.polish.enabled must be boolean");
  }
  if (typeof polish.agent !== "string" || !polish.agent.trim()) {
    throw new Error("Config.polish.agent must be a non-empty string");
  }

  return {
    repos: (o.repos as string[]).map((r) => r.trim()),
    reportDir: o.reportDir.trim(),
    claudeDir: o.claudeDir.trim(),
    dashboardPort: o.dashboardPort as number,
    thresholds: {
      maxBytes: thresholds.maxBytes as number,
      maxTurns: thresholds.maxTurns as number,
    },
    polish: {
      enabled: polish.enabled,
      agent: polish.agent.trim(),
    },
  };
}

export async function configExists(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  try {
    await fs.access(getConfigPath(env));
    return true;
  } catch {
    return false;
  }
}

export async function saveConfig(
  config: MinderConfig,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const validated = validateConfig(config);
  const home = getMinderHome(env);
  await fs.mkdir(home, { recursive: true });
  const target = getConfigPath(env);
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(validated, null, 2) + "\n", "utf8");
  await fs.rename(tmp, target);
}

export async function loadConfig(env: NodeJS.ProcessEnv = process.env): Promise<MinderConfig> {
  const target = getConfigPath(env);
  let text: string;
  try {
    text = await fs.readFile(target, "utf8");
  } catch {
    throw new ConfigMissingError(target);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON in config at ${target}`);
  }
  return validateConfig(parsed);
}
```

Note: empty `repos: []` is allowed for watch-only setups (array of strings with zero entries). Adjust the repos check if a test needs empty arrays — use:

```ts
if (!Array.isArray(o.repos) || o.repos.some((r) => typeof r !== "string" || !String(r).trim())) {
```

and allow length 0.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/config.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add minder config load/save/validate"
```

---

### Task 3: `init` wizard (answers → config)

**Files:**
- Create: `src/init.ts`
- Create: `tests/init.test.ts`

**Interfaces:**
- Consumes: `MinderConfig`, `saveConfig`, `configExists`, `validateConfig`
- Produces:
  - `export type InitAnswers = { repos: string[]; reportDir: string; claudeDir: string; dashboardPort: number; maxBytes: number; maxTurns: number; polishEnabled: boolean; polishAgent: string; overwrite: boolean }`
  - `buildConfigFromAnswers(answers: InitAnswers): MinderConfig`
  - `runInit(opts: { env?: NodeJS.ProcessEnv; prompt?: InitPrompter }): Promise<MinderConfig>`
  - `export type InitPrompter = { ask(ctx: { exists: boolean }): Promise<InitAnswers> }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/init.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/init.test.ts`

Expected: FAIL — cannot find module `../src/init.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/init.ts
import path from "node:path";
import os from "node:os";
import * as p from "@clack/prompts";
import {
  type MinderConfig,
  saveConfig,
  configExists,
  validateConfig,
} from "./config.js";

export type InitAnswers = {
  repos: string[];
  reportDir: string;
  claudeDir: string;
  dashboardPort: number;
  maxBytes: number;
  maxTurns: number;
  polishEnabled: boolean;
  polishAgent: string;
  overwrite: boolean;
};

export type InitPrompter = {
  ask: (ctx: { exists: boolean }) => Promise<InitAnswers>;
};

export function buildConfigFromAnswers(answers: InitAnswers): MinderConfig {
  return validateConfig({
    repos: answers.repos,
    reportDir: answers.reportDir,
    claudeDir: answers.claudeDir,
    dashboardPort: answers.dashboardPort,
    thresholds: {
      maxBytes: answers.maxBytes,
      maxTurns: answers.maxTurns,
    },
    polish: {
      enabled: answers.polishEnabled,
      agent: answers.polishAgent,
    },
  });
}

function defaultClaudeDir(env: NodeJS.ProcessEnv): string {
  if (env.CLAUDE_CONFIG_DIR && env.CLAUDE_CONFIG_DIR.trim()) {
    return path.resolve(env.CLAUDE_CONFIG_DIR);
  }
  return path.join(env.HOME || env.USERPROFILE || os.homedir(), ".claude");
}

export async function interactivePrompt(ctx: {
  exists: boolean;
  env: NodeJS.ProcessEnv;
}): Promise<InitAnswers> {
  p.intro("minder init");
  let overwrite = true;
  if (ctx.exists) {
    const ans = await p.confirm({
      message: "Config already exists. Overwrite?",
      initialValue: false,
    });
    if (p.isCancel(ans)) {
      p.cancel("Init cancelled");
      process.exit(1);
    }
    if (!ans) {
      throw new Error("Config already exists; refusing to overwrite");
    }
    overwrite = true;
  }

  const reposRaw = await p.text({
    message: "Git repo paths for daily reports (comma-separated; leave empty for watch-only)",
    placeholder: "/path/to/repo",
  });
  if (p.isCancel(reposRaw)) { p.cancel("Init cancelled"); process.exit(1); }

  const reportDir = await p.text({
    message: "Daily report output directory",
    placeholder: "~/minder-reports",
  });
  if (p.isCancel(reportDir)) { p.cancel("Init cancelled"); process.exit(1); }

  const claudeDir = await p.text({
    message: "Claude config/session root directory",
    initialValue: defaultClaudeDir(ctx.env),
  });
  if (p.isCancel(claudeDir)) { p.cancel("Init cancelled"); process.exit(1); }

  const portRaw = await p.text({
    message: "Dashboard port",
    initialValue: "3920",
  });
  if (p.isCancel(portRaw)) { p.cancel("Init cancelled"); process.exit(1); }

  const maxBytesRaw = await p.text({
    message: "Alert threshold: max transcript bytes per session (required, no default)",
    placeholder: "5000000",
  });
  if (p.isCancel(maxBytesRaw)) { p.cancel("Init cancelled"); process.exit(1); }
  if (!String(maxBytesRaw).trim()) {
    throw new Error("maxBytes is required; no hardcoded default");
  }

  const maxTurnsRaw = await p.text({
    message: "Alert threshold: max turns per session (required, no default)",
    placeholder: "80",
  });
  if (p.isCancel(maxTurnsRaw)) { p.cancel("Init cancelled"); process.exit(1); }
  if (!String(maxTurnsRaw).trim()) {
    throw new Error("maxTurns is required; no hardcoded default");
  }

  const polishEnabled = await p.confirm({
    message: "Enable optional herdr polish for daily reports by default?",
    initialValue: false,
  });
  if (p.isCancel(polishEnabled)) { p.cancel("Init cancelled"); process.exit(1); }

  const polishAgent = await p.text({
    message: "Polish agent name",
    initialValue: "claude",
  });
  if (p.isCancel(polishAgent)) { p.cancel("Init cancelled"); process.exit(1); }

  const repos = String(reposRaw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    repos,
    reportDir: String(reportDir).trim(),
    claudeDir: String(claudeDir).trim(),
    dashboardPort: Number(portRaw),
    maxBytes: Number(maxBytesRaw),
    maxTurns: Number(maxTurnsRaw),
    polishEnabled: Boolean(polishEnabled),
    polishAgent: String(polishAgent).trim() || "claude",
    overwrite,
  };
}

export async function runInit(opts: {
  env?: NodeJS.ProcessEnv;
  prompt?: InitPrompter;
}): Promise<MinderConfig> {
  const env = opts.env ?? process.env;
  const exists = await configExists(env);
  const prompt = opts.prompt ?? {
    ask: async () => interactivePrompt({ exists, env }),
  };
  const answers = await prompt.ask({ exists });
  if (exists && !answers.overwrite) {
    throw new Error("Config already exists; refusing to overwrite");
  }
  const config = buildConfigFromAnswers(answers);
  await saveConfig(config, env);
  return config;
}
```

Also fix `validateConfig` repos rule so empty arrays are allowed:

```ts
if (!Array.isArray(o.repos) || o.repos.some((r) => typeof r !== "string" || !String(r).trim())) {
  throw new Error("Config.repos must be an array of non-empty strings");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/init.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/init.ts tests/init.test.ts src/config.ts
git commit -m "feat: add minder init wizard and answer→config mapping"
```

---

### Task 4: Claude locate + metrics + preview (fixtures)

**Files:**
- Create: `src/claude/locate.ts`
- Create: `src/claude/metrics.ts`
- Create: `src/claude/preview.ts`
- Create: `tests/fixtures/transcripts/tiny-session.jsonl`
- Create: `tests/fixtures/transcripts/large-session.jsonl`
- Create: `tests/claude-locate.test.ts`
- Create: `tests/claude-metrics.test.ts`
- Create: `tests/claude-preview.test.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `resolveClaudeDir(configClaudeDir: string, env?: NodeJS.ProcessEnv): string`
  - `listSessionTranscripts(claudeDir: string): Promise<SessionFile[]>`
  - `export type SessionFile = { id: string; path: string; projectSlug: string }`
  - `computeMetrics(filePath: string): Promise<SessionMetrics>`
  - `export type SessionMetrics = { id: string; path: string; bytes: number; turns: number; mtimeMs: number; cwd?: string }`
  - `buildPreview(filePath: string, opts?: { head?: number; tail?: number; maxChars?: number }): Promise<string>`
  - Turn counting: JSONL lines with `type` `"user"` or `"assistant"`; skip corrupt lines
  - Listing rule: only top-level `*.jsonl` under `projects/<slug>/`; skip `agent-*.jsonl` and nested subagent paths

- [ ] **Step 1: Write fixtures and failing tests**

Create `tests/fixtures/transcripts/tiny-session.jsonl` with exactly these three lines:

```text
{"type":"user","uuid":"u1","sessionId":"tiny-session","cwd":"/repo/demo","timestamp":"2026-11-08T01:00:00.000Z","message":{"role":"user","content":"hello"}}
{"type":"assistant","uuid":"a1","sessionId":"tiny-session","cwd":"/repo/demo","timestamp":"2026-11-08T01:00:01.000Z","message":{"role":"assistant","content":[{"type":"text","text":"hi"}]}}
{"type":"system","uuid":"s1","sessionId":"tiny-session","timestamp":"2026-11-08T01:00:02.000Z"}
```

Create `tests/fixtures/transcripts/large-session.jsonl` with four turn lines (2 user + 2 assistant) including longer text for truncation.

```ts
// tests/claude-locate.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listSessionTranscripts, resolveClaudeDir } from "../src/claude/locate.js";

describe("resolveClaudeDir", () => {
  it("prefers CLAUDE_CONFIG_DIR over config value", () => {
    const env = { CLAUDE_CONFIG_DIR: "/env/claude" };
    expect(resolveClaudeDir("/cfg/claude", env)).toBe(path.resolve("/env/claude"));
  });

  it("falls back to config when env unset", () => {
    expect(resolveClaudeDir("/cfg/claude", {})).toBe(path.resolve("/cfg/claude"));
  });
});

describe("listSessionTranscripts", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "minder-claude-"));
    const proj = path.join(root, "projects", "-tmp-demo");
    await fs.mkdir(proj, { recursive: true });
    await fs.writeFile(path.join(proj, "abc.jsonl"), "{}\n");
    await fs.writeFile(path.join(proj, "agent-xyz.jsonl"), "{}\n");
    await fs.mkdir(path.join(proj, "abc", "subagents"), { recursive: true });
    await fs.writeFile(path.join(proj, "abc", "subagents", "agent-nested.jsonl"), "{}\n");
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("lists only top-level non-agent jsonl sessions", async () => {
    const files = await listSessionTranscripts(root);
    expect(files.map((f) => f.id).sort()).toEqual(["abc"]);
    expect(files[0]?.projectSlug).toBe("-tmp-demo");
  });

  it("errors clearly when projects root missing", async () => {
    const missing = path.join(root, "missing-root");
    await expect(listSessionTranscripts(missing)).rejects.toThrow(/Claude directory not found/i);
  });
});
```

```ts
// tests/claude-metrics.test.ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeMetrics } from "../src/claude/metrics.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const tiny = path.join(here, "fixtures/transcripts/tiny-session.jsonl");

describe("computeMetrics", () => {
  it("counts user+assistant turns and bytes", async () => {
    const m = await computeMetrics(tiny);
    expect(m.id).toBe("tiny-session");
    expect(m.turns).toBe(2);
    expect(m.bytes).toBeGreaterThan(0);
    expect(m.cwd).toBe("/repo/demo");
  });
});
```

```ts
// tests/claude-preview.test.ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPreview } from "../src/claude/preview.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const large = path.join(here, "fixtures/transcripts/large-session.jsonl");

describe("buildPreview", () => {
  it("returns a truncated summary with head and tail turns", async () => {
    const text = await buildPreview(large, { head: 1, tail: 1 });
    expect(text).toMatch(/start/i);
    expect(text).toMatch(/done/i);
    expect(text.length).toBeLessThan(2000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/claude-locate.test.ts tests/claude-metrics.test.ts tests/claude-preview.test.ts`

Expected: FAIL — modules missing.

- [ ] **Step 3: Write implementations**

```ts
// src/claude/locate.ts
import fs from "node:fs/promises";
import path from "node:path";

export type SessionFile = {
  id: string;
  path: string;
  projectSlug: string;
};

export function resolveClaudeDir(
  configClaudeDir: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (env.CLAUDE_CONFIG_DIR && env.CLAUDE_CONFIG_DIR.trim()) {
    return path.resolve(env.CLAUDE_CONFIG_DIR);
  }
  return path.resolve(configClaudeDir);
}

export async function listSessionTranscripts(claudeDir: string): Promise<SessionFile[]> {
  const projectsRoot = path.join(claudeDir, "projects");
  let slugs: string[];
  try {
    slugs = await fs.readdir(projectsRoot);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      throw new Error(`Claude directory not found: ${claudeDir} (expected projects/ under it)`);
    }
    throw err;
  }

  const out: SessionFile[] = [];
  for (const slug of slugs) {
    const dir = path.join(projectsRoot, slug);
    let st;
    try { st = await fs.stat(dir); } catch { continue; }
    if (!st.isDirectory()) continue;

    let entries: string[];
    try { entries = await fs.readdir(dir); } catch { continue; }

    for (const name of entries) {
      if (!name.endsWith(".jsonl")) continue;
      if (name.startsWith("agent-")) continue;
      const full = path.join(dir, name);
      const stFile = await fs.stat(full);
      if (!stFile.isFile()) continue;
      out.push({
        id: name.replace(/\.jsonl$/i, ""),
        path: full,
        projectSlug: slug,
      });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
```

```ts
// src/claude/metrics.ts
import fs from "node:fs/promises";
import path from "node:path";

export type SessionMetrics = {
  id: string;
  path: string;
  bytes: number;
  turns: number;
  mtimeMs: number;
  cwd?: string;
};

export async function computeMetrics(filePath: string): Promise<SessionMetrics> {
  const st = await fs.stat(filePath);
  const text = await fs.readFile(filePath, "utf8");
  let turns = 0;
  let cwd: string | undefined;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj: unknown;
    try { obj = JSON.parse(trimmed); } catch { continue; }
    if (!obj || typeof obj !== "object") continue;
    const rec = obj as Record<string, unknown>;
    if (typeof rec.cwd === "string" && !cwd) cwd = rec.cwd;
    if (rec.type === "user" || rec.type === "assistant") turns += 1;
  }
  return {
    id: path.basename(filePath, ".jsonl"),
    path: filePath,
    bytes: st.size,
    turns,
    mtimeMs: st.mtimeMs,
    cwd,
  };
}
```

```ts
// src/claude/preview.ts
import fs from "node:fs/promises";

function extractText(rec: Record<string, unknown>): string {
  const message = rec.message;
  if (!message || typeof message !== "object") return "";
  const content = (message as Record<string, unknown>).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (!block || typeof block !== "object") return "";
        const b = block as Record<string, unknown>;
        return typeof b.text === "string" ? b.text : "";
      })
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

export async function buildPreview(
  filePath: string,
  opts: { head?: number; tail?: number; maxChars?: number } = {},
): Promise<string> {
  const headN = opts.head ?? 3;
  const tailN = opts.tail ?? 3;
  const maxChars = opts.maxChars ?? 1500;
  const text = await fs.readFile(filePath, "utf8");
  const turns: { type: string; text: string }[] = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj: unknown;
    try { obj = JSON.parse(trimmed); } catch { continue; }
    if (!obj || typeof obj !== "object") continue;
    const rec = obj as Record<string, unknown>;
    if (rec.type !== "user" && rec.type !== "assistant") continue;
    const body = extractText(rec).replace(/\s+/g, " ").trim();
    if (!body) continue;
    turns.push({ type: String(rec.type), text: body.slice(0, 240) });
  }

  const parts: string[] = [];
  const head = turns.slice(0, headN);
  const tail = turns.length > headN ? turns.slice(Math.max(headN, turns.length - tailN)) : [];
  for (const t of head) parts.push(`[${t.type}] ${t.text}`);
  if (tail.length && turns.length > headN + tailN) parts.push("…");
  for (const t of tail) parts.push(`[${t.type}] ${t.text}`);

  let out = parts.join("\n");
  if (out.length > maxChars) out = out.slice(0, maxChars - 1) + "…";
  return out || "(no user/assistant text found)";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/claude-locate.test.ts tests/claude-metrics.test.ts tests/claude-preview.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/claude tests/fixtures/transcripts tests/claude-locate.test.ts tests/claude-metrics.test.ts tests/claude-preview.test.ts
git commit -m "feat: locate Claude transcripts and compute proxy metrics/previews"
```

---

### Task 5: Watch — alert, state, scan loop

**Files:**
- Create: `src/watch/alert.ts`
- Create: `src/watch/state.ts`
- Create: `src/watch/scan.ts`
- Create: `src/watch/run.ts`
- Create: `tests/watch-alert.test.ts`
- Create: `tests/watch-state.test.ts`
- Create: `tests/watch-scan.test.ts`

**Interfaces:**
- Consumes: `MinderConfig`, `listSessionTranscripts`, `computeMetrics`, `resolveClaudeDir`, `getStatePath`/`getStateDir`
- Produces:
  - `PROXY_METRICS_DISCLAIMER` constant exactly: `Proxy metrics from local transcript files (bytes/turns), not exact model context-window usage.`
  - `export type SessionSnapshot = { id: string; path: string; projectSlug: string; bytes: number; turns: number; mtimeMs: number; cwd?: string; bytesPerMinute: number; overBytes: boolean; overTurns: boolean; alerting: boolean }`
  - `export type WatchState = { updatedAt: string; disclaimer: string; sessions: SessionSnapshot[] }`
  - `evaluateAlerts(metrics: { bytes: number; turns: number }, thresholds: MinderThresholds): { overBytes: boolean; overTurns: boolean; alerting: boolean }`
  - `formatAlertMessage(session: SessionSnapshot): string`
  - `loadWatchState(env?): Promise<WatchState | null>`
  - `saveWatchState(state: WatchState, env?): Promise<void>`
  - `scanOnce(config: MinderConfig, prev: WatchState | null, env?): Promise<WatchState>`
  - `runWatch(opts: { config: MinderConfig; env?: NodeJS.ProcessEnv; intervalMs?: number; once?: boolean; notify?: (msg: string) => void }): Promise<void>`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/watch-alert.test.ts
import { describe, it, expect } from "vitest";
import { evaluateAlerts, formatAlertMessage } from "../src/watch/alert.js";
import type { SessionSnapshot } from "../src/watch/scan.js";

describe("evaluateAlerts", () => {
  it("flags over-bytes and over-turns using provided thresholds only", () => {
    expect(evaluateAlerts({ bytes: 100, turns: 5 }, { maxBytes: 50, maxTurns: 10 })).toEqual({
      overBytes: true,
      overTurns: false,
      alerting: true,
    });
    expect(evaluateAlerts({ bytes: 10, turns: 5 }, { maxBytes: 50, maxTurns: 10 })).toEqual({
      overBytes: false,
      overTurns: false,
      alerting: false,
    });
  });
});

describe("formatAlertMessage", () => {
  it("mentions proxy metrics disclaimer", () => {
    const session: SessionSnapshot = {
      id: "abc",
      path: "/x/abc.jsonl",
      projectSlug: "-x",
      bytes: 99,
      turns: 12,
      mtimeMs: Date.now(),
      bytesPerMinute: 1,
      overBytes: true,
      overTurns: false,
      alerting: true,
    };
    const msg = formatAlertMessage(session);
    expect(msg).toMatch(/proxy metrics/i);
    expect(msg).toMatch(/abc/);
  });
});
```

```ts
// tests/watch-state.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadWatchState, saveWatchState, type WatchState } from "../src/watch/state.js";

describe("watch state", () => {
  let tmp: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "minder-state-"));
    env = { ...process.env, MINDER_HOME: tmp };
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("round-trips state JSON", async () => {
    const state: WatchState = {
      updatedAt: new Date().toISOString(),
      disclaimer:
        "Proxy metrics from local transcript files (bytes/turns), not exact model context-window usage.",
      sessions: [],
    };
    await saveWatchState(state, env);
    const loaded = await loadWatchState(env);
    expect(loaded).toEqual(state);
  });
});
```

```ts
// tests/watch-scan.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/watch-alert.test.ts tests/watch-state.test.ts tests/watch-scan.test.ts`

Expected: FAIL — modules missing.

- [ ] **Step 3: Write implementations**

```ts
// src/watch/alert.ts
import type { MinderThresholds } from "../config.js";
import type { SessionSnapshot } from "./scan.js";

export const PROXY_METRICS_DISCLAIMER =
  "Proxy metrics from local transcript files (bytes/turns), not exact model context-window usage.";

export function evaluateAlerts(
  metrics: { bytes: number; turns: number },
  thresholds: MinderThresholds,
): { overBytes: boolean; overTurns: boolean; alerting: boolean } {
  const overBytes = metrics.bytes > thresholds.maxBytes;
  const overTurns = metrics.turns > thresholds.maxTurns;
  return { overBytes, overTurns, alerting: overBytes || overTurns };
}

export function formatAlertMessage(session: SessionSnapshot): string {
  const reasons: string[] = [];
  if (session.overBytes) reasons.push(`bytes=${session.bytes}`);
  if (session.overTurns) reasons.push(`turns=${session.turns}`);
  return `[minder] ALERT session=${session.id} ${reasons.join(" ")} — ${PROXY_METRICS_DISCLAIMER}`;
}
```

```ts
// src/watch/state.ts
import fs from "node:fs/promises";
import { getStateDir, getStatePath } from "../paths.js";
import type { SessionSnapshot } from "./scan.js";
import { PROXY_METRICS_DISCLAIMER } from "./alert.js";

export type WatchState = {
  updatedAt: string;
  disclaimer: string;
  sessions: SessionSnapshot[];
};

export async function loadWatchState(
  env: NodeJS.ProcessEnv = process.env,
): Promise<WatchState | null> {
  try {
    const text = await fs.readFile(getStatePath(env), "utf8");
    const parsed = JSON.parse(text) as WatchState;
    if (!parsed || !Array.isArray(parsed.sessions)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveWatchState(
  state: WatchState,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const dir = getStateDir(env);
  await fs.mkdir(dir, { recursive: true });
  const target = getStatePath(env);
  const tmp = `${target}.tmp`;
  const payload: WatchState = {
    ...state,
    disclaimer: state.disclaimer || PROXY_METRICS_DISCLAIMER,
  };
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2) + "\n", "utf8");
  await fs.rename(tmp, target);
}
```

```ts
// src/watch/scan.ts
import type { MinderConfig } from "../config.js";
import { listSessionTranscripts, resolveClaudeDir } from "../claude/locate.js";
import { computeMetrics } from "../claude/metrics.js";
import { evaluateAlerts, PROXY_METRICS_DISCLAIMER } from "./alert.js";
import type { WatchState } from "./state.js";

export type SessionSnapshot = {
  id: string;
  path: string;
  projectSlug: string;
  bytes: number;
  turns: number;
  mtimeMs: number;
  cwd?: string;
  bytesPerMinute: number;
  overBytes: boolean;
  overTurns: boolean;
  alerting: boolean;
};

export async function scanOnce(
  config: MinderConfig,
  prev: WatchState | null,
  env: NodeJS.ProcessEnv = process.env,
): Promise<WatchState> {
  const claudeDir = resolveClaudeDir(config.claudeDir, env);
  const files = await listSessionTranscripts(claudeDir);
  const prevById = new Map((prev?.sessions ?? []).map((s) => [s.id, s]));
  const now = Date.now();
  const prevUpdatedMs = prev?.updatedAt ? Date.parse(prev.updatedAt) : NaN;

  const sessions: SessionSnapshot[] = [];
  for (const file of files) {
    const metrics = await computeMetrics(file.path);
    const alerts = evaluateAlerts(metrics, config.thresholds);
    const prior = prevById.get(file.id);
    let bytesPerMinute = 0;
    if (prior && Number.isFinite(prevUpdatedMs) && now > prevUpdatedMs) {
      const deltaBytes = metrics.bytes - prior.bytes;
      const deltaMin = (now - prevUpdatedMs) / 60_000;
      if (deltaMin > 0) bytesPerMinute = deltaBytes / deltaMin;
    }
    sessions.push({
      id: file.id,
      path: file.path,
      projectSlug: file.projectSlug,
      bytes: metrics.bytes,
      turns: metrics.turns,
      mtimeMs: metrics.mtimeMs,
      cwd: metrics.cwd,
      bytesPerMinute,
      overBytes: alerts.overBytes,
      overTurns: alerts.overTurns,
      alerting: alerts.alerting,
    });
  }

  return {
    updatedAt: new Date(now).toISOString(),
    disclaimer: PROXY_METRICS_DISCLAIMER,
    sessions,
  };
}
```

```ts
// src/watch/run.ts
import type { MinderConfig } from "../config.js";
import { scanOnce } from "./scan.js";
import { loadWatchState, saveWatchState } from "./state.js";
import { formatAlertMessage } from "./alert.js";

export async function runWatch(opts: {
  config: MinderConfig;
  env?: NodeJS.ProcessEnv;
  intervalMs?: number;
  once?: boolean;
  notify?: (msg: string) => void;
}): Promise<void> {
  const env = opts.env ?? process.env;
  const intervalMs = opts.intervalMs ?? 15_000;
  const notify = opts.notify ?? ((msg: string) => console.log(msg));

  const tick = async () => {
    const prev = await loadWatchState(env);
    const state = await scanOnce(opts.config, prev, env);
    await saveWatchState(state, env);
    for (const session of state.sessions) {
      if (!session.alerting) continue;
      const was = prev?.sessions.find((s) => s.id === session.id)?.alerting;
      if (!was) notify(formatAlertMessage(session));
    }
  };

  await tick();
  if (opts.once) return;

  await new Promise<void>(() => {
    setInterval(() => {
      void tick().catch((err) => {
        console.error("[minder] watch tick failed:", err);
      });
    }, intervalMs);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/watch-alert.test.ts tests/watch-state.test.ts tests/watch-scan.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/watch tests/watch-alert.test.ts tests/watch-state.test.ts tests/watch-scan.test.ts
git commit -m "feat: add watch scan, alerts, and shared session state"
```

---

### Task 6: Dash HTTP server + simple UI

**Files:**
- Create: `src/dash/ui.ts`
- Create: `src/dash/server.ts`
- Create: `tests/dash-server.test.ts`

**Interfaces:**
- Consumes: `MinderConfig`, `loadWatchState`, `buildPreview`
- Produces:
  - `renderDashboardHtml(state: WatchState | null): string`
  - `startDashboard(opts: { config: MinderConfig; host?: string; port?: number; env?: NodeJS.ProcessEnv }): Promise<{ url: string; close: () => Promise<void> }>`
  - Routes: `GET /` HTML; `GET /api/sessions` JSON; `GET /api/session/:id/preview` JSON; bind default `127.0.0.1`

- [ ] **Step 1: Write the failing test**

```ts
// tests/dash-server.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/dash-server.test.ts`

Expected: FAIL — module missing.

- [ ] **Step 3: Write implementation**

```ts
// src/dash/ui.ts
import type { WatchState } from "../watch/state.js";
import { PROXY_METRICS_DISCLAIMER } from "../watch/alert.js";

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderDashboardHtml(state: WatchState | null): string {
  const sessions = state?.sessions ?? [];
  const updated = state?.updatedAt ?? "never";
  const disclaimer = state?.disclaimer ?? PROXY_METRICS_DISCLAIMER;
  const rows = sessions
    .map((s) => {
      const flag = s.alerting ? "ALERT" : "ok";
      return `<tr class="${s.alerting ? "alert" : ""}">
  <td><button data-id="${esc(s.id)}" class="preview-btn">${esc(s.id)}</button></td>
  <td>${s.bytes}</td>
  <td>${s.turns}</td>
  <td>${flag}</td>
  <td>${new Date(s.mtimeMs).toISOString()}</td>
</tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>minder dashboard</title>
  <meta http-equiv="refresh" content="15" />
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 1.5rem; background: #0b1020; color: #e8ecf7; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid #243049; padding: 0.5rem; text-align: left; }
    tr.alert { background: #3a1520; }
    .disclaimer { opacity: 0.8; font-size: 0.9rem; margin-bottom: 1rem; }
    #preview { white-space: pre-wrap; background: #121a2f; padding: 1rem; border-radius: 8px; margin-top: 1rem; }
    button.preview-btn { background: none; border: none; color: #8ec7ff; cursor: pointer; font: inherit; padding: 0; }
  </style>
</head>
<body>
  <h1>minder</h1>
  <p class="disclaimer">${esc(disclaimer)}</p>
  <p>Updated: ${esc(updated)} · auto-refresh 15s · <a href="/" style="color:#8ec7ff">manual refresh</a></p>
  <table>
    <thead><tr><th>Session</th><th>Bytes</th><th>Turns</th><th>Status</th><th>Updated</th></tr></thead>
    <tbody>
      ${rows || `<tr><td colspan="5">No sessions yet. Run <code>minder watch</code>.</td></tr>`}
    </tbody>
  </table>
  <h2>Preview</h2>
  <div id="preview">Click a session id to load a short transcript summary (not full render).</div>
  <script>
    document.querySelectorAll('.preview-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const res = await fetch('/api/session/' + encodeURIComponent(id) + '/preview');
        const data = await res.json();
        document.getElementById('preview').textContent = data.preview || data.error || 'No preview';
      });
    });
  </script>
</body>
</html>`;
}
```

```ts
// src/dash/server.ts
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
    server.once("error", reject);
    server.listen(port, host, () => resolve());
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/dash-server.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/dash tests/dash-server.test.ts
git commit -m "feat: add localhost dashboard for session list and previews"
```

---

### Task 7: Daily git summary + optional herdr polish

**Files:**
- Create: `src/daily/git-summary.ts`
- Create: `src/daily/polish.ts`
- Create: `src/daily/run.ts`
- Create: `tests/daily-git-summary.test.ts`
- Create: `tests/daily-polish.test.ts`

**Interfaces:**
- Consumes: `MinderConfig`
- Produces:
  - `export type ExecFn = (command: string, args: string[], opts?: { cwd?: string }) => Promise<{ stdout: string; stderr: string; code: number }>`
  - `export type GitRepoSummary = { repo: string; ok: boolean; error?: string; branch?: string; status?: string; log?: string; files?: string }`
  - `summarizeRepo(repoPath: string, opts: { since: string; exec?: ExecFn }): Promise<GitRepoSummary>`
  - `renderDailyMarkdown(date: string, summaries: GitRepoSummary[]): string`
  - `writeDailyReport(reportDir: string, date: string, markdown: string): Promise<string>` → `reportDir/daily-YYYY-MM-DD.md`
  - `polishReport(opts: { markdown: string; agent: string; exec?: ExecFn }): Promise<{ polished: string | null; skippedReason?: string }>`
  - `runDaily(opts: { config: MinderConfig; since?: string; polish?: boolean; env?: NodeJS.ProcessEnv; exec?: ExecFn; now?: Date }): Promise<{ reportPath: string; polishedPath?: string; polishSkippedReason?: string }>`

Git commands:
1. `git -C <repo> rev-parse --is-inside-work-tree`
2. `git -C <repo> branch --show-current`
3. `git -C <repo> status --short`
4. `git -C <repo> log --since=<since> --pretty=format:%h %ad %s --date=short`
5. `git -C <repo> log --since=<since> --name-only --pretty=format:`

Polish: probe `herdr --version`; on failure skip. On success run `herdr run --agent <agent> --input <file> --output <file>`; any non-zero keeps deterministic report.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/daily-git-summary.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  summarizeRepo,
  renderDailyMarkdown,
  writeDailyReport,
} from "../src/daily/git-summary.js";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]) {
  await execFileAsync("git", args, { cwd });
}

describe("git summary", () => {
  let repo: string;

  beforeEach(async () => {
    repo = await fs.mkdtemp(path.join(os.tmpdir(), "minder-git-"));
    await git(repo, ["init"]);
    await git(repo, ["config", "user.name", "Test"]);
    await git(repo, ["config", "user.email", "test@example.com"]);
    await fs.writeFile(path.join(repo, "a.txt"), "one\n");
    await git(repo, ["add", "a.txt"]);
    await git(repo, ["commit", "-m", "feat: add a"]);
  });

  afterEach(async () => {
    await fs.rm(repo, { recursive: true, force: true });
  });

  it("summarizes commits since epoch", async () => {
    const summary = await summarizeRepo(repo, { since: "1970-01-01" });
    expect(summary.ok).toBe(true);
    expect(summary.log).toMatch(/feat: add a/);
  });

  it("skips non-git directories", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "minder-nongit-"));
    const summary = await summarizeRepo(dir, { since: "1970-01-01" });
    expect(summary.ok).toBe(false);
    expect(summary.error).toMatch(/not a git/i);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("writes markdown report file", async () => {
    const summary = await summarizeRepo(repo, { since: "1970-01-01" });
    const md = renderDailyMarkdown("2026-11-08", [summary]);
    expect(md).toMatch(/# Daily report 2026-11-08/);
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "minder-reports-"));
    const file = await writeDailyReport(outDir, "2026-11-08", md);
    expect(file).toBe(path.join(outDir, "daily-2026-11-08.md"));
    const text = await fs.readFile(file, "utf8");
    expect(text).toEqual(md);
    await fs.rm(outDir, { recursive: true, force: true });
  });
});
```

```ts
// tests/daily-polish.test.ts
import { describe, it, expect } from "vitest";
import { polishReport } from "../src/daily/polish.js";

describe("polishReport", () => {
  it("skips gracefully when herdr missing", async () => {
    const result = await polishReport({
      markdown: "# hi\n",
      agent: "claude",
      exec: async () => ({ stdout: "", stderr: "not found", code: 127 }),
    });
    expect(result.polished).toBeNull();
    expect(result.skippedReason).toMatch(/herdr/i);
  });

  it("returns polished text when herdr succeeds", async () => {
    const result = await polishReport({
      markdown: "# hi\n",
      agent: "claude",
      exec: async (cmd, args) => {
        if (cmd === "herdr" && args[0] === "--version") {
          return { stdout: "herdr 0.0.0", stderr: "", code: 0 };
        }
        return { stdout: "# polished\n", stderr: "", code: 0 };
      },
    });
    expect(result.polished).toMatch(/polished/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/daily-git-summary.test.ts tests/daily-polish.test.ts`

Expected: FAIL — modules missing.

- [ ] **Step 3: Write implementations**

```ts
// src/daily/git-summary.ts
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ExecFn = (
  command: string,
  args: string[],
  opts?: { cwd?: string },
) => Promise<{ stdout: string; stderr: string; code: number }>;

export const defaultExec: ExecFn = async (command, args, opts) => {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: opts?.cwd,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout: String(stdout), stderr: String(stderr), code: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number; message?: string };
    return {
      stdout: String(e.stdout ?? ""),
      stderr: String(e.stderr ?? e.message ?? ""),
      code: typeof e.code === "number" ? e.code : 1,
    };
  }
};

export type GitRepoSummary = {
  repo: string;
  ok: boolean;
  error?: string;
  branch?: string;
  status?: string;
  log?: string;
  files?: string;
};

export async function summarizeRepo(
  repoPath: string,
  opts: { since: string; exec?: ExecFn },
): Promise<GitRepoSummary> {
  const exec = opts.exec ?? defaultExec;
  const inside = await exec("git", ["-C", repoPath, "rev-parse", "--is-inside-work-tree"]);
  if (inside.code !== 0 || inside.stdout.trim() !== "true") {
    return { repo: repoPath, ok: false, error: "Not a git repository; skipped" };
  }
  const branch = await exec("git", ["-C", repoPath, "branch", "--show-current"]);
  const status = await exec("git", ["-C", repoPath, "status", "--short"]);
  const log = await exec("git", [
    "-C", repoPath, "log", `--since=${opts.since}`,
    "--pretty=format:%h %ad %s", "--date=short",
  ]);
  const files = await exec("git", [
    "-C", repoPath, "log", `--since=${opts.since}`,
    "--name-only", "--pretty=format:",
  ]);
  return {
    repo: repoPath,
    ok: true,
    branch: branch.stdout.trim() || "(detached)",
    status: status.stdout.trim(),
    log: log.stdout.trim(),
    files: files.stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join("\n"),
  };
}

export function renderDailyMarkdown(date: string, summaries: GitRepoSummary[]): string {
  const parts: string[] = [`# Daily report ${date}`, ""];
  for (const s of summaries) {
    parts.push(`## ${s.repo}`, "");
    if (!s.ok) {
      parts.push(`_Skipped:_ ${s.error ?? "unknown error"}`, "");
      continue;
    }
    parts.push(`- Branch: \`${s.branch}\``, "");
    parts.push("### Status", "```", s.status || "(clean)", "```", "");
    parts.push("### Commits", "```", s.log || "(none)", "```", "");
    parts.push("### Files touched", "```", s.files || "(none)", "```", "");
  }
  return parts.join("\n");
}

export async function writeDailyReport(
  reportDir: string,
  date: string,
  markdown: string,
): Promise<string> {
  await fs.mkdir(reportDir, { recursive: true });
  const file = path.join(reportDir, `daily-${date}.md`);
  await fs.writeFile(file, markdown, "utf8");
  return file;
}
```

```ts
// src/daily/polish.ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { defaultExec, type ExecFn } from "./git-summary.js";

export async function polishReport(opts: {
  markdown: string;
  agent: string;
  exec?: ExecFn;
}): Promise<{ polished: string | null; skippedReason?: string }> {
  const exec = opts.exec ?? defaultExec;
  const version = await exec("herdr", ["--version"]);
  if (version.code !== 0) {
    return {
      polished: null,
      skippedReason: "herdr not available; kept deterministic report only",
    };
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "minder-polish-"));
  const inFile = path.join(dir, "input.md");
  const outFile = path.join(dir, "output.md");
  await fs.writeFile(inFile, opts.markdown, "utf8");

  const run = await exec("herdr", [
    "run",
    "--agent",
    opts.agent,
    "--input",
    inFile,
    "--output",
    outFile,
  ]);

  if (run.code !== 0) {
    await fs.rm(dir, { recursive: true, force: true });
    return {
      polished: null,
      skippedReason: `herdr polish failed (code ${run.code}); kept deterministic report only`,
    };
  }

  let polished: string | null = null;
  try {
    polished = await fs.readFile(outFile, "utf8");
  } catch {
    if (run.stdout.trim()) polished = run.stdout;
  }
  await fs.rm(dir, { recursive: true, force: true });
  if (!polished || !polished.trim()) {
    return {
      polished: null,
      skippedReason: "herdr produced empty polish output; kept deterministic report only",
    };
  }
  return { polished };
}
```

```ts
// src/daily/run.ts
import path from "node:path";
import { writeFile } from "node:fs/promises";
import type { MinderConfig } from "../config.js";
import {
  defaultExec,
  renderDailyMarkdown,
  summarizeRepo,
  writeDailyReport,
  type ExecFn,
} from "./git-summary.js";
import { polishReport } from "./polish.js";

function todayISODate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function runDaily(opts: {
  config: MinderConfig;
  since?: string;
  polish?: boolean;
  env?: NodeJS.ProcessEnv;
  exec?: ExecFn;
  now?: Date;
}): Promise<{ reportPath: string; polishedPath?: string; polishSkippedReason?: string }> {
  const exec = opts.exec ?? defaultExec;
  const date = todayISODate(opts.now ?? new Date());
  const since = opts.since ?? `${date} 00:00:00`;
  const summaries = [];
  for (const repo of opts.config.repos) {
    summaries.push(await summarizeRepo(repo, { since, exec }));
  }
  const md = renderDailyMarkdown(date, summaries);
  const reportPath = await writeDailyReport(opts.config.reportDir, date, md);

  const wantPolish = opts.polish ?? opts.config.polish.enabled;
  if (!wantPolish) return { reportPath };

  const polished = await polishReport({
    markdown: md,
    agent: opts.config.polish.agent,
    exec,
  });
  if (!polished.polished) {
    console.log(`[minder] polish skipped: ${polished.skippedReason}`);
    return { reportPath, polishSkippedReason: polished.skippedReason };
  }

  const polishedPath = path.join(opts.config.reportDir, `daily-${date}.polished.md`);
  await writeFile(polishedPath, polished.polished, "utf8");
  return { reportPath, polishedPath };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/daily-git-summary.test.ts tests/daily-polish.test.ts`

Expected: PASS. For the success-path polish test, if implementation prefers reading `outFile`, the mock `exec` should also write that file — update the test mock to:

```ts
exec: async (cmd, args) => {
  if (cmd === "herdr" && args[0] === "--version") {
    return { stdout: "herdr 0.0.0", stderr: "", code: 0 };
  }
  const outIdx = args.indexOf("--output");
  if (outIdx >= 0) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(args[outIdx + 1]!, "# polished\n");
  }
  return { stdout: "# polished\n", stderr: "", code: 0 };
}
```

- [ ] **Step 5: Commit**

```bash
git add src/daily tests/daily-git-summary.test.ts tests/daily-polish.test.ts
git commit -m "feat: add daily git summary and optional herdr polish"
```

---

### Task 8: CLI wiring + README + smoke tests

**Files:**
- Create: `src/cli.ts`
- Create: `tests/cli.test.ts`
- Create: `README.md`

**Interfaces:**
- Consumes: all prior modules
- Produces: executable `minder` with `init`, `daily`, `watch`, `dash`
- Flags: `daily --since --polish/--no-polish`; `watch --once --interval`; `dash --port`
- Errors: missing config → `ConfigMissingError` exit 1; Claude dir missing → clear path error from locate; port in use → suggest `--port`

- [ ] **Step 1: Write the failing CLI test**

```ts
// tests/cli.test.ts
import { describe, it, expect } from "vitest";
import { buildProgram } from "../src/cli.js";

describe("cli", () => {
  it("registers init/daily/watch/dash", () => {
    const program = buildProgram({ exitOverride: true });
    const names = program.commands.map((c) => c.name()).sort();
    expect(names).toEqual(["daily", "dash", "init", "watch"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli.test.ts`

Expected: FAIL — module missing.

- [ ] **Step 3: Implement CLI + README**

```ts
// src/cli.ts
#!/usr/bin/env node
import { Command } from "commander";
import { loadConfig, ConfigMissingError } from "./config.js";
import { runInit } from "./init.js";
import { runDaily } from "./daily/run.js";
import { runWatch } from "./watch/run.js";
import { startDashboard } from "./dash/server.js";

export type BuildProgramOptions = {
  exitOverride?: boolean;
  env?: NodeJS.ProcessEnv;
};

export function buildProgram(opts: BuildProgramOptions = {}): Command {
  const env = opts.env ?? process.env;
  const program = new Command();
  program
    .name("minder")
    .description("Local daily reports + Claude session monitor")
    .version("0.1.0");
  if (opts.exitOverride) program.exitOverride();

  program
    .command("init")
    .description("Interactive setup; writes ~/.minder/config.json")
    .action(async () => {
      const cfg = await runInit({ env });
      console.log(
        `Wrote config with ${cfg.repos.length} repo(s); dashboard port ${cfg.dashboardPort}`,
      );
    });

  program
    .command("daily")
    .description("Generate deterministic git daily report (optional herdr polish)")
    .option("--since <spec>", "git --since value (default: today local midnight)")
    .option("--polish", "force polish attempt")
    .option("--no-polish", "skip polish even if enabled in config")
    .action(async (cmdOpts: { since?: string; polish?: boolean }) => {
      const config = await loadConfig(env);
      const result = await runDaily({
        config,
        since: cmdOpts.since,
        polish: cmdOpts.polish,
        env,
      });
      console.log(`Report: ${result.reportPath}`);
      if (result.polishedPath) console.log(`Polished: ${result.polishedPath}`);
      if (result.polishSkippedReason) console.log(`Polish: ${result.polishSkippedReason}`);
    });

  program
    .command("watch")
    .description("Scan Claude transcripts and alert on threshold breaches")
    .option("--once", "single scan then exit", false)
    .option("--interval <ms>", "scan interval ms", (v: string) => Number(v), 15000)
    .action(async (cmdOpts: { once?: boolean; interval: number }) => {
      const config = await loadConfig(env);
      console.log(
        "Watching Claude sessions. Proxy metrics from local transcript files (bytes/turns), not exact model context-window usage.",
      );
      await runWatch({
        config,
        env,
        once: Boolean(cmdOpts.once),
        intervalMs: cmdOpts.interval,
      });
    });

  program
    .command("dash")
    .description("Serve localhost dashboard")
    .option("--port <n>", "port override", (v: string) => Number(v))
    .action(async (cmdOpts: { port?: number }) => {
      const config = await loadConfig(env);
      try {
        const server = await startDashboard({
          config,
          host: "127.0.0.1",
          port: cmdOpts.port,
          env,
        });
        console.log(`minder dashboard at ${server.url} (127.0.0.1 only)`);
        console.log(
          "Proxy metrics from local transcript files (bytes/turns), not exact model context-window usage.",
        );
        console.log(
          "Preview may include code snippets from local transcripts; do not expose this port.",
        );
      } catch (err) {
        const e = err as NodeJS.ErrnoException;
        if (e.code === "EADDRINUSE") {
          console.error(
            `Dashboard port in use; pass --port or change dashboardPort in config. (${e.message})`,
          );
          process.exitCode = 1;
          return;
        }
        throw err;
      }
    });

  return program;
}

async function main() {
  const program = buildProgram();
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    if (err instanceof ConfigMissingError) {
      console.error(err.message);
      process.exitCode = 1;
      return;
    }
    throw err;
  }
}

const entry = process.argv[1] ?? "";
if (entry.endsWith("cli.js") || entry.endsWith("cli.ts") || /(?:^|\/)minder$/.test(entry)) {
  void main();
}
```

```markdown
<!-- README.md -->
# minder

Local CLI for **git daily reports** and a **Claude Code session monitor / localhost dashboard**.

> Package: `@dddong-11/minder` (npm name `minder` is already taken). Binary: `minder`.

## Install

```bash
npm i -g @dddong-11/minder
# or
npx @dddong-11/minder --help
```

## Commands

```bash
minder init      # interactive config → ~/.minder/config.json
minder daily     # git summary markdown (optional herdr polish)
minder watch     # scan Claude transcripts + alerts
minder dash      # http://127.0.0.1:3920 dashboard
```

## Config

Written by `init` to `~/.minder/config.json`:

- `repos`, `reportDir`, `claudeDir`
- `dashboardPort` (init suggests 3920)
- `thresholds.maxBytes` / `thresholds.maxTurns` (**required in init; no hidden defaults**)
- `polish.enabled` / `polish.agent`

Override minder home with `MINDER_HOME`. Claude root respects `CLAUDE_CONFIG_DIR`.

Watch state is written to `~/.minder/state/sessions.json` for the dashboard to read.

## Metrics meaning

Watch/dash show **proxy metrics** from local transcript files (bytes and user/assistant turn counts). These are **not** exact model context-window token percentages.

Claude layout expected: `~/.claude/projects/<slug>/<sessionId>.jsonl` (top-level only; `agent-*.jsonl` skipped).

## Privacy

Everything stays on your machine. The dashboard binds **127.0.0.1 only**. Transcript previews may include code snippets from local sessions — do not tunnel or expose the port.

## Optional polish

If `polish.enabled` or `--polish` is set, minder tries `herdr`. If herdr is missing or fails, the deterministic git report is still written successfully.

## License

MIT
```

- [ ] **Step 4: Run all tests + build**

Run:

```bash
npx vitest run
npm run build
node dist/cli.js --help
```

Expected: all tests PASS; help lists `init|daily|watch|dash`. Fix `validateConfig` empty-repos if daily/watch tests need `repos: []` (allow empty array of strings).

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts tests/cli.test.ts README.md
git commit -m "feat: wire minder CLI commands and README"
```

---

## Self-review (spec coverage)

| Spec requirement | Task |
|---|---|
| npm TypeScript CLI, four commands | 1, 8 |
| `~/.minder/config.json`; thresholds only via init | 2, 3 |
| Claude locate + proxy metrics + fixtures | 4 |
| watch scan/alert/state `sessions.json` | 5 |
| dash `127.0.0.1:3920` list + preview + refresh | 6 |
| daily git then optional herdr polish / graceful skip | 7 |
| README privacy + metrics disclaimer + install | 8 |
| No Router/Alma/Electron/Java | enforced by scope |
| Errors: missing init, non-git skip, herdr skip, claude dir missing, port in use | 2, 4, 5, 6, 7, 8 |
| Package name collision → scoped `@dddong-11/minder` | Global Constraints + Tasks 1/8 |

Placeholder scan: clean. herdr CLI shape is specified as best-effort `herdr run --agent --input --output` with skip-on-failure; tests inject `exec`.

Type consistency: `SessionSnapshot` in `scan.ts` imported by `alert.ts`/`state.ts`/`ui.ts`; `WatchState` in `state.ts`; `ExecFn` in `git-summary.ts` reused by polish/run; `PROXY_METRICS_DISCLAIMER` single source in `alert.ts`.

Config empty-repos: implementers must allow `repos: []` (watch-only). If Task 2 initially rejected empty arrays, Task 3/5/6/8 adjust `validateConfig` accordingly in the same commit that needs it.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-11-08-minder-mvp.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks

**2. Inline Execution** — execute tasks in this session with executing-plans checkpoints
