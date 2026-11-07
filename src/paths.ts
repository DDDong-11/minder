import path from "node:path";
import os from "node:os";

export function getMinderHome(env: NodeJS.ProcessEnv = process.env): string {
  if (env.MINDER_HOME && env.MINDER_HOME.trim()) {
    return path.resolve(env.MINDER_HOME);
  }
  const home = env.HOME || env.USERPROFILE || os.homedir();
  return path.join(home, ".minder");
}

export function getConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(getMinderHome(env), "config.json");
}

export function getStateDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(getMinderHome(env), "state");
}

export function getStatePath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(getStateDir(env), "sessions.json");
}
