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
