import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { defaultExec, type ExecFn } from "./git-summary.js";

const POLISH_AGENT_NAME = "minderpolish";

function parseJson(stdout: string): unknown {
  const start = stdout.indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(stdout.slice(start));
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

/**
 * Optional polish via the real herdr CLI (0.8+).
 * There is no `herdr run --agent --input --output`. When herdr is missing,
 * or a session cannot be created, the caller keeps the deterministic report.
 *
 * Outside Herdr: `workspace create` → `agent start` → `agent prompt --wait`.
 * Inside Herdr (`HERDR_ENV=1`): `pane split --current --no-focus` instead of a new workspace.
 * The agent is asked to write polished markdown to a temp file; that file is the result.
 */
export async function polishReport(opts: {
  markdown: string;
  agent: string;
  exec?: ExecFn;
  env?: NodeJS.ProcessEnv;
}): Promise<{ polished: string | null; skippedReason?: string }> {
  const exec = opts.exec ?? defaultExec;
  const env = opts.env ?? process.env;
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

  let workspaceId: string | undefined;
  let createdPaneId: string | undefined;

  const cleanup = async () => {
    try {
      if (workspaceId) {
        await exec("herdr", ["workspace", "close", workspaceId]);
      } else if (createdPaneId) {
        await exec("herdr", ["pane", "close", createdPaneId]);
      }
    } catch {
      // Closing the pane we created is best-effort and must not fail the report.
    }
    await fs.rm(dir, { recursive: true, force: true });
  };

  try {
    let paneId: string | undefined;
    if (env.HERDR_ENV === "1") {
      const split = await exec("herdr", [
        "pane",
        "split",
        "--current",
        "--direction",
        "right",
        "--cwd",
        dir,
        "--no-focus",
      ]);
      const result = asRecord(asRecord(parseJson(split.stdout))?.result);
      const pane = asRecord(result?.pane);
      if (split.code !== 0 || typeof pane?.pane_id !== "string") {
        return {
          polished: null,
          skippedReason: "herdr pane split failed; kept deterministic report only",
        };
      }
      paneId = pane.pane_id;
      createdPaneId = paneId;
    } else {
      const created = await exec("herdr", [
        "workspace",
        "create",
        "--cwd",
        dir,
        "--label",
        "minder-polish",
        "--no-focus",
      ]);
      const result = asRecord(asRecord(parseJson(created.stdout))?.result);
      const workspace = asRecord(result?.workspace);
      const root = asRecord(result?.root_pane);
      if (created.code !== 0 || typeof root?.pane_id !== "string") {
        return {
          polished: null,
          skippedReason:
            "herdr is installed but no session could be created; kept deterministic report only",
        };
      }
      paneId = root.pane_id;
      if (typeof workspace?.workspace_id === "string") workspaceId = workspace.workspace_id;
    }

    const kind = opts.agent.trim() || "claude";
    const start = await exec("herdr", [
      "agent",
      "start",
      POLISH_AGENT_NAME,
      "--kind",
      kind,
      "--pane",
      paneId,
      "--timeout",
      "30000",
    ]);
    if (start.code !== 0) {
      return {
        polished: null,
        skippedReason: `herdr agent start failed (code ${start.code}); kept deterministic report only`,
      };
    }

    const prompt =
      `Polish the markdown daily report at ${inFile}. ` +
      `Write the polished markdown only to ${outFile} ` +
      `and reply with the single word DONE.`;
    const prompted = await exec("herdr", [
      "agent",
      "prompt",
      POLISH_AGENT_NAME,
      prompt,
      "--wait",
      "--timeout",
      "120000",
    ]);
    if (prompted.code !== 0) {
      return {
        polished: null,
        skippedReason: `herdr polish failed (code ${prompted.code}); kept deterministic report only`,
      };
    }

    let polished: string | null = null;
    try {
      polished = await fs.readFile(outFile, "utf8");
    } catch {
      const read = await exec("herdr", [
        "agent",
        "read",
        POLISH_AGENT_NAME,
        "--source",
        "recent-unwrapped",
        "--lines",
        "200",
      ]);
      if (read.code === 0 && read.stdout.trim()) polished = read.stdout;
    }
    if (!polished || !polished.trim()) {
      return {
        polished: null,
        skippedReason: "herdr produced empty polish output; kept deterministic report only",
      };
    }
    return { polished };
  } finally {
    await cleanup();
  }
}
