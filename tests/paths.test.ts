import { describe, it, expect } from "vitest";
import path from "node:path";
import { getMinderHome, getConfigPath, getStatePath, getStateDir } from "../src/paths.js";

describe("paths", () => {
  it("resolves minder home under HOME", () => {
    const env = { HOME: "/tmp/fake-home" };
    expect(getMinderHome(env)).toBe(path.join("/tmp/fake-home", ".minder"));
    expect(getConfigPath(env)).toBe(path.join("/tmp/fake-home", ".minder", "config.json"));
    expect(getStateDir(env)).toBe(path.join("/tmp/fake-home", ".minder", "state"));
    expect(getStatePath(env)).toBe(
      path.join("/tmp/fake-home", ".minder", "state", "sessions.json"),
    );
  });

  it("prefers MINDER_HOME when set", () => {
    const env = { HOME: "/tmp/fake-home", MINDER_HOME: "/tmp/custom-minder" };
    expect(getMinderHome(env)).toBe("/tmp/custom-minder");
    expect(getConfigPath(env)).toBe(path.join("/tmp/custom-minder", "config.json"));
  });
});
