import fs from "node:fs/promises";

function extractText(rec: Record<string, unknown>): string {
  const message = rec.message;
  if (!message || typeof message !== "object") return "";
  const content = (message as Record<string, unknown>).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (!block || typeof block !== "object") return "";
        const b = block as Record<string, unknown>;
        return typeof b.text === "string" ? b.text : "";
      })
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

export async function buildPreview(
  filePath: string,
  opts: { head?: number; tail?: number; maxChars?: number } = {},
): Promise<string> {
  const headN = opts.head ?? 3;
  const tailN = opts.tail ?? 3;
  const maxChars = opts.maxChars ?? 1500;
  const text = await fs.readFile(filePath, "utf8");
  const turns: { type: string; text: string }[] = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj: unknown;
    try { obj = JSON.parse(trimmed); } catch { continue; }
    if (!obj || typeof obj !== "object") continue;
    const rec = obj as Record<string, unknown>;
    if (rec.type !== "user" && rec.type !== "assistant") continue;
    const body = extractText(rec).replace(/\s+/g, " ").trim();
    if (!body) continue;
    turns.push({ type: String(rec.type), text: body.slice(0, 240) });
  }

  const parts: string[] = [];
  const head = turns.slice(0, headN);
  const tail = turns.length > headN ? turns.slice(Math.max(headN, turns.length - tailN)) : [];
  for (const t of head) parts.push(`[${t.type}] ${t.text}`);
  if (tail.length && turns.length > headN + tailN) parts.push("…");
  for (const t of tail) parts.push(`[${t.type}] ${t.text}`);

  let out = parts.join("\n");
  if (out.length > maxChars) out = out.slice(0, maxChars - 1) + "…";
  return out || "(no user/assistant text found)";
}
