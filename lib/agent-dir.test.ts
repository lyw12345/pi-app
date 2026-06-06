import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { getAgentDir, getDefaultAgentDir, usesIsolatedAgentDataDir } from "./agent-dir";

describe("agent-dir", () => {
  it("defaults to ~/.pi/agent", () => {
    const prev = process.env.PI_CODING_AGENT_DIR;
    delete process.env.PI_CODING_AGENT_DIR;
    expect(getAgentDir()).toBe(join(homedir(), ".pi", "agent"));
    if (prev === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = prev;
  });

  it("honors PI_CODING_AGENT_DIR", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-agent-dir-"));
    try {
      process.env.PI_CODING_AGENT_DIR = dir;
      expect(getAgentDir()).toBe(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      delete process.env.PI_CODING_AGENT_DIR;
    }
  });

  it("getDefaultAgentDir always resolves ~/.pi/agent", () => {
    expect(getDefaultAgentDir()).toBe(join(homedir(), ".pi", "agent"));
  });

  it("usesIsolatedAgentDataDir is true when PI_CODING_AGENT_DIR overrides default", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-agent-isolated-"));
    try {
      process.env.PI_CODING_AGENT_DIR = dir;
      expect(usesIsolatedAgentDataDir()).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      delete process.env.PI_CODING_AGENT_DIR;
    }
  });
});
