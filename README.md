# minder

Local CLI for **git daily reports** and a **Claude Code session monitor / localhost dashboard**.

> Package: `@dddong-11/minder` (npm name `minder` is already taken). Binary: `minder`.

## Install

```bash
npm i -g @dddong-11/minder
# or
npx @dddong-11/minder --help
```

## Commands

```bash
minder init      # interactive config → ~/.minder/config.json
minder daily     # git summary markdown (optional herdr polish)
minder watch     # scan Claude transcripts + alerts
minder dash      # http://127.0.0.1:3920 dashboard
```

`daily` flags: `--since <spec>`, `--polish`, `--no-polish`.  
`watch` flags: `--once`, `--interval <ms>` (default 15000).  
`dash` flags: `--port <n>`.

## Config

Written by `init` to `~/.minder/config.json`:

- `repos`, `reportDir`, `claudeDir`
- `dashboardPort` (init suggests 3920; the server binds `127.0.0.1` only)
- `thresholds.maxBytes` / `thresholds.maxTurns` (**required in init; no hidden defaults**)
- `polish.enabled` / `polish.agent` (`polish.agent` is a herdr agent kind, default suggestion `claude`)

Override minder home with `MINDER_HOME`. Claude root respects `CLAUDE_CONFIG_DIR`, then config `claudeDir`.

Watch state is written to `~/.minder/state/sessions.json` for the dashboard to read.

## Metrics meaning

Watch and dash show **proxy metrics** from local transcript files (byte size and user/assistant JSONL turn counts). These are **not** model context-window occupancy and are **not** a token percentage.

Claude layout (checked against Claude Code's documented session storage): transcripts live at `<claudeDir>/projects/<slug>/<sessionId>.jsonl`. `<slug>` is the project path with non-alphanumeric characters replaced by `-`. minder lists only those top-level `*.jsonl` files and skips `agent-*.jsonl` plus anything nested under a session directory (subagent transcripts). `CLAUDE_CONFIG_DIR` replaces `~/.claude` when set.

Dashboard previews show a short head/tail of recent user and assistant text. They are not a full transcript dump.

## Privacy

Everything stays on your machine. Nothing is uploaded. The dashboard binds **127.0.0.1 only** and there is no option to listen on a public interface. Transcript previews may include code snippets from local sessions — do not tunnel or expose the port.

## Optional polish

Daily reports are deterministic git summaries first (`git log`, `status`, and files touched). Polish is optional.

herdr 0.8 has no `herdr run --agent --input --output` command (`herdr --version` and `herdr agent start --kind` are the real interface; confirmed from the herdr CLI reference — this environment had no `herdr` binary to execute). When polish is enabled, minder probes `herdr --version` and then uses that workflow:

- outside Herdr: `herdr workspace create` → `herdr agent start <name> --kind <agent> --pane <id>` → `herdr agent prompt … --wait` (the agent is asked to write polished markdown to a temp file)
- inside Herdr (`HERDR_ENV=1`): `herdr pane split --current --no-focus` instead of creating a workspace

If herdr is missing, no session can be created, or the agent flow fails, the deterministic report is still written and minder prints why polish was skipped. The workspace or pane minder created for polish is closed afterward.

## License

MIT
