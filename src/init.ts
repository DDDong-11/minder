import path from "node:path";
import os from "node:os";
import * as p from "@clack/prompts";
import {
  type MinderConfig,
  saveConfig,
  configExists,
  validateConfig,
} from "./config.js";

export type InitAnswers = {
  repos: string[];
  reportDir: string;
  claudeDir: string;
  dashboardPort: number;
  maxBytes: number;
  maxTurns: number;
  polishEnabled: boolean;
  polishAgent: string;
  overwrite: boolean;
};

export type InitPrompter = {
  ask: (ctx: { exists: boolean }) => Promise<InitAnswers>;
};

export function buildConfigFromAnswers(answers: InitAnswers): MinderConfig {
  return validateConfig({
    repos: answers.repos,
    reportDir: answers.reportDir,
    claudeDir: answers.claudeDir,
    dashboardPort: answers.dashboardPort,
    thresholds: {
      maxBytes: answers.maxBytes,
      maxTurns: answers.maxTurns,
    },
    polish: {
      enabled: answers.polishEnabled,
      agent: answers.polishAgent,
    },
  });
}

function defaultClaudeDir(env: NodeJS.ProcessEnv): string {
  if (env.CLAUDE_CONFIG_DIR && env.CLAUDE_CONFIG_DIR.trim()) {
    return path.resolve(env.CLAUDE_CONFIG_DIR);
  }
  return path.join(env.HOME || env.USERPROFILE || os.homedir(), ".claude");
}

export async function interactivePrompt(ctx: {
  exists: boolean;
  env: NodeJS.ProcessEnv;
}): Promise<InitAnswers> {
  p.intro("minder init");
  let overwrite = true;
  if (ctx.exists) {
    const ans = await p.confirm({
      message: "Config already exists. Overwrite?",
      initialValue: false,
    });
    if (p.isCancel(ans)) {
      p.cancel("Init cancelled");
      process.exit(1);
    }
    if (!ans) {
      throw new Error("Config already exists; refusing to overwrite");
    }
    overwrite = true;
  }

  const reposRaw = await p.text({
    message: "Git repo paths for daily reports (comma-separated; leave empty for watch-only)",
    placeholder: "/path/to/repo",
  });
  if (p.isCancel(reposRaw)) { p.cancel("Init cancelled"); process.exit(1); }

  const reportDir = await p.text({
    message: "Daily report output directory",
    placeholder: "~/minder-reports",
  });
  if (p.isCancel(reportDir)) { p.cancel("Init cancelled"); process.exit(1); }

  const claudeDir = await p.text({
    message: "Claude config/session root directory",
    initialValue: defaultClaudeDir(ctx.env),
  });
  if (p.isCancel(claudeDir)) { p.cancel("Init cancelled"); process.exit(1); }

  const portRaw = await p.text({
    message: "Dashboard port",
    initialValue: "3920",
  });
  if (p.isCancel(portRaw)) { p.cancel("Init cancelled"); process.exit(1); }

  const maxBytesRaw = await p.text({
    message: "Alert threshold: max transcript bytes per session (required, no default)",
    placeholder: "5000000",
  });
  if (p.isCancel(maxBytesRaw)) { p.cancel("Init cancelled"); process.exit(1); }
  if (!String(maxBytesRaw).trim()) {
    throw new Error("maxBytes is required; no hardcoded default");
  }

  const maxTurnsRaw = await p.text({
    message: "Alert threshold: max turns per session (required, no default)",
    placeholder: "80",
  });
  if (p.isCancel(maxTurnsRaw)) { p.cancel("Init cancelled"); process.exit(1); }
  if (!String(maxTurnsRaw).trim()) {
    throw new Error("maxTurns is required; no hardcoded default");
  }

  const polishEnabled = await p.confirm({
    message: "Enable optional herdr polish for daily reports by default?",
    initialValue: false,
  });
  if (p.isCancel(polishEnabled)) { p.cancel("Init cancelled"); process.exit(1); }

  const polishAgent = await p.text({
    message: "herdr agent kind for polish (for example claude)",
    initialValue: "claude",
  });
  if (p.isCancel(polishAgent)) { p.cancel("Init cancelled"); process.exit(1); }

  const repos = String(reposRaw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    repos,
    reportDir: String(reportDir).trim(),
    claudeDir: String(claudeDir).trim(),
    dashboardPort: Number(portRaw),
    maxBytes: Number(maxBytesRaw),
    maxTurns: Number(maxTurnsRaw),
    polishEnabled: Boolean(polishEnabled),
    polishAgent: String(polishAgent).trim() || "claude",
    overwrite,
  };
}

export async function runInit(opts: {
  env?: NodeJS.ProcessEnv;
  prompt?: InitPrompter;
}): Promise<MinderConfig> {
  const env = opts.env ?? process.env;
  const exists = await configExists(env);
  const prompt = opts.prompt ?? {
    ask: async () => interactivePrompt({ exists, env }),
  };
  const answers = await prompt.ask({ exists });
  if (exists && !answers.overwrite) {
    throw new Error("Config already exists; refusing to overwrite");
  }
  const config = buildConfigFromAnswers(answers);
  await saveConfig(config, env);
  return config;
}
