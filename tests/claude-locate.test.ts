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
