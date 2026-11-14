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
