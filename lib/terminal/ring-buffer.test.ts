import { describe, it, expect } from "vitest";
import { lineBytes, appendLine } from "./ring-buffer";
import type { TerminalLine, TerminalSession } from "./types";

function makeSession(): TerminalSession {
  return {
    cwd: "/tmp",
    currentCwd: "/tmp",
    buffer: [],
    bufferBytes: 0,
    history: [],
    historyIndex: -1,
    runningProcess: null,
    listeners: new Set(),
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    droppedBytesSinceLastTruncate: 0,
  };
}

function output(text: string): TerminalLine {
  return { kind: "output", text, ts: 1, stream: "stdout" };
}
function cmd(text: string): TerminalLine {
  return { kind: "command", text, ts: 1, keepRunning: false };
}
function info(text: string): TerminalLine {
  return { kind: "info", text, ts: 1 };
}

describe("lineBytes", () => {
  it("counts UTF-8 byte length of output text plus 32 byte overhead", () => {
    expect(lineBytes(output("hello"))).toBe(Buffer.byteLength("hello") + 32);
  });
  it("counts a fixed 64 bytes for non-output lines", () => {
    expect(lineBytes(cmd("ls"))).toBe(64);
    expect(lineBytes(info("killed"))).toBe(64);
  });
});

describe("appendLine", () => {
  it("appends a line and updates bufferBytes", () => {
    const s = makeSession();
    appendLine(s, output("hi"), 1024);
    expect(s.buffer).toHaveLength(1);
    expect(s.bufferBytes).toBe(lineBytes(output("hi")));
  });

  it("evicts oldest lines when cap is exceeded", () => {
    const s = makeSession(); // tight cap
    appendLine(s, output("aaaaaaaaaa"), 100);   // ~42 bytes
    appendLine(s, output("bbbbbbbbbb"), 100);   // ~42 bytes
    appendLine(s, output("cccccccccc"), 100);   // forces eviction
    expect(s.buffer.length).toBe(2);
    expect(s.buffer[0].kind).toBe("output");
    const out0 = s.buffer[0] as Extract<TerminalLine, { kind: "output" }>;
    const out1 = s.buffer[1] as Extract<TerminalLine, { kind: "output" }>;
    expect(out0.text).toBe("bbbbbbbbbb");
    expect(out1.text).toBe("cccccccccc");
  });

  it("emits a truncated info line after >=100KB cumulative drops", () => {
    const s = makeSession();
    const big = "x".repeat(80);
    // Track truncated lines seen during the loop (subsequent evictions
    // can remove them — the spec doesn't promise stickiness).
    const truncationsSeen: number[] = [];
    for (let i = 0; i < 2000; i++) {
      appendLine(s, output(big), 200);
      if (s.buffer.some((l) => l.kind === "truncated")) {
        truncationsSeen.push(s.droppedBytesSinceLastTruncate);
      }
    }
    expect(truncationsSeen.length).toBeGreaterThan(0);
  });

  it("truncates a single output line in place when it alone exceeds the cap", () => {
    const s = makeSession();
    appendLine(s, output("x".repeat(500)), 100);
    expect(s.buffer).toHaveLength(1);
    const line = s.buffer[0] as Extract<TerminalLine, { kind: "output" }>;
    expect(line.text.endsWith("[... output truncated at 100 bytes ...]")).toBe(true);
    expect(line.text.length).toBeLessThan(500);
  });
});
