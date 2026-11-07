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
