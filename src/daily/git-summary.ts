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
