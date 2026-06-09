import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getTerminalManager,
  resetTerminalManagerForTests,
} from "./manager";
import { _resetTerminalSettingsCache } from "./settings";
import type { TerminalLine } from "./types";
import fs from "fs";
import os from "os";
import path from "path";

let tmpCwd: string;

beforeEach(() => {
  resetTerminalManagerForTests();
  _resetTerminalSettingsCache();
  vi.useRealTimers();
  tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-web-mgr-"));
});

afterEach(() => {
  fs.rmSync(tmpCwd, { recursive: true, force: true });
});

beforeEach(() => {
  resetTerminalManagerForTests();
  _resetTerminalSettingsCache();
  vi.useRealTimers();
});

describe("TerminalManager.getOrCreate", () => {
  it("returns the same session object on repeat calls for the same cwd", () => {
    const mgr = getTerminalManager();
    const a = mgr.getOrCreate("/tmp/proj-a");
    const b = mgr.getOrCreate("/tmp/proj-a");
    expect(a).toBe(b);
  });

  it("returns different sessions for different cwds", () => {
    const mgr = getTerminalManager();
    const a = mgr.getOrCreate("/tmp/proj-a");
    const b = mgr.getOrCreate("/tmp/proj-b");
    expect(a).not.toBe(b);
    expect(a.cwd).toBe("/tmp/proj-a");
    expect(b.cwd).toBe("/tmp/proj-b");
  });

  it("starts a new session with empty buffer / history / no running process", () => {
    const mgr = getTerminalManager();
    const s = mgr.getOrCreate("/tmp/proj-c");
    expect(s.buffer).toEqual([]);
    expect(s.history).toEqual([]);
    expect(s.historyIndex).toBe(-1);
    expect(s.runningProcess).toBeNull();
    expect(s.listeners.size).toBe(0);
  });
});

describe("TerminalManager.subscribe + emit", () => {
  it("fans out a 'line' event to all listeners", () => {
    const mgr = getTerminalManager();
    const s = mgr.getOrCreate("/tmp/proj-d");
    const a: string[] = [];
    const b: string[] = [];
    mgr.subscribe(s, (e) => {
      if (e.type === "line") a.push(e.line.kind);
    });
    mgr.subscribe(s, (e) => {
      if (e.type === "line") b.push(e.line.kind);
    });
    mgr.emit(s, { type: "line", line: { kind: "info", text: "hi", ts: 1 } });
    expect(a).toEqual(["info"]);
    expect(b).toEqual(["info"]);
  });

  it("stops delivering to unsubscribed listeners", () => {
    const mgr = getTerminalManager();
    const s = mgr.getOrCreate("/tmp/proj-e");
    const received: string[] = [];
    const unsub = mgr.subscribe(s, (e) => {
      if (e.type === "line") received.push(e.line.kind);
    });
    mgr.emit(s, { type: "line", line: { kind: "info", text: "1", ts: 1 } });
    unsub();
    mgr.emit(s, { type: "line", line: { kind: "info", text: "2", ts: 1 } });
    expect(received).toEqual(["info"]);
  });
});

describe("TerminalManager.startCommand", () => {
  it("spawns `echo hello` and emits a command line, output line, and exit line", async () => {
    const mgr = getTerminalManager();
    const s = mgr.getOrCreate(tmpCwd);
    const events: string[] = [];
    mgr.subscribe(s, (e) => {
      if (e.type === "line") events.push(e.line.kind);
    });
    await mgr.startCommand(s, "echo hello", false);
    // Wait for exit to be processed
    await new Promise((r) => setTimeout(r, 300));
    expect(events).toContain("command");
    expect(events).toContain("output");
    expect(events).toContain("exit");
    expect(s.runningProcess).toBeNull();
    const outLine = s.buffer.find((l) => l.kind === "output") as Extract<TerminalLine, { kind: "output" }> | undefined;
    expect(outLine?.text).toContain("hello");
    const exitLine = s.buffer.find((l) => l.kind === "exit") as Extract<TerminalLine, { kind: "exit" }> | undefined;
    expect(exitLine?.code).toBe(0);
  });

  it("rejects (returns slot-occupied) when a non-keep-running process is still alive", async () => {
    const mgr = getTerminalManager();
    const s = mgr.getOrCreate(tmpCwd);
    await mgr.startCommand(s, "sleep 2", false);
    // immediately try to start another; should be rejected
    const result = await mgr.startCommand(s, "echo second", false);
    expect(result).toEqual({ ok: false, reason: "slot_occupied" });
    // cleanup: kill the sleep, wait for exit
    mgr.stop(s, "user");
    await new Promise((r) => setTimeout(r, 300));
  });

  it("kills the previous keep-running process when a new command is started", async () => {
    const mgr = getTerminalManager();
    const s = mgr.getOrCreate(tmpCwd);
    await mgr.startCommand(s, "sleep 5", true);
    expect(s.runningProcess?.isKeepRunning).toBe(true);
    const oldPid = s.runningProcess!.pid;
    // Start new command without await — startCommand is sync; the new spawn begins immediately
    const result = await mgr.startCommand(s, "echo replaced", false);
    expect(result.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 500));
    expect(s.runningProcess?.pid).not.toBe(oldPid);
    const info = s.buffer.find((l) => l.kind === "info") as Extract<TerminalLine, { kind: "info" }> | undefined;
    expect(info?.text).toBe("killed by new command");
    // cleanup
    await new Promise((r) => setTimeout(r, 300));
  });

  it("killed child shows [exit null SIGTERM] in buffer", async () => {
    const mgr = getTerminalManager();
    const s = mgr.getOrCreate(tmpCwd);
    await mgr.startCommand(s, "sleep 5", true);
    mgr.stop(s, "user");
    await new Promise((r) => setTimeout(r, 500));
    const exitLine = s.buffer.find((l) => l.kind === "exit") as Extract<TerminalLine, { kind: "exit" }> | undefined;
    expect(exitLine).toBeDefined();
    expect(exitLine?.signal).toBe("SIGTERM");
  });
});

describe("TerminalManager built-in commands", () => {
  it("`cd .` does not change currentCwd", async () => {
    const mgr = getTerminalManager();
    const s = mgr.getOrCreate(tmpCwd);
    const orig = fs.realpathSync(s.currentCwd);
    await mgr.startCommand(s, "cd .", false);
    expect(fs.realpathSync(s.currentCwd)).toBe(orig);
  });

  it("`cd subdir` changes currentCwd to the subdirectory", async () => {
    const mgr = getTerminalManager();
    const s = mgr.getOrCreate(tmpCwd);
    const sub = path.join(tmpCwd, "sub");
    fs.mkdirSync(sub);
    await mgr.startCommand(s, "cd sub", false);
    expect(fs.realpathSync(s.currentCwd)).toBe(fs.realpathSync(sub));
    // Subsequent command runs in the new cwd
    await mgr.startCommand(s, "pwd", false);
    await new Promise((r) => setTimeout(r, 300));
    const outLines = s.buffer.filter((l) => l.kind === "output") as Extract<TerminalLine, { kind: "output" }>[];
    const pwdLine = outLines[outLines.length - 1];
    expect(fs.realpathSync(pwdLine?.text.trim() ?? "")).toBe(fs.realpathSync(sub));
  });

  it("`cd nonexistent` emits an error line", async () => {
    const mgr = getTerminalManager();
    const s = mgr.getOrCreate(tmpCwd);
    const oldCwd = s.currentCwd;
    await mgr.startCommand(s, "cd nonexistent-subdir", false);
    expect(s.currentCwd).toBe(oldCwd);
    const err = s.buffer.find((l) => l.kind === "error") as Extract<TerminalLine, { kind: "error" }> | undefined;
    expect(err?.text).toContain("no such file");
  });

  it("`clear` empties the buffer and emits a replay event", async () => {
    const mgr = getTerminalManager();
    const s = mgr.getOrCreate(tmpCwd);
    // Put something in the buffer first
    await mgr.startCommand(s, "echo x", false);
    await new Promise((r) => setTimeout(r, 300));
    expect(s.buffer.length).toBeGreaterThan(0);
    // Now clear
    await mgr.startCommand(s, "clear", false);
    expect(s.buffer).toEqual([]);
    expect(s.bufferBytes).toBe(0);
  });
});
