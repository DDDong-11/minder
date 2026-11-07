import fs from "node:fs/promises";
import path from "node:path";

export type SessionFile = {
  id: string;
  path: string;
  projectSlug: string;
};

export function resolveClaudeDir(
  configClaudeDir: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (env.CLAUDE_CONFIG_DIR && env.CLAUDE_CONFIG_DIR.trim()) {
    return path.resolve(env.CLAUDE_CONFIG_DIR);
  }
  return path.resolve(configClaudeDir);
}

export async function listSessionTranscripts(claudeDir: string): Promise<SessionFile[]> {
  const projectsRoot = path.join(claudeDir, "projects");
  let slugs: string[];
  try {
    slugs = await fs.readdir(projectsRoot);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      throw new Error(`Claude directory not found: ${claudeDir} (expected projects/ under it)`);
    }
    throw err;
  }

  const out: SessionFile[] = [];
  for (const slug of slugs) {
    const dir = path.join(projectsRoot, slug);
    let st;
    try { st = await fs.stat(dir); } catch { continue; }
    if (!st.isDirectory()) continue;

    let entries: string[];
    try { entries = await fs.readdir(dir); } catch { continue; }

    for (const name of entries) {
      if (!name.endsWith(".jsonl")) continue;
      if (name.startsWith("agent-")) continue;
      const full = path.join(dir, name);
      const stFile = await fs.stat(full);
      if (!stFile.isFile()) continue;
      out.push({
        id: name.replace(/\.jsonl$/i, ""),
        path: full,
        projectSlug: slug,
      });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
