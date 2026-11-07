#!/usr/bin/env node
import { Command } from "commander";
import { loadConfig, ConfigMissingError } from "./config.js";
import { runInit } from "./init.js";
import { runDaily } from "./daily/run.js";
import { runWatch } from "./watch/run.js";
import { startDashboard } from "./dash/server.js";

export type BuildProgramOptions = {
  exitOverride?: boolean;
  env?: NodeJS.ProcessEnv;
};

export function buildProgram(opts: BuildProgramOptions = {}): Command {
  const env = opts.env ?? process.env;
  const program = new Command();
  program
    .name("minder")
    .description("Local daily reports + Claude session monitor")
    .version("0.1.0");
  if (opts.exitOverride) program.exitOverride();

  program
    .command("init")
    .description("Interactive setup; writes ~/.minder/config.json")
    .action(async () => {
      const cfg = await runInit({ env });
      console.log(
        `Wrote config with ${cfg.repos.length} repo(s); dashboard port ${cfg.dashboardPort}`,
      );
    });

  program
    .command("daily")
    .description("Generate deterministic git daily report (optional herdr polish)")
    .option("--since <spec>", "git --since value (default: today local midnight)")
    .option("--polish", "force herdr polish attempt")
    .option("--no-polish", "skip polish even if enabled in config")
    .action(async (cmdOpts: { since?: string; polish?: boolean }) => {
      const config = await loadConfig(env);
      const result = await runDaily({
        config,
        since: cmdOpts.since,
        polish: cmdOpts.polish,
        env,
      });
      console.log(`Report: ${result.reportPath}`);
      if (result.polishedPath) console.log(`Polished: ${result.polishedPath}`);
      if (result.polishSkippedReason) console.log(`Polish: ${result.polishSkippedReason}`);
    });

  program
    .command("watch")
    .description("Scan Claude transcripts and alert on threshold breaches")
    .option("--once", "single scan then exit", false)
    .option("--interval <ms>", "scan interval ms", (v: string) => Number(v), 15000)
    .action(async (cmdOpts: { once?: boolean; interval: number }) => {
      const config = await loadConfig(env);
      console.log(
        "Watching Claude sessions. Proxy metrics from local transcript files (bytes/turns), not exact model context-window usage.",
      );
      await runWatch({
        config,
        env,
        once: Boolean(cmdOpts.once),
        intervalMs: cmdOpts.interval,
      });
    });

  program
    .command("dash")
    .description("Serve localhost dashboard")
    .option("--port <n>", "port override", (v: string) => Number(v))
    .action(async (cmdOpts: { port?: number }) => {
      const config = await loadConfig(env);
      try {
        const server = await startDashboard({
          config,
          host: "127.0.0.1",
          port: cmdOpts.port,
          env,
        });
        console.log(`minder dashboard at ${server.url} (127.0.0.1 only)`);
        console.log(
          "Proxy metrics from local transcript files (bytes/turns), not exact model context-window usage.",
        );
        console.log(
          "Preview may include code snippets from local transcripts; do not expose this port.",
        );
      } catch (err) {
        const e = err as NodeJS.ErrnoException;
        if (e.code === "EADDRINUSE") {
          console.error(
            `Dashboard port in use; pass --port or change dashboardPort in config. (${e.message})`,
          );
          process.exitCode = 1;
          return;
        }
        throw err;
      }
    });

  return program;
}

async function main() {
  const program = buildProgram();
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    if (err instanceof ConfigMissingError) {
      console.error(err.message);
      process.exitCode = 1;
      return;
    }
    throw err;
  }
}

const entry = process.argv[1] ?? "";
if (entry.endsWith("cli.js") || entry.endsWith("cli.ts") || /(?:^|\/)minder$/.test(entry)) {
  void main();
}
