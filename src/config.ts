import fs from "node:fs/promises";
import { getConfigPath, getMinderHome } from "./paths.js";

export type MinderThresholds = {
  maxBytes: number;
  maxTurns: number;
};

export type MinderPolish = {
  enabled: boolean;
  agent: string;
};

export type MinderConfig = {
  repos: string[];
  reportDir: string;
  claudeDir: string;
  dashboardPort: number;
  thresholds: MinderThresholds;
  polish: MinderPolish;
};

export class ConfigMissingError extends Error {
  constructor(configPath: string) {
    super(`No minder config found at ${configPath}. Run \`minder init\` first.`);
    this.name = "ConfigMissingError";
  }
}

function isPositiveInt(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 && Number.isInteger(n);
}

export function validateConfig(raw: unknown): MinderConfig {
  if (!raw || typeof raw !== "object") {
    throw new Error("Config must be an object");
  }
  const o = raw as Record<string, unknown>;

  // Empty repos [] is allowed (watch-only setups). Non-strings / blank entries are not.
  if (!Array.isArray(o.repos) || o.repos.some((r) => typeof r !== "string" || !String(r).trim())) {
    throw new Error("Config.repos must be an array of non-empty strings (empty array allowed)");
  }
  if (typeof o.reportDir !== "string" || !o.reportDir.trim()) {
    throw new Error("Config.reportDir must be a non-empty string");
  }
  if (typeof o.claudeDir !== "string" || !o.claudeDir.trim()) {
    throw new Error("Config.claudeDir must be a non-empty string");
  }
  if (!isPositiveInt(o.dashboardPort) || (o.dashboardPort as number) > 65535) {
    throw new Error("Config.dashboardPort must be an integer 1–65535");
  }

  const th = o.thresholds;
  if (!th || typeof th !== "object") {
    throw new Error("Config.thresholds is required (set during minder init; no hardcoded defaults)");
  }
  const thresholds = th as Record<string, unknown>;
  if (!isPositiveInt(thresholds.maxBytes)) {
    throw new Error("Config.thresholds.maxBytes must be a positive integer");
  }
  if (!isPositiveInt(thresholds.maxTurns)) {
    throw new Error("Config.thresholds.maxTurns must be a positive integer");
  }

  const polishRaw = o.polish;
  if (!polishRaw || typeof polishRaw !== "object") {
    throw new Error("Config.polish is required");
  }
  const polish = polishRaw as Record<string, unknown>;
  if (typeof polish.enabled !== "boolean") {
    throw new Error("Config.polish.enabled must be boolean");
  }
  if (typeof polish.agent !== "string" || !polish.agent.trim()) {
    throw new Error("Config.polish.agent must be a non-empty string");
  }

  return {
    repos: (o.repos as string[]).map((r) => r.trim()),
    reportDir: o.reportDir.trim(),
    claudeDir: o.claudeDir.trim(),
    dashboardPort: o.dashboardPort as number,
    thresholds: {
      maxBytes: thresholds.maxBytes as number,
      maxTurns: thresholds.maxTurns as number,
    },
    polish: {
      enabled: polish.enabled,
      agent: polish.agent.trim(),
    },
  };
}

export async function configExists(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  try {
    await fs.access(getConfigPath(env));
    return true;
  } catch {
    return false;
  }
}

export async function saveConfig(
  config: MinderConfig,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const validated = validateConfig(config);
  const home = getMinderHome(env);
  await fs.mkdir(home, { recursive: true });
  const target = getConfigPath(env);
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(validated, null, 2) + "\n", "utf8");
  await fs.rename(tmp, target);
}

export async function loadConfig(env: NodeJS.ProcessEnv = process.env): Promise<MinderConfig> {
  const target = getConfigPath(env);
  let text: string;
  try {
    text = await fs.readFile(target, "utf8");
  } catch {
    throw new ConfigMissingError(target);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON in config at ${target}`);
  }
  return validateConfig(parsed);
}
