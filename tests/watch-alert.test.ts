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
