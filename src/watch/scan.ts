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
