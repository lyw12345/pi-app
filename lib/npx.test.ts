import { describe, expect, it, afterEach } from "vitest";
import { dirname } from "path";
import { existsSync } from "fs";
import { execPath } from "process";
import { buildNpxEnv } from "./npx";

describe("buildNpxEnv", () => {
  afterEach(() => {
    delete process.env.NODE;
  });

  it("prepends the running node bin dir to a minimal GUI PATH", () => {
    const env = buildNpxEnv({ ...process.env, PATH: "/usr/bin:/bin", FOO: "bar" });
    const nodeBin = dirname(execPath);
    expect(env.PATH?.startsWith(nodeBin)).toBe(true);
    expect(env.PATH).toContain("/usr/bin:/bin");
    expect(env.FOO).toBe("bar");
  });

  it("includes NODE env bin dir when set (Pi.app ServerManager)", () => {
    process.env.NODE = "/Applications/Pi.app/Contents/Resources/node/bin/node";
    const env = buildNpxEnv({ ...process.env, PATH: "/usr/bin:/bin" });
    expect(env.PATH).toContain("/Applications/Pi.app/Contents/Resources/node/bin");
  });

  it("includes Homebrew node when present on this machine", () => {
    const env = buildNpxEnv({ ...process.env, PATH: "/usr/bin:/bin" });
    if (existsSync("/opt/homebrew/bin/node")) {
      expect(env.PATH).toContain("/opt/homebrew/bin");
    }
  });
});
