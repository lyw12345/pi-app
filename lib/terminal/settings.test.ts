import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { getTerminalSettings, _resetTerminalSettingsCache } from "./settings";

let tmpDir: string;

beforeEach(() => {
  _resetTerminalSettingsCache();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-web-term-test-"));
  vi.stubEnv("PI_CODING_AGENT_DIR", tmpDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeSettings(obj: unknown) {
  fs.writeFileSync(path.join(tmpDir, "settings.json"), JSON.stringify(obj));
}

describe("getTerminalSettings", () => {
  it("returns defaults when settings.json is missing", () => {
    const s = getTerminalSettings();
    expect(s.defaultTimeoutMs).toBe(300_000);
    expect(s.maxOutputBytes).toBe(1_048_576);
    expect(s.historyLimit).toBe(50);
  });

  it("returns defaults when terminal.* block is missing", () => {
    writeSettings({ theme: "dark" });
    const s = getTerminalSettings();
    expect(s.defaultTimeoutMs).toBe(300_000);
  });

  it("reads user-provided values when valid", () => {
    writeSettings({ terminal: { defaultTimeoutMs: 1000, maxOutputBytes: 1024, historyLimit: 10 } });
    const s = getTerminalSettings();
    expect(s.defaultTimeoutMs).toBe(1000);
    expect(s.maxOutputBytes).toBe(1024);
    expect(s.historyLimit).toBe(10);
  });

  it("throws on negative timeout", () => {
    writeSettings({ terminal: { defaultTimeoutMs: -1 } });
    expect(() => getTerminalSettings()).toThrow(/defaultTimeoutMs/);
  });

  it("throws on non-numeric value", () => {
    writeSettings({ terminal: { maxOutputBytes: "huge" } });
    expect(() => getTerminalSettings()).toThrow(/maxOutputBytes/);
  });
});
