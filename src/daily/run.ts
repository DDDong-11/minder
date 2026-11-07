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
    env: opts.env,
  });
  if (!polished.polished) {
    console.log(`[minder] polish skipped: ${polished.skippedReason}`);
    return { reportPath, polishSkippedReason: polished.skippedReason };
  }

  const polishedPath = path.join(opts.config.reportDir, `daily-${date}.polished.md`);
  await writeFile(polishedPath, polished.polished, "utf8");
  return { reportPath, polishedPath };
}
