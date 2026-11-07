import type { MinderConfig } from "../config.js";
import { scanOnce } from "./scan.js";
import { loadWatchState, saveWatchState } from "./state.js";
import { formatAlertMessage } from "./alert.js";

export async function runWatch(opts: {
  config: MinderConfig;
  env?: NodeJS.ProcessEnv;
  intervalMs?: number;
  once?: boolean;
  notify?: (msg: string) => void;
}): Promise<void> {
  const env = opts.env ?? process.env;
  const intervalMs = opts.intervalMs ?? 15_000;
  const notify = opts.notify ?? ((msg: string) => console.log(msg));

  const tick = async () => {
    const prev = await loadWatchState(env);
    const state = await scanOnce(opts.config, prev, env);
    await saveWatchState(state, env);
    for (const session of state.sessions) {
      if (!session.alerting) continue;
      const was = prev?.sessions.find((s) => s.id === session.id)?.alerting;
      if (!was) notify(formatAlertMessage(session));
    }
  };

  await tick();
  if (opts.once) return;

  await new Promise<void>(() => {
    setInterval(() => {
      void tick().catch((err) => {
        console.error("[minder] watch tick failed:", err);
      });
    }, intervalMs);
  });
}
