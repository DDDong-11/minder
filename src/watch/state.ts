import fs from "node:fs/promises";
import { getStateDir, getStatePath } from "../paths.js";
import type { SessionSnapshot } from "./scan.js";
import { PROXY_METRICS_DISCLAIMER } from "./alert.js";

export type WatchState = {
  updatedAt: string;
  disclaimer: string;
  sessions: SessionSnapshot[];
};

export async function loadWatchState(
  env: NodeJS.ProcessEnv = process.env,
): Promise<WatchState | null> {
  try {
    const text = await fs.readFile(getStatePath(env), "utf8");
    const parsed = JSON.parse(text) as WatchState;
    if (!parsed || !Array.isArray(parsed.sessions)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveWatchState(
  state: WatchState,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const dir = getStateDir(env);
  await fs.mkdir(dir, { recursive: true });
  const target = getStatePath(env);
  const tmp = `${target}.tmp`;
  const payload: WatchState = {
    ...state,
    disclaimer: state.disclaimer || PROXY_METRICS_DISCLAIMER,
  };
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2) + "\n", "utf8");
  await fs.rename(tmp, target);
}
