import fs from "node:fs/promises";
import path from "node:path";

export type SessionMetrics = {
  id: string;
  path: string;
  bytes: number;
  turns: number;
  mtimeMs: number;
  cwd?: string;
};

export async function computeMetrics(filePath: string): Promise<SessionMetrics> {
  const st = await fs.stat(filePath);
  const text = await fs.readFile(filePath, "utf8");
  let turns = 0;
  let cwd: string | undefined;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj: unknown;
    try { obj = JSON.parse(trimmed); } catch { continue; }
    if (!obj || typeof obj !== "object") continue;
    const rec = obj as Record<string, unknown>;
    if (typeof rec.cwd === "string" && !cwd) cwd = rec.cwd;
    if (rec.type === "user" || rec.type === "assistant") turns += 1;
  }
  return {
    id: path.basename(filePath, ".jsonl"),
    path: filePath,
    bytes: st.size,
    turns,
    mtimeMs: st.mtimeMs,
    cwd,
  };
}
