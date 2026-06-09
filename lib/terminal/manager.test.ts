import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getTerminalManager,
  resetTerminalManagerForTests,
} from "./manager";
import { _resetTerminalSettingsCache } from "./settings";

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
