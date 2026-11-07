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
