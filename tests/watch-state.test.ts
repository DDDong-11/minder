import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadWatchState, saveWatchState, type WatchState } from "../src/watch/state.js";

describe("watch state", () => {
  let tmp: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "minder-state-"));
    env = { ...process.env, MINDER_HOME: tmp };
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("round-trips state JSON", async () => {
    const state: WatchState = {
      updatedAt: new Date().toISOString(),
      disclaimer:
        "Proxy metrics from local transcript files (bytes/turns), not exact model context-window usage.",
      sessions: [],
    };
    await saveWatchState(state, env);
    const loaded = await loadWatchState(env);
    expect(loaded).toEqual(state);
  });
});
