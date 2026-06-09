import { describe, it, expect, beforeEach } from "vitest";
import { getTerminalManager, resetTerminalManagerForTests } from "./manager";
import { _resetTerminalSettingsCache } from "./settings";
import fs from "fs";
import os from "os";
import path from "path";

let tmpCwd: string;

beforeEach(() => {
  resetTerminalManagerForTests();
  _resetTerminalSettingsCache();
  tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-web-cleanup-"));
});

describe("TerminalManager cleanup handlers", () => {
  it("killAll() terminates all active subprocesses", async () => {
    const mgr = getTerminalManager();
    const s = mgr.getOrCreate(tmpCwd);
    await mgr.startCommand(s, "sleep 5", true);
    expect(s.runningProcess).not.toBeNull();
    mgr.killAll();
    // wait for SIGTERM propagation
    await new Promise((r) => setTimeout(r, 500));
    expect(s.runningProcess).toBeNull();
  });
});
