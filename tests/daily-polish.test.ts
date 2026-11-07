import { describe, it, expect } from "vitest";
import { writeFile } from "node:fs/promises";
import { polishReport } from "../src/daily/polish.js";

describe("polishReport", () => {
  it("skips gracefully when herdr missing", async () => {
    const result = await polishReport({
      markdown: "# hi\n",
      agent: "claude",
      exec: async () => ({ stdout: "", stderr: "not found", code: 127 }),
    });
    expect(result.polished).toBeNull();
    expect(result.skippedReason).toMatch(/herdr/i);
  });

  it("returns polished text when the herdr agent flow succeeds", async () => {
    const calls: string[] = [];
    const result = await polishReport({
      markdown: "# hi\n",
      agent: "claude",
      exec: async (cmd, args) => {
        calls.push([cmd, ...args].join(" "));
        if (cmd === "herdr" && args[0] === "--version") {
          return { stdout: "herdr 0.8.0", stderr: "", code: 0 };
        }
        if (cmd === "herdr" && args[0] === "workspace" && args[1] === "create") {
          return {
            stdout: JSON.stringify({
              result: {
                workspace: { workspace_id: "w9" },
                root_pane: { pane_id: "w9:p1" },
              },
            }),
            stderr: "",
            code: 0,
          };
        }
        if (cmd === "herdr" && args[0] === "agent" && args[1] === "prompt") {
          const prompt = args.join(" ");
          const match = prompt.match(/(\S+output\.md)/);
          if (match) await writeFile(match[1]!, "# polished\n");
          return { stdout: "ok", stderr: "", code: 0 };
        }
        if (cmd === "herdr" && args[0] === "workspace" && args[1] === "close") {
          return { stdout: "{}", stderr: "", code: 0 };
        }
        return { stdout: "{}", stderr: "", code: 0 };
      },
    });
    expect(result.polished).toMatch(/polished/);
    expect(calls.some((c) => c.includes("agent start"))).toBe(true);
    expect(calls.some((c) => c.includes("--kind claude"))).toBe(true);
    expect(calls.some((c) => c.startsWith("herdr run "))).toBe(false);
  });

  it("splits the current pane when already inside herdr", async () => {
    const calls: string[] = [];
    const result = await polishReport({
      markdown: "# hi\n",
      agent: "claude",
      env: { HERDR_ENV: "1" },
      exec: async (cmd, args) => {
        calls.push([cmd, ...args].join(" "));
        if (args[0] === "--version") return { stdout: "herdr 0.8.0", stderr: "", code: 0 };
        if (args[0] === "pane" && args[1] === "split") {
          return {
            stdout: JSON.stringify({ result: { pane: { pane_id: "w1:p9" } } }),
            stderr: "",
            code: 0,
          };
        }
        if (args[0] === "agent" && args[1] === "prompt") {
          const prompt = args.join(" ");
          const match = prompt.match(/(\S+output\.md)/);
          if (match) await writeFile(match[1]!, "# polished inside\n");
          return { stdout: "ok", stderr: "", code: 0 };
        }
        return { stdout: "{}", stderr: "", code: 0 };
      },
    });
    expect(result.polished).toMatch(/polished inside/);
    expect(calls.some((c) => c.includes("pane split --current"))).toBe(true);
    expect(calls.some((c) => c.includes("workspace create"))).toBe(false);
    expect(calls.some((c) => c.includes("pane close w1:p9"))).toBe(true);
  });

  it("skips when herdr is installed but no session can be created", async () => {
    const result = await polishReport({
      markdown: "# hi\n",
      agent: "claude",
      exec: async (cmd, args) => {
        if (cmd === "herdr" && args[0] === "--version") {
          return { stdout: "herdr 0.8.0", stderr: "", code: 0 };
        }
        return { stdout: "", stderr: "no server", code: 1 };
      },
    });
    expect(result.polished).toBeNull();
    expect(result.skippedReason).toMatch(/herdr/i);
  });
});
