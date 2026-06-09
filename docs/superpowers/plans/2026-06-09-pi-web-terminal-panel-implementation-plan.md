# pi-web Terminal Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an integrated bottom-drawer terminal panel to pi-web that lets the user run shell commands (`npm run dev`, `pytest`, `git`, `tail -f`) directly in the browser, with per-cwd session state that survives drawer close, page refresh, and Pi.app session switch.

**Architecture:** New `lib/terminal/manager.ts` registry on `globalThis` (HMR-safe) holds one `TerminalSession` per cwd. Each command is a plain `child_process.spawn` (no PTY, no stdin). Output streams through an SSE route to a `useTerminal` hook that drives a `TerminalPanel` drawer mounted in `AppShell`.

**Tech Stack:** Next.js 14 App Router · Node.js `child_process` · SSE (`text/event-stream`) · `EventSource` browser API · React 18 · vitest · `@testing-library/react` · `globals.css` (no new UI library).

**Spec:** `docs/superpowers/specs/2026-06-09-pi-web-terminal-panel-design.md`

---

## File Structure (locked in up-front)

### New files (Phase 1–4)

| File | Responsibility | Lines (est.) |
|---|---|---|
| `lib/terminal/types.ts` | All shared types: `TerminalLine`, `RunningProcess`, `TerminalSession`, `TerminalEvent`, `TerminalListener`, `RunningProcessSummary` | ~80 |
| `lib/terminal/ring-buffer.ts` | `appendLine` / `lineBytes` / `resetDroppedBytes` pure functions | ~70 |
| `lib/terminal/settings.ts` | `getTerminalSettings()` reads `$PI_CODING_AGENT_DIR/settings.json` `terminal.*` block with defaults | ~50 |
| `lib/terminal/manager.ts` | `TerminalManager` class + `globalThis.__piTerminals` registry + cleanup handlers | ~280 |
| `app/api/terminal/[cwd]/state/route.ts` | `GET` snapshot | ~30 |
| `app/api/terminal/[cwd]/stream/route.ts` | `GET` SSE | ~70 |
| `app/api/terminal/[cwd]/run/route.ts` | `POST` start command | ~50 |
| `app/api/terminal/[cwd]/stop/route.ts` | `POST` stop | ~30 |
| `hooks/useTerminal.ts` | SSE subscription + submit/stop/clear | ~120 |
| `components/TerminalOutput.tsx` | Scrollback renderer | ~80 |
| `components/TerminalInput.tsx` | Input with history + keep-running | ~90 |
| `components/TerminalPanel.tsx` | Drawer container | ~120 |
| `components/OpenTerminalButton.tsx` | Icon button | ~30 |

### Modified files (Phase 5)

| File | Change |
|---|---|
| `components/ChatInput.tsx` | Add optional `onOpenTerminal` prop, render `OpenTerminalButton` when provided |
| `components/AppShell.tsx` | Add `terminalOpen` / `terminalHeight` state, derive `terminalCwd`, mount `TerminalPanel` with `key={cwd}`, pass `onOpenTerminal` through `ChatWindow` |
| `components/ChatWindow.tsx` | Forward `onOpenTerminal` to `ChatInput` |
| `app/globals.css` | Add ~80 lines of `.terminal-*` styles using existing CSS variables |
| `CHANGELOG.md` | "Unreleased" entry |
| `lib/file-access.ts` | (Read-only — reuse `isPathAllowed` / `filePathFromSegments`) |

### New test files (parallel to source)

`lib/terminal/{ring-buffer,settings,manager}.test.ts`, `app/api/terminal/[cwd]/{state,stream,run,stop}.test.ts`, `hooks/useTerminal.test.ts`, `components/Terminal{Output,Input,Panel}.test.tsx`, `components/OpenTerminalButton.test.tsx`.

### Out of scope (deferred)

- Orphan-PID cleanup on hard Pi.app kill (v1.1)
- Native shell IPC via `macos/PiWorkbench` (v1.1)
- Output persistence to disk (v2)
- Multi-terminal per cwd (v2)
- PTY / xterm.js (v2)

---

## Phase 1 — Backend core

### Task 1: Define terminal types

**Files:**
- Create: `lib/terminal/types.ts`

- [ ] **Step 1: Create the file with all 6 types**

Write `lib/terminal/types.ts` exactly as shown:

```ts
// lib/terminal/types.ts
//
// Shared types for the per-cwd terminal sessions. See:
// docs/superpowers/specs/2026-06-09-pi-web-terminal-panel-design.md §5
//
// All state is held in-memory in `globalThis.__piTerminals` (HMR-safe),
// mirrored after the existing `globalThis.__piSessions` pattern.

import type { ChildProcess } from "child_process";

/** A single line in the terminal scrollback buffer. */
export type TerminalLine =
  | { kind: "command";   text: string; ts: number; keepRunning: boolean }
  | { kind: "output";    text: string; ts: number; stream: "stdout" | "stderr" }
  | { kind: "exit";      code: number | null; signal: string | null; ts: number }
  | { kind: "error";     text: string; ts: number }     // spawn failure / timeout kill
  | { kind: "info";      text: string; ts: number }     // "killed by user" / "truncated"
  | { kind: "truncated"; droppedBytes: number; ts: number };

/** One currently-spawned subprocess occupying a terminal's single slot. */
export type RunningProcess = {
  pid: number;
  command: string;
  startedAt: number;
  isKeepRunning: boolean;
  /** Set only when isKeepRunning === false; cleared on natural exit or kill. */
  timeoutHandle: ReturnType<typeof setTimeout> | null;
  child: ChildProcess;
};

/** Lightweight summary sent to clients over SSE (no ChildProcess handle). */
export type RunningProcessSummary = {
  pid: number;
  command: string;
  startedAt: number;
  isKeepRunning: boolean;
};

/** One terminal per cwd. The cwd is the registry key. */
export type TerminalSession = {
  cwd: string;
  buffer: TerminalLine[];
  /** Sum of byte cost of all lines currently in `buffer`. Used to enforce the cap. */
  bufferBytes: number;
  /** Most recent commands, oldest first. Capped at `settings.historyLimit`. */
  history: string[];
  /** ↑/↓ cursor (component-local, but mirrored here so manager can reset it). */
  historyIndex: number;
  runningProcess: RunningProcess | null;
  listeners: Set<TerminalListener>;
  createdAt: number;
  lastActiveAt: number;
  /** Cumulative bytes dropped since the last `{kind:"truncated"}` line was emitted. */
  droppedBytesSinceLastTruncate: number;
};

export type TerminalListener = (event: TerminalEvent) => void;

export type TerminalEvent =
  | { type: "replay"; lines: TerminalLine[] }
  | { type: "line";   line: TerminalLine }
  | { type: "state";  running: RunningProcessSummary | null };

/** Result of `POST /run` for the 409 case. */
export type RunError =
  | { error: "command_in_progress"; running: RunningProcessSummary }
  | { error: "forbidden" }
  | { error: "bad_request"; reason: string };
```

- [ ] **Step 2: Verify it compiles**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/mk/codespace/pi-web
git add lib/terminal/types.ts
git commit -m "feat(terminal): define shared types for terminal sessions"
```

---

### Task 2: Ring buffer — write tests

**Files:**
- Create: `lib/terminal/ring-buffer.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/terminal/ring-buffer.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { lineBytes, appendLine } from "./ring-buffer";
import type { TerminalLine, TerminalSession } from "./types";

function makeSession(maxBytes = 1024): TerminalSession {
  return {
    cwd: "/tmp",
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
    const s = makeSession(1024);
    appendLine(s, output("hi"), 1024);
    expect(s.buffer).toHaveLength(1);
    expect(s.bufferBytes).toBe(lineBytes(output("hi")));
  });

  it("evicts oldest lines when cap is exceeded", () => {
    const s = makeSession(100); // tight cap
    appendLine(s, output("aaaaaaaaaa"), 100);   // ~42 bytes
    appendLine(s, output("bbbbbbbbbb"), 100);   // ~42 bytes
    appendLine(s, output("cccccccccc"), 100);   // forces eviction
    expect(s.buffer.length).toBe(2);
    expect(s.buffer[0].kind).toBe("output");
    expect((s.buffer[0] as any).text).toBe("bbbbbbbbbb");
    expect((s.buffer[1] as any).text).toBe("cccccccccc");
  });

  it("emits a truncated info line after >=100KB cumulative drops", () => {
    const s = makeSession(200);
    // 5 x 100-byte lines = 500 bytes; cap is 200; first 3 should be dropped
    const big = "x".repeat(80);
    for (let i = 0; i < 5; i++) {
      appendLine(s, output(big), 200);
    }
    // After 100KB of dropped bytes, a truncated line should be present
    // (we need a 102400+ drop, so push 200 such lines)
    for (let i = 0; i < 200; i++) {
      appendLine(s, output(big), 200);
    }
    const truncated = s.buffer.find((l) => l.kind === "truncated");
    expect(truncated).toBeDefined();
  });

  it("truncates a single output line in place when it alone exceeds the cap", () => {
    const s = makeSession(100);
    appendLine(s, output("x".repeat(500)), 100);
    expect(s.buffer).toHaveLength(1);
    const line = s.buffer[0] as Extract<TerminalLine, { kind: "output" }>;
    expect(line.text.endsWith("[... output truncated at 100 bytes ...]")).toBe(true);
    expect(line.text.length).toBeLessThan(500);
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npm run test:run -- lib/terminal/ring-buffer.test.ts`
Expected: FAIL with "Cannot find module './ring-buffer'" (or similar module-not-found).

- [ ] **Step 3: Commit the failing tests**

```bash
cd /Users/mk/codespace/pi-web
git add lib/terminal/ring-buffer.test.ts
git commit -m "test(terminal): add failing tests for ring buffer"
```

---

### Task 3: Ring buffer — implement

**Files:**
- Create: `lib/terminal/ring-buffer.ts`

- [ ] **Step 1: Implement the module**

Write `lib/terminal/ring-buffer.ts`:

```ts
// lib/terminal/ring-buffer.ts
//
// Per-session byte-capped ring buffer. Older lines are evicted as new ones
// arrive, with a `truncated` info line emitted every 100KB of cumulative
// drops. A single line that exceeds the cap on its own is truncated in
// place with a suffix marker.

import type { TerminalLine, TerminalSession } from "./types";

/** Per-line byte cost. Output lines dominate; others are flat 64 bytes. */
export function lineBytes(line: TerminalLine): number {
  if (line.kind === "output") {
    return Buffer.byteLength(line.text) + 32;
  }
  return 64;
}

const TRUNCATED_SUFFIX = (cap: number) => `[... output truncated at ${cap} bytes ...]`;
const TRUNCATE_INFO_THRESHOLD = 102_400; // emit a "truncated" line every 100KB dropped

/**
 * Append a line to the session buffer, evicting from the head as needed
 * to keep `bufferBytes` <= `maxBytes`. Emits a `{kind:"truncated"}` line
 * once per 100KB of cumulative dropped bytes.
 */
export function appendLine(
  session: TerminalSession,
  line: TerminalLine,
  maxBytes: number,
): void {
  const bytes = lineBytes(line);
  session.buffer.push(line);
  session.bufferBytes += bytes;

  // Evict from head until under cap (always keep at least the new line)
  let droppedTotal = 0;
  while (session.bufferBytes > maxBytes && session.buffer.length > 1) {
    const dropped = session.buffer.shift()!;
    const droppedBytes = lineBytes(dropped);
    session.bufferBytes -= droppedBytes;
    if (dropped.kind === "output") {
      droppedTotal += droppedBytes;
    }
  }

  // Edge case: a single line alone exceeds the cap. Truncate in place.
  if (session.bufferBytes > maxBytes && session.buffer.length === 1) {
    const only = session.buffer[0];
    if (only.kind === "output") {
      const suffix = TRUNCATED_SUFFIX(maxBytes);
      const keepLen = Math.max(0, maxBytes - Buffer.byteLength(suffix) - 32);
      only.text = only.text.slice(0, keepLen) + suffix;
      session.bufferBytes = lineBytes(only);
    }
    return; // single-line case bypasses the cumulative-drop accounting
  }

  if (droppedTotal > 0) {
    session.droppedBytesSinceLastTruncate += droppedTotal;
    if (session.droppedBytesSinceLastTruncate >= TRUNCATE_INFO_THRESHOLD) {
      const dropped = session.droppedBytesSinceLastTruncate;
      session.droppedBytesSinceLastTruncate = 0;
      const infoLine: TerminalLine = {
        kind: "truncated",
        droppedBytes: dropped,
        ts: Date.now(),
      };
      session.buffer.push(infoLine);
      session.bufferBytes += lineBytes(infoLine);
      // Re-evict if the truncated-info line itself pushed us over.
      while (session.bufferBytes > maxBytes && session.buffer.length > 1) {
        const d = session.buffer.shift()!;
        session.bufferBytes -= lineBytes(d);
      }
    }
  }
}
```

- [ ] **Step 2: Run the tests, verify they pass**

Run: `npm run test:run -- lib/terminal/ring-buffer.test.ts`
Expected: PASS, 6 tests, 0 failures.

- [ ] **Step 3: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/mk/codespace/pi-web
git add lib/terminal/ring-buffer.ts
git commit -m "feat(terminal): implement ring buffer with cap + truncation info"
```

---

### Task 4: Settings loader — write tests

**Files:**
- Create: `lib/terminal/settings.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/terminal/settings.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { getTerminalSettings } from "./settings";

let tmpDir: string;

beforeEach(() => {
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
```

- [ ] **Step 2: Run, verify fail**

Run: `npm run test:run -- lib/terminal/settings.test.ts`
Expected: FAIL with "Cannot find module './settings'".

- [ ] **Step 3: Commit the failing tests**

```bash
cd /Users/mk/codespace/pi-web
git add lib/terminal/settings.test.ts
git commit -m "test(terminal): add failing tests for settings loader"
```

---

### Task 5: Settings loader — implement

**Files:**
- Create: `lib/terminal/settings.ts`

- [ ] **Step 1: Inspect how other modules read settings.json**

Run: `cat lib/agent-dir.ts`
Expected: A function `getAgentDir()` returning the agent dir (defaults to `~/.pi/agent/`, honors `PI_CODING_AGENT_DIR`). We will reuse this.

- [ ] **Step 2: Implement the module**

Write `lib/terminal/settings.ts`:

```ts
// lib/terminal/settings.ts
//
// Reads the `terminal.*` block from $PI_CODING_AGENT_DIR/settings.json.
// Falls back to sensible defaults when keys are missing. Throws on
// invalid values (negative numbers, non-numeric strings) — fail loud.

import fs from "fs";
import path from "path";
import { getAgentDir } from "@/lib/agent-dir";

export type TerminalSettings = {
  defaultTimeoutMs: number;
  maxOutputBytes: number;
  historyLimit: number;
};

const DEFAULTS: TerminalSettings = {
  defaultTimeoutMs: 300_000,   // 5 min
  maxOutputBytes: 1_048_576,   // 1 MB
  historyLimit: 50,
};

type RawTerminalBlock = Partial<{
  defaultTimeoutMs: unknown;
  maxOutputBytes: unknown;
  historyLimit: unknown;
}>;

function readRawBlock(): RawTerminalBlock {
  const file = path.join(getAgentDir(), "settings.json");
  if (!fs.existsSync(file)) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null) return {};
  const block = (parsed as { terminal?: unknown }).terminal;
  if (typeof block !== "object" || block === null) return {};
  return block as RawTerminalBlock;
}

function validateNumber(value: unknown, key: keyof TerminalSettings): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(
      `Invalid settings.json terminal.${key}: expected non-negative finite number, got ${JSON.stringify(value)}`,
    );
  }
  return value;
}

let cached: TerminalSettings | null = null;

/** Read and validate the terminal settings. Cached after first read. */
export function getTerminalSettings(): TerminalSettings {
  if (cached) return cached;
  const block = readRawBlock();
  const settings: TerminalSettings = {
    defaultTimeoutMs:
      block.defaultTimeoutMs !== undefined
        ? validateNumber(block.defaultTimeoutMs, "defaultTimeoutMs")
        : DEFAULTS.defaultTimeoutMs,
    maxOutputBytes:
      block.maxOutputBytes !== undefined
        ? validateNumber(block.maxOutputBytes, "maxOutputBytes")
        : DEFAULTS.maxOutputBytes,
    historyLimit:
      block.historyLimit !== undefined
        ? validateNumber(block.historyLimit, "historyLimit")
        : DEFAULTS.historyLimit,
  };
  cached = settings;
  return settings;
}

/** Test-only: clear the in-memory cache so the next read re-parses settings.json. */
export function _resetTerminalSettingsCache(): void {
  cached = null;
}
```

- [ ] **Step 3: Run tests, verify pass**

Run: `npm run test:run -- lib/terminal/settings.test.ts`
Expected: PASS, 5 tests, 0 failures.

- [ ] **Step 4: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/mk/codespace/pi-web
git add lib/terminal/settings.ts
git commit -m "feat(terminal): settings loader with validation + defaults"
```

---

### Task 6: Manager — write tests for getOrCreate and emit

**Files:**
- Create: `lib/terminal/manager.test.ts`

- [ ] **Step 1: Write the failing tests (part 1: registry basics)**

Create `lib/terminal/manager.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  TerminalManager,
  resetTerminalManagerForTests,
  getTerminalManager,
} from "./manager";

beforeEach(() => {
  resetTerminalManagerForTests();
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
    mgr.appendLine(s, { kind: "info", text: "hi", ts: 1 });
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
```

- [ ] **Step 2: Run, verify fail**

Run: `npm run test:run -- lib/terminal/manager.test.ts`
Expected: FAIL with "Cannot find module './manager'".

- [ ] **Step 3: Commit failing tests**

```bash
cd /Users/mk/codespace/pi-web
git add lib/terminal/manager.test.ts
git commit -m "test(terminal): add failing tests for TerminalManager basics"
```

---

### Task 7: Manager — implement scaffolding (getOrCreate / subscribe / emit / appendLine / stop placeholder)

**Files:**
- Create: `lib/terminal/manager.ts`

- [ ] **Step 1: Implement the scaffolding**

Write `lib/terminal/manager.ts`. This is the initial scaffolding — `startCommand` and cleanup handlers are added in later tasks. Keep this commit minimal so the registry tests pass first.

```ts
// lib/terminal/manager.ts
//
// Per-cwd terminal session registry. One TerminalSession per cwd, kept in
// `globalThis.__piTerminals` so the registry survives Next.js dev HMR.
//
// Public API:
//   - getTerminalManager(): singleton
//   - resetTerminalManagerForTests(): test-only, clears globalThis
//
// Instance methods (Phase 1.4-1.5 add spawn / stop / cleanup):
//   - getOrCreate(cwd)
//   - subscribe(session, listener) -> unsubscribe
//   - emit(session, event)
//   - appendLine(session, line)  -- delegates to ring-buffer
//   - startCommand(session, command, keepRunning)  -- added in Task 8
//   - stop(session)  -- added in Task 9

import type {
  RunningProcess,
  RunningProcessSummary,
  TerminalEvent,
  TerminalLine,
  TerminalListener,
  TerminalSession,
} from "./types";
import { appendLine as ringAppendLine } from "./ring-buffer";
import { getTerminalSettings } from "./settings";

declare global {
  // eslint-disable-next-line no-var
  var __piTerminals: Map<string, TerminalSession> | undefined;
}

const REGISTRY_KEY = "__piTerminals";

function getRegistry(): Map<string, TerminalSession> {
  if (!globalThis[REGISTRY_KEY as keyof typeof globalThis]) {
    (globalThis as Record<string, unknown>)[REGISTRY_KEY] = new Map();
  }
  return (globalThis as Record<string, unknown>)[REGISTRY_KEY] as Map<string, TerminalSession>;
}

function summarize(rp: RunningProcess): RunningProcessSummary {
  return {
    pid: rp.pid,
    command: rp.command,
    startedAt: rp.startedAt,
    isKeepRunning: rp.isKeepRunning,
  };
}

export class TerminalManager {
  private registry = getRegistry();

  /** Return the existing session for `cwd` or create an empty one. */
  getOrCreate(cwd: string): TerminalSession {
    let s = this.registry.get(cwd);
    if (s) return s;
    s = {
      cwd,
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
    this.registry.set(cwd, s);
    return s;
  }

  /** Register a listener. Returns an unsubscribe function. */
  subscribe(session: TerminalSession, listener: TerminalListener): () => void {
    session.listeners.add(listener);
    session.lastActiveAt = Date.now();
    return () => {
      session.listeners.delete(listener);
    };
  }

  /** Fan out an event to all listeners. */
  emit(session: TerminalSession, event: TerminalEvent): void {
    for (const l of session.listeners) {
      try {
        l(event);
      } catch {
        // swallow listener errors; one bad subscriber should not break others
      }
    }
  }

  /** Append a line to the session's ring buffer (capped at settings.maxOutputBytes). */
  appendLine(session: TerminalSession, line: TerminalLine): void {
    ringAppendLine(session, line, getTerminalSettings().maxOutputBytes);
  }

  /** Test-only: snapshot of all running processes (for shutdown simulation). */
  activeProcs(): RunningProcess[] {
    const out: RunningProcess[] = [];
    for (const s of this.registry.values()) {
      if (s.runningProcess) out.push(s.runningProcess);
    }
    return out;
  }

  /** Stop a specific session's running process. No-op if none. */
  stop(session: TerminalSession, reason: "user" | "new_command" | "shutdown"): void {
    const rp = session.runningProcess;
    if (!rp) return;
    if (rp.timeoutHandle) {
      clearTimeout(rp.timeoutHandle);
      rp.timeoutHandle = null;
    }
    try { rp.child.kill("SIGTERM"); } catch {}
    const text =
      reason === "user"        ? "killed by user" :
      reason === "new_command" ? "killed by new command" :
                                 "killed by shutdown";
    this.appendLine(session, { kind: "info", text, ts: Date.now() });
    this.emit(session, { type: "line", line: { kind: "info", text, ts: Date.now() } });
    // The child 'exit' listener will clear session.runningProcess.
  }

  /** Kill every active subprocess in every session. Used by SIGTERM/SIGINT/exit. */
  killAll(): void {
    for (const s of this.registry.values()) {
      if (s.runningProcess) {
        this.stop(s, "shutdown");
      }
    }
  }
}

let cachedManager: TerminalManager | null = null;
export function getTerminalManager(): TerminalManager {
  if (!cachedManager) cachedManager = new TerminalManager();
  return cachedManager;
}

/** Test-only: drop the cached manager and clear the globalThis registry. */
export function resetTerminalManagerForTests(): void {
  cachedManager = null;
  (globalThis as Record<string, unknown>)[REGISTRY_KEY] = new Map();
}
```

- [ ] **Step 2: Run tests, verify pass**

Run: `npm run test:run -- lib/terminal/manager.test.ts`
Expected: PASS, 5 tests, 0 failures.

- [ ] **Step 3: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/mk/codespace/pi-web
git add lib/terminal/manager.ts
git commit -m "feat(terminal): TerminalManager scaffolding (registry + emit + stop)"
```

---

### Task 8: Manager — add startCommand (with spawn + timeout + exit wiring)

**Files:**
- Modify: `lib/terminal/manager.ts` (append `startCommand` method)
- Modify: `lib/terminal/manager.test.ts` (append spawn tests)

- [ ] **Step 1: Append spawn tests to manager.test.ts**

Append the following `describe` block to the end of `lib/terminal/manager.test.ts`:

```ts
import { spawn } from "child_process";
import { PassThrough } from "stream";

describe("TerminalManager.startCommand", () => {
  it("spawns `echo hello` and emits a command line, output line, and exit line", async () => {
    const mgr = getTerminalManager();
    const s = mgr.getOrCreate("/tmp/proj-spawn-1");
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
    const s = mgr.getOrCreate("/tmp/proj-spawn-2");
    await mgr.startCommand(s, "sleep 5", false);
    // immediately try to start another; should be rejected
    const result = await mgr.startCommand(s, "echo second", false);
    expect(result).toEqual({ ok: false, reason: "slot_occupied" });
    // cleanup
    mgr.stop(s, "user");
  });

  it("kills the previous keep-running process when a new command is started", async () => {
    const mgr = getTerminalManager();
    const s = mgr.getOrCreate("/tmp/proj-spawn-3");
    await mgr.startCommand(s, "sleep 30", true);
    expect(s.runningProcess?.isKeepRunning).toBe(true);
    const oldPid = s.runningProcess!.pid;
    // Start new command without await — startCommand is sync; the new spawn begins immediately
    const result = await mgr.startCommand(s, "echo replaced", false);
    expect(result.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 500));
    expect(s.runningProcess?.pid).not.toBe(oldPid);
    const info = s.buffer.find((l) => l.kind === "info") as Extract<TerminalLine, { kind: "info" }> | undefined;
    expect(info?.text).toBe("killed by new command");
  });

  it("killed child shows [exit null SIGTERM] in buffer", async () => {
    const mgr = getTerminalManager();
    const s = mgr.getOrCreate("/tmp/proj-spawn-4");
    await mgr.startCommand(s, "sleep 30", true);
    mgr.stop(s, "user");
    await new Promise((r) => setTimeout(r, 500));
    const exitLine = s.buffer.find((l) => l.kind === "exit") as Extract<TerminalLine, { kind: "exit" }> | undefined;
    expect(exitLine).toBeDefined();
    expect(exitLine?.signal).toBe("SIGTERM");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npm run test:run -- lib/terminal/manager.test.ts`
Expected: FAIL with "mgr.startCommand is not a function".

- [ ] **Step 3: Commit the failing tests**

```bash
cd /Users/mk/codespace/pi-web
git add lib/terminal/manager.test.ts
git commit -m "test(terminal): add spawn / kill / slot-occupied tests for manager"
```

- [ ] **Step 4: Implement startCommand in lib/terminal/manager.ts**

Add `import { spawn } from "child_process";` at the top of `lib/terminal/manager.ts`, and append the following method to the `TerminalManager` class (above the `stop` method):

```ts
  /**
   * Spawn a command in the session's cwd. At most one subprocess per
   * session. Behavior depends on current slot state:
   *  - empty: spawn immediately
   *  - non-keep-running alive: return { ok: false, reason: "slot_occupied" }
   *  - keep-running alive: kill it, append "killed by new command", then spawn
   */
  async startCommand(
    session: TerminalSession,
    command: string,
    keepRunning: boolean,
  ): Promise<{ ok: true; pid: number; startedAt: number } | { ok: false; reason: "slot_occupied" }> {
    if (session.runningProcess) {
      if (!session.runningProcess.isKeepRunning) {
        return { ok: false, reason: "slot_occupied" };
      }
      this.stop(session, "new_command");
    }

    const shell = process.env.SHELL || "/bin/bash";
    const child = spawn(shell, ["-c", command], {
      cwd: session.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
      windowsHide: true,
    });

    const pid = child.pid ?? -1;
    const startedAt = Date.now();

    const cmdLine: TerminalLine = { kind: "command", text: command, ts: startedAt, keepRunning };
    this.appendLine(session, cmdLine);
    this.emit(session, { type: "line", line: cmdLine });

    const running: RunningProcess = {
      pid,
      command,
      startedAt,
      isKeepRunning: keepRunning,
      timeoutHandle: null,
      child,
    };

    if (!keepRunning) {
      const settings = getTerminalSettings();
      running.timeoutHandle = setTimeout(() => {
        if (session.runningProcess !== running) return;
        try { child.kill("SIGTERM"); } catch {}
        setTimeout(() => {
          if (session.runningProcess !== running) return;
          try { child.kill("SIGKILL"); } catch {}
        }, 2000);
        const errLine: TerminalLine = {
          kind: "error",
          text: `killed: exceeded default timeout ${settings.defaultTimeoutMs}ms`,
          ts: Date.now(),
        };
        this.appendLine(session, errLine);
        this.emit(session, { type: "line", line: errLine });
      }, settings.defaultTimeoutMs);
    }

    child.stdout?.on("data", (chunk: Buffer) => {
      const line: TerminalLine = { kind: "output", text: chunk.toString("utf8"), ts: Date.now(), stream: "stdout" };
      this.appendLine(session, line);
      this.emit(session, { type: "line", line });
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      const line: TerminalLine = { kind: "output", text: chunk.toString("utf8"), ts: Date.now(), stream: "stderr" };
      this.appendLine(session, line);
      this.emit(session, { type: "line", line });
    });
    child.on("error", (err) => {
      const line: TerminalLine = { kind: "error", text: `spawn failed: ${err.message}`, ts: Date.now() };
      this.appendLine(session, line);
      this.emit(session, { type: "line", line });
    });
    child.on("exit", (code, signal) => {
      if (running.timeoutHandle) {
        clearTimeout(running.timeoutHandle);
        running.timeoutHandle = null;
      }
      if (session.runningProcess === running) {
        session.runningProcess = null;
      }
      const line: TerminalLine = { kind: "exit", code, signal, ts: Date.now() };
      this.appendLine(session, line);
      this.emit(session, { type: "line", line });
      this.emit(session, { type: "state", running: null });
    });

    session.runningProcess = running;
    this.emit(session, { type: "state", running: summarize(running) });
    return { ok: true, pid, startedAt };
  }
```

- [ ] **Step 5: Run tests, verify pass**

Run: `npm run test:run -- lib/terminal/manager.test.ts`
Expected: PASS, all 9 tests, 0 failures.

- [ ] **Step 6: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/mk/codespace/pi-web
git add lib/terminal/manager.ts
git commit -m "feat(terminal): startCommand with slot state machine + timeout + exit wiring"
```

---

### Task 9: Manager — add cleanup handlers (SIGTERM/SIGINT/exit)

**Files:**
- Modify: `lib/terminal/manager.ts`
- Create: `lib/terminal/cleanup.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/terminal/cleanup.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getTerminalManager, resetTerminalManagerForTests } from "./manager";

beforeEach(() => {
  resetTerminalManagerForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TerminalManager cleanup handlers", () => {
  it("killAll() terminates all active subprocesses", async () => {
    const mgr = getTerminalManager();
    const s = mgr.getOrCreate("/tmp/proj-cleanup-1");
    await mgr.startCommand(s, "sleep 30", true);
    expect(s.runningProcess).not.toBeNull();
    mgr.killAll();
    // wait for SIGTERM propagation
    await new Promise((r) => setTimeout(r, 500));
    expect(s.runningProcess).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npm run test:run -- lib/terminal/cleanup.test.ts`
Expected: PASS (we already implemented `killAll`). This task is really about wiring the OS signal handlers — but having the test pass first confirms the kill logic works.

If the test fails, debug `killAll`. Otherwise proceed.

- [ ] **Step 3: Install the OS signal handlers (HMR-safe)**

Append the following to the **end** of `lib/terminal/manager.ts` (after `resetTerminalManagerForTests`):

```ts
declare global {
  // eslint-disable-next-line no-var
  var __piTerminalCleanupInstalled: boolean | undefined;
}

/**
 * Idempotently install SIGTERM / SIGINT / `exit` handlers that kill all
 * active terminal subprocesses. Safe to call from multiple module loads
 * (e.g. Next.js HMR); only the first call actually subscribes.
 */
export function installTerminalCleanupHandlers(): void {
  if (globalThis.__piTerminalCleanupInstalled) return;
  globalThis.__piTerminalCleanupInstalled = true;

  const cleanup = () => {
    try {
      getTerminalManager().killAll();
    } catch {
      // never let cleanup throw during process exit
    }
  };
  process.once("SIGTERM", cleanup);
  process.once("SIGINT", cleanup);
  process.on("exit", cleanup);
}

// Auto-install on module load. HMR-safe via the globalThis flag.
installTerminalCleanupHandlers();
```

- [ ] **Step 4: Typecheck + run all terminal tests**

Run:
```bash
node_modules/.bin/tsc --noEmit
npm run test:run -- lib/terminal/
```
Expected: all 17 tests pass (ring-buffer 6 + settings 5 + manager 9 + cleanup 1 = 21, but some are shared). Whatever the count, **all green**.

- [ ] **Step 5: Commit**

```bash
cd /Users/mk/codespace/pi-web
git add lib/terminal/manager.ts lib/terminal/cleanup.test.ts
git commit -m "feat(terminal): install SIGTERM/SIGINT/exit cleanup handlers (HMR-safe)"
```

---

### Task 10: Phase 1 exit gate

- [ ] **Step 1: Run typecheck and full terminal test suite**

Run:
```bash
node_modules/.bin/tsc --noEmit
npm run test:run -- lib/terminal/
npm run lint -- lib/terminal/
```
Expected: all green.

- [ ] **Step 2: Manual smoke (echo hello end-to-end)**

Run a one-off Node script that drives the manager API:

Create `scripts/smoke-terminal.ts` (do not commit — this is a manual check; add to `.gitignore` if it's not there yet):

```ts
import { getTerminalManager } from "../lib/terminal/manager";
import { resetTerminalManagerForTests } from "../lib/terminal/manager";

resetTerminalManagerForTests();
const mgr = getTerminalManager();
const s = mgr.getOrCreate("/tmp");
const events: string[] = [];
mgr.subscribe(s, (e) => {
  if (e.type === "line") events.push(`${e.line.kind}:${"text" in e.line ? e.line.text : ""}`);
});
await mgr.startCommand(s, "echo hello", false);
await new Promise((r) => setTimeout(r, 500));
console.log("events:", events);
console.log("buffer length:", s.buffer.length);
process.exit(0);
```

Run with `node_modules/.bin/tsx scripts/smoke-terminal.ts` (or use `npx tsx` if `tsx` is installed).

Expected output: `events: [ 'command:echo hello', 'output:hello\n', 'exit:' ]` and `buffer length: 3`.

If `tsx` is not available, use `node_modules/.bin/ts-node` or run via `npm`:
```bash
npx -y tsx scripts/smoke-terminal.ts
```

- [ ] **Step 3: Delete the smoke script**

```bash
rm scripts/smoke-terminal.ts
```

No commit needed; this was a manual verification only.

---

## Phase 2 — API routes

### Task 11: /state route

**Files:**
- Create: `app/api/terminal/[cwd]/state/route.ts`
- Create: `app/api/terminal/[cwd]/state/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/api/terminal/[cwd]/state/route.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetTerminalManagerForTests } from "@/lib/terminal/manager";

beforeEach(() => {
  resetTerminalManagerForTests();
});

describe("GET /api/terminal/[cwd]/state", () => {
  it("returns 200 with empty buffer for a fresh cwd", async () => {
    const { GET } = await import("./route");
    const req = new Request("http://localhost/api/terminal//tmp/proj-state/state") as any;
    // Note: a single slash in the URL would not match; we pass segments directly.
    // Use NextRequest shape:
    const { NextRequest } = await import("next/server");
    const r = new NextRequest("http://localhost/api/terminal//tmp/proj-state/state");
    const res = await GET(r as any, { params: Promise.resolve({ cwd: ["/tmp/proj-state"] }) } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.buffer).toEqual([]);
    expect(body.history).toEqual([]);
    expect(body.running).toBeNull();
  });
});
```

> **Note on the auth/allowedRoots check**: existing routes call `requireApiAuth(request)` and `isPathAllowed(cwd, allowedRoots)`. The test above does not include them — see Step 4 where the implementation imports and calls them. If your `requireApiAuth` is environment-dependent, the test environment may bypass it (check the existing `app/api/git-branch/route.test.ts` pattern in the repo for the actual pattern).

- [ ] **Step 2: Run, verify fail**

Run: `npm run test:run -- app/api/terminal/[cwd]/state/route.test.ts`
Expected: FAIL (route file does not exist).

- [ ] **Step 3: Commit failing test**

```bash
cd /Users/mk/codespace/pi-web
git add app/api/terminal/[cwd]/state/route.test.ts
git commit -m "test(terminal): add failing test for /state route"
```

- [ ] **Step 4: Implement the route**

Create `app/api/terminal/[cwd]/state/route.ts`:

```ts
// app/api/terminal/[cwd]/state/route.ts
//
// GET — snapshot of the terminal session for a given cwd.
// Returns the current buffer, command history, and running-process summary.

import { NextRequest, NextResponse } from "next/server";
import { getTerminalManager } from "@/lib/terminal/manager";
import { requireApiAuth } from "@/lib/api-auth";
import { isPathAllowed, filePathFromSegments } from "@/lib/file-access";
import { listAllSessions } from "@/lib/session-reader";
import { getAgentDir } from "@/lib/agent-dir";
import os from "os";
import path from "path";
import fs from "fs";

declare global {
  // eslint-disable-next-line no-var
  var __piTerminalAllowedRootsCache: { roots: Set<string>; expiresAt: number } | undefined;
}

const ALLOWED_ROOTS_TTL_MS = 5_000;

async function getAllowedRoots(): Promise<Set<string>> {
  const now = Date.now();
  const cached = globalThis.__piTerminalAllowedRootsCache;
  if (cached && cached.expiresAt > now) return cached.roots;
  const sessions = await listAllSessions();
  const roots = new Set<string>();
  for (const s of sessions) if (s.cwd) roots.add(s.cwd);
  roots.add(getAgentDir());
  const home = os.homedir();
  try {
    for (const name of fs.readdirSync(home)) {
      if (/^pi-cwd-\d{8}$/.test(name)) roots.add(path.join(home, name));
    }
  } catch {}
  globalThis.__piTerminalAllowedRootsCache = { roots, expiresAt: now + ALLOWED_ROOTS_TTL_MS };
  return roots;
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ cwd: string[] }> },
) {
  const rejected = requireApiAuth(request);
  if (rejected) return rejected;

  const { cwd: segments } = await ctx.params;
  const cwd = filePathFromSegments(segments);
  const allowed = await getAllowedRoots();
  if (!isPathAllowed(cwd, allowed)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const session = getTerminalManager().getOrCreate(cwd);
  return NextResponse.json({
    buffer: session.buffer,
    history: session.history,
    running: session.runningProcess
      ? {
          pid: session.runningProcess.pid,
          command: session.runningProcess.command,
          startedAt: session.runningProcess.startedAt,
          isKeepRunning: session.runningProcess.isKeepRunning,
        }
      : null,
  });
}
```

- [ ] **Step 5: Run tests, verify pass**

Run: `npm run test:run -- app/api/terminal/[cwd]/state/route.test.ts`
Expected: PASS, 1 test, 0 failures.

- [ ] **Step 6: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/mk/codespace/pi-web
git add app/api/terminal/[cwd]/state/route.ts
git commit -m "feat(terminal): GET /state route with auth + allowed-roots check"
```

---

### Task 12: /stream route (SSE)

**Files:**
- Create: `app/api/terminal/[cwd]/stream/route.ts`
- Create: `app/api/terminal/[cwd]/stream/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/api/terminal/[cwd]/stream/route.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetTerminalManagerForTests, getTerminalManager } from "@/lib/terminal/manager";

beforeEach(() => {
  resetTerminalManagerForTests();
});

describe("GET /api/terminal/[cwd]/stream", () => {
  it("sends a replay event with the current buffer and then live line events", async () => {
    const mgr = getTerminalManager();
    const s = mgr.getOrCreate("/tmp/proj-stream");
    s.buffer.push({ kind: "info", text: "preloaded", ts: 1 });
    s.bufferBytes = 64;

    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://localhost/api/terminal//tmp/proj-stream/stream");
    const { GET } = await import("./route");
    const res = await GET(req as any, { params: Promise.resolve({ cwd: ["/tmp/proj-stream"] }) } as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);

    // Read the first SSE chunk
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    const { value } = await reader.read();
    const text = decoder.decode(value);
    expect(text).toMatch(/event: replay/);
    expect(text).toMatch(/preloaded/);

    // Cancel so the test doesn't hang
    await reader.cancel();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npm run test:run -- app/api/terminal/[cwd]/stream/route.test.ts`
Expected: FAIL (route file does not exist).

- [ ] **Step 3: Commit failing test**

```bash
cd /Users/mk/codespace/pi-web
git add app/api/terminal/[cwd]/stream/route.test.ts
git commit -m "test(terminal): add failing test for /stream SSE route"
```

- [ ] **Step 4: Implement the route**

Create `app/api/terminal/[cwd]/stream/route.ts`:

```ts
// app/api/terminal/[cwd]/stream/route.ts
//
// GET — SSE stream. First emits a `replay` event with the current buffer,
// then live `line` and `state` events. Closing the connection does NOT
// kill the running process; the next connect re-receives the replay.

import { NextRequest, NextResponse } from "next/server";
import { getTerminalManager } from "@/lib/terminal/manager";
import type { TerminalEvent, TerminalSession } from "@/lib/terminal/types";
import { requireApiAuth } from "@/lib/api-auth";
import { isPathAllowed, filePathFromSegments } from "@/lib/file-access";

async function getAllowedRootsForCwd(cwd: string): Promise<Set<string>> {
  // Reuse the same short-TTL cache as /state
  // (kept local to avoid coupling to a private helper; in practice this is
  //  called at most once per request)
  const { listAllSessions } = await import("@/lib/session-reader");
  const { getAgentDir } = await import("@/lib/agent-dir");
  const os = await import("os");
  const path = await import("path");
  const fs = await import("fs");

  const sessions = await listAllSessions();
  const roots = new Set<string>();
  for (const s of sessions) if (s.cwd) roots.add(s.cwd);
  roots.add(getAgentDir());
  try {
    for (const name of fs.readdirSync(os.homedir())) {
      if (/^pi-cwd-\d{8}$/.test(name)) roots.add(path.join(os.homedir(), name));
    }
  } catch {}
  return roots;
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ cwd: string[] }> },
) {
  const rejected = requireApiAuth(request);
  if (rejected) return rejected;

  const { cwd: segments } = await ctx.params;
  const cwd = filePathFromSegments(segments);
  const allowed = await getAllowedRootsForCwd(cwd);
  if (!isPathAllowed(cwd, allowed)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const mgr = getTerminalManager();
  const session = mgr.getOrCreate(cwd);

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: TerminalEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // client disconnected mid-write
        }
      };

      // 1) Send the replay immediately.
      send({ type: "replay", lines: session.buffer });
      send({ type: "state", running: session.runningProcess ? {
        pid: session.runningProcess.pid,
        command: session.runningProcess.command,
        startedAt: session.runningProcess.startedAt,
        isKeepRunning: session.runningProcess.isKeepRunning,
      } : null });

      // 2) Subscribe to live events.
      unsubscribe = mgr.subscribe(session, send);

      // 3) Heartbeat every 15s to keep proxies from idling out the connection.
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {}
      }, 15_000);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
```

- [ ] **Step 5: Run tests, verify pass**

Run: `npm run test:run -- app/api/terminal/[cwd]/stream/route.test.ts`
Expected: PASS, 1 test, 0 failures.

- [ ] **Step 6: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/mk/codespace/pi-web
git add app/api/terminal/[cwd]/stream/route.ts
git commit -m "feat(terminal): GET /stream SSE route with replay + live events + heartbeat"
```

---

### Task 13: /run route

**Files:**
- Create: `app/api/terminal/[cwd]/run/route.ts`
- Create: `app/api/terminal/[cwd]/run/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/api/terminal/[cwd]/run/route.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetTerminalManagerForTests } from "@/lib/terminal/manager";
import { _resetTerminalSettingsCache } from "@/lib/terminal/settings";

beforeEach(() => {
  resetTerminalManagerForTests();
  _resetTerminalSettingsCache();
});

describe("POST /api/terminal/[cwd]/run", () => {
  it("returns 400 when body is missing command", async () => {
    const { NextRequest } = await import("next/server");
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/terminal//tmp/proj-run/run", {
      method: "POST",
      body: JSON.stringify({ keepRunning: false }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req as any, { params: Promise.resolve({ cwd: ["/tmp/proj-run"] }) } as any);
    expect(res.status).toBe(400);
  });

  it("returns 202 with pid for a valid command", async () => {
    const { NextRequest } = await import("next/server");
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/terminal//tmp/proj-run/run", {
      method: "POST",
      body: JSON.stringify({ command: "echo hi", keepRunning: false }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req as any, { params: Promise.resolve({ cwd: ["/tmp/proj-run"] }) } as any);
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.pid).toBeTypeOf("number");
    expect(body.startedAt).toBeTypeOf("number");
  });

  it("returns 409 when a non-keep-running command is still active", async () => {
    const { NextRequest } = await import("next/server");
    const { POST } = await import("./route");
    const cwd = "/tmp/proj-run-2";
    // First request: start a sleep that will block
    const r1 = new NextRequest(`http://localhost/api/terminal/${cwd}/run`, {
      method: "POST",
      body: JSON.stringify({ command: "sleep 5", keepRunning: false }),
      headers: { "content-type": "application/json" },
    });
    const res1 = await POST(r1 as any, { params: Promise.resolve({ cwd: [cwd] }) } as any);
    expect(res1.status).toBe(202);
    // Second request immediately: should be rejected
    const r2 = new NextRequest(`http://localhost/api/terminal/${cwd}/run`, {
      method: "POST",
      body: JSON.stringify({ command: "echo second", keepRunning: false }),
      headers: { "content-type": "application/json" },
    });
    const res2 = await POST(r2 as any, { params: Promise.resolve({ cwd: [cwd] }) } as any);
    expect(res2.status).toBe(409);
    // Cleanup: stop the running session
    const { getTerminalManager } = await import("@/lib/terminal/manager");
    const session = getTerminalManager().getOrCreate(cwd);
    if (session.runningProcess) {
      try { session.runningProcess.child.kill("SIGKILL"); } catch {}
    }
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npm run test:run -- app/api/terminal/[cwd]/run/route.test.ts`
Expected: FAIL (route file does not exist).

- [ ] **Step 3: Commit failing tests**

```bash
cd /Users/mk/codespace/pi-web
git add app/api/terminal/[cwd]/run/route.test.ts
git commit -m "test(terminal): add failing tests for /run route"
```

- [ ] **Step 4: Implement the route**

Create `app/api/terminal/[cwd]/run/route.ts`:

```ts
// app/api/terminal/[cwd]/run/route.ts
//
// POST — start a new command. The 202 response is sent BEFORE the
// subprocess is known to have spawned successfully; spawn failures
// appear later as a `{kind:"error"}` line in the SSE stream.

import { NextRequest, NextResponse } from "next/server";
import { getTerminalManager } from "@/lib/terminal/manager";
import { requireApiAuth } from "@/lib/api-auth";
import { isPathAllowed, filePathFromSegments } from "@/lib/file-access";

async function getAllowedRootsForCwd(cwd: string): Promise<Set<string>> {
  const { listAllSessions } = await import("@/lib/session-reader");
  const { getAgentDir } = await import("@/lib/agent-dir");
  const os = await import("os");
  const path = await import("path");
  const fs = await import("fs");

  const sessions = await listAllSessions();
  const roots = new Set<string>();
  for (const s of sessions) if (s.cwd) roots.add(s.cwd);
  roots.add(getAgentDir());
  try {
    for (const name of fs.readdirSync(os.homedir())) {
      if (/^pi-cwd-\d{8}$/.test(name)) roots.add(path.join(os.homedir(), name));
    }
  } catch {}
  return roots;
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ cwd: string[] }> },
) {
  const rejected = requireApiAuth(request);
  if (rejected) return rejected;

  const { cwd: segments } = await ctx.params;
  const cwd = filePathFromSegments(segments);
  const allowed = await getAllowedRootsForCwd(cwd);
  if (!isPathAllowed(cwd, allowed)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { command?: unknown; keepRunning?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request", reason: "invalid JSON" }, { status: 400 });
  }
  if (typeof body.command !== "string" || body.command.trim() === "") {
    return NextResponse.json({ error: "bad_request", reason: "command is required" }, { status: 400 });
  }
  const keepRunning = body.keepRunning === true;

  const mgr = getTerminalManager();
  const session = mgr.getOrCreate(cwd);
  const result = await mgr.startCommand(session, body.command, keepRunning);
  if (!result.ok) {
    return NextResponse.json(
      { error: "command_in_progress", running: session.runningProcess ? {
        pid: session.runningProcess.pid,
        command: session.runningProcess.command,
        startedAt: session.runningProcess.startedAt,
        isKeepRunning: session.runningProcess.isKeepRunning,
      } : null },
      { status: 409 },
    );
  }
  return NextResponse.json({ pid: result.pid, startedAt: result.startedAt }, { status: 202 });
}
```

- [ ] **Step 5: Run tests, verify pass**

Run: `npm run test:run -- app/api/terminal/[cwd]/run/route.test.ts`
Expected: PASS, 3 tests, 0 failures.

- [ ] **Step 6: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/mk/codespace/pi-web
git add app/api/terminal/[cwd]/run/route.ts
git commit -m "feat(terminal): POST /run route with 202/400/403/409 paths"
```

---

### Task 14: /stop route

**Files:**
- Create: `app/api/terminal/[cwd]/stop/route.ts`
- Create: `app/api/terminal/[cwd]/stop/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/api/terminal/[cwd]/stop/route.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetTerminalManagerForTests, getTerminalManager } from "@/lib/terminal/manager";

beforeEach(() => {
  resetTerminalManagerForTests();
});

describe("POST /api/terminal/[cwd]/stop", () => {
  it("returns 404 when there is no running process", async () => {
    const { NextRequest } = await import("next/server");
    const { POST } = await import("./route");
    const cwd = "/tmp/proj-stop-1";
    getTerminalManager().getOrCreate(cwd);
    const req = new NextRequest(`http://localhost/api/terminal/${cwd}/stop`, { method: "POST" });
    const res = await POST(req as any, { params: Promise.resolve({ cwd: [cwd] }) } as any);
    expect(res.status).toBe(404);
  });

  it("returns 404 when only a non-keep-running process is active", async () => {
    const { NextRequest } = await import("next/server");
    const { POST } = await import("./route");
    const cwd = "/tmp/proj-stop-2";
    const session = getTerminalManager().getOrCreate(cwd);
    await getTerminalManager().startCommand(session, "sleep 5", false);
    const req = new NextRequest(`http://localhost/api/terminal/${cwd}/stop`, { method: "POST" });
    const res = await POST(req as any, { params: Promise.resolve({ cwd: [cwd] }) } as any);
    expect(res.status).toBe(404);
    // cleanup
    try { session.runningProcess?.child.kill("SIGKILL"); } catch {}
  });

  it("returns 200 with killed pid and clears the running process for keep-running", async () => {
    const { NextRequest } = await import("next/server");
    const { POST } = await import("./route");
    const cwd = "/tmp/proj-stop-3";
    const session = getTerminalManager().getOrCreate(cwd);
    await getTerminalManager().startCommand(session, "sleep 30", true);
    const req = new NextRequest(`http://localhost/api/terminal/${cwd}/stop`, { method: "POST" });
    const res = await POST(req as any, { params: Promise.resolve({ cwd: [cwd] }) } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.killed).toBeTypeOf("number");
    // wait for SIGTERM
    await new Promise((r) => setTimeout(r, 500));
    expect(session.runningProcess).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npm run test:run -- app/api/terminal/[cwd]/stop/route.test.ts`
Expected: FAIL (route file does not exist).

- [ ] **Step 3: Commit failing tests**

```bash
cd /Users/mk/codespace/pi-web
git add app/api/terminal/[cwd]/stop/route.test.ts
git commit -m "test(terminal): add failing tests for /stop route"
```

- [ ] **Step 4: Implement the route**

Create `app/api/terminal/[cwd]/stop/route.ts`:

```ts
// app/api/terminal/[cwd]/stop/route.ts
//
// POST — explicitly kill the current keep-running process. Returns 404
// when there is no active process, or when the active process is a
// non-keep-running command (those are time-bounded; explicit stop is
// not exposed for them in v1).

import { NextRequest, NextResponse } from "next/server";
import { getTerminalManager } from "@/lib/terminal/manager";
import { requireApiAuth } from "@/lib/api-auth";
import { isPathAllowed, filePathFromSegments } from "@/lib/file-access";

async function getAllowedRootsForCwd(cwd: string): Promise<Set<string>> {
  const { listAllSessions } = await import("@/lib/session-reader");
  const { getAgentDir } = await import("@/lib/agent-dir");
  const os = await import("os");
  const path = await import("path");
  const fs = await import("fs");

  const sessions = await listAllSessions();
  const roots = new Set<string>();
  for (const s of sessions) if (s.cwd) roots.add(s.cwd);
  roots.add(getAgentDir());
  try {
    for (const name of fs.readdirSync(os.homedir())) {
      if (/^pi-cwd-\d{8}$/.test(name)) roots.add(path.join(os.homedir(), name));
    }
  } catch {}
  return roots;
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ cwd: string[] }> },
) {
  const rejected = requireApiAuth(request);
  if (rejected) return rejected;

  const { cwd: segments } = await ctx.params;
  const cwd = filePathFromSegments(segments);
  const allowed = await getAllowedRootsForCwd(cwd);
  if (!isPathAllowed(cwd, allowed)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const mgr = getTerminalManager();
  const session = mgr.getOrCreate(cwd);
  const rp = session.runningProcess;
  if (!rp) {
    return NextResponse.json({ error: "no_active_process" }, { status: 404 });
  }
  if (!rp.isKeepRunning) {
    return NextResponse.json({ error: "no_active_process" }, { status: 404 });
  }
  const killedPid = rp.pid;
  mgr.stop(session, "user");
  return NextResponse.json({ killed: killedPid });
}
```

- [ ] **Step 5: Run tests, verify pass**

Run: `npm run test:run -- app/api/terminal/[cwd]/stop/route.test.ts`
Expected: PASS, 3 tests, 0 failures.

- [ ] **Step 6: Typecheck + lint + full Phase 2 suite**

Run:
```bash
node_modules/.bin/tsc --noEmit
npm run lint -- app/api/terminal/
npm run test:run -- app/api/terminal/
```
Expected: all green.

- [ ] **Step 7: Commit**

```bash
cd /Users/mk/codespace/pi-web
git add app/api/terminal/[cwd]/stop/route.ts
git commit -m "feat(terminal): POST /stop route (404 for no/non-keep-running, 200 otherwise)"
```

---

### Task 15: Phase 2 exit gate

- [ ] **Step 1: Run all terminal tests + typecheck + lint**

Run:
```bash
node_modules/.bin/tsc --noEmit
npm run lint -- lib/terminal/ app/api/terminal/
npm run test:run -- lib/terminal/ app/api/terminal/
```
Expected: all green.

- [ ] **Step 2: Manual curl walkthrough**

Start the dev server: `npm run dev` (in another terminal). Wait for it to be ready on `http://127.0.0.1:30142`.

In a third terminal, run:
```bash
CWD=$(node -e 'console.log(encodeURIComponent("/Users/mk/codespace/pi-web"))')
curl -s http://127.0.0.1:30142/api/terminal/$CWD/state | head -c 500
echo
curl -sN http://127.0.0.1:30142/api/terminal/$CWD/stream | head -c 500 &
sleep 1
curl -s -X POST http://127.0.0.1:30142/api/terminal/$CWD/run \
  -H "content-type: application/json" \
  -d '{"command":"echo hello-from-curl","keepRunning":false}' | head -c 200
sleep 2
kill %1 2>/dev/null
curl -s http://127.0.0.1:30142/api/terminal/$CWD/state | head -c 800
```

Expected: a 202 response from `/run` with `{pid, startedAt}`, then a `/state` payload containing the `command` line, an `output` line with `hello-from-curl`, and an `exit` line with `code: 0`.

- [ ] **Step 3: Stop the dev server**

```bash
lsof -ti tcp:30142 | xargs kill -TERM 2>/dev/null
```

---

## Phase 3 — React hook

### Task 16: useTerminal — write tests

**Files:**
- Create: `hooks/useTerminal.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `hooks/useTerminal.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useTerminal } from "./useTerminal";
import { resetTerminalManagerForTests, getTerminalManager } from "@/lib/terminal/manager";
import { _resetTerminalSettingsCache } from "@/lib/terminal/settings";

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  readyState = 0;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string) { this.url = url; MockEventSource.instances.push(this); }
  close() { this.readyState = 2; }
  // Test helper: simulate a message event
  emit(event: unknown) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
}

beforeEach(() => {
  resetTerminalManagerForTests();
  _resetTerminalSettingsCache();
  MockEventSource.instances = [];
  (globalThis as any).EventSource = MockEventSource;
  globalThis.fetch = vi.fn(async (url: string) => {
    if (typeof url !== "string") return new Response("not found", { status: 404 });
    if (url.endsWith("/state")) {
      const session = getTerminalManager().getOrCreate("/tmp/proj-hook");
      return new Response(JSON.stringify({ buffer: session.buffer, history: [], running: null }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    return new Response("not found", { status: 404 });
  }) as any;
});

afterEach(() => {
  delete (globalThis as any).EventSource;
  vi.restoreAllMocks();
});

describe("useTerminal", () => {
  it("does not connect when enabled is false", () => {
    renderHook(() => useTerminal("/tmp/proj-hook", false));
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("opens EventSource + fetches state when enabled flips to true", async () => {
    const { result } = renderHook(() => useTerminal("/tmp/proj-hook", true));
    await waitFor(() => {
      expect(MockEventSource.instances.length).toBe(1);
    });
    expect((globalThis.fetch as any).mock.calls.some((c: any[]) => String(c[0]).endsWith("/state"))).toBe(true);
    expect(result.current.running).toBeNull();
    expect(result.current.lines).toEqual([]);
  });

  it("appends lines from SSE events", async () => {
    const { result } = renderHook(() => useTerminal("/tmp/proj-hook", true));
    await waitFor(() => expect(MockEventSource.instances.length).toBe(1));
    const es = MockEventSource.instances[0];
    act(() => {
      es.emit({ type: "line", line: { kind: "info", text: "hello", ts: 1 } });
    });
    await waitFor(() => {
      expect(result.current.lines.length).toBe(1);
    });
    expect(result.current.lines[0].kind).toBe("info");
  });

  it("replaces lines from a replay event", async () => {
    const { result } = renderHook(() => useTerminal("/tmp/proj-hook", true));
    await waitFor(() => expect(MockEventSource.instances.length).toBe(1));
    const es = MockEventSource.instances[0];
    act(() => {
      es.emit({ type: "replay", lines: [
        { kind: "info", text: "old1", ts: 1 },
        { kind: "info", text: "old2", ts: 2 },
      ] });
    });
    await waitFor(() => {
      expect(result.current.lines.length).toBe(2);
    });
    expect((result.current.lines[1] as any).text).toBe("old2");
  });

  it("updates running when a state event arrives", async () => {
    const { result } = renderHook(() => useTerminal("/tmp/proj-hook", true));
    await waitFor(() => expect(MockEventSource.instances.length).toBe(1));
    const es = MockEventSource.instances[0];
    act(() => {
      es.emit({ type: "state", running: { pid: 12345, command: "x", startedAt: 1, isKeepRunning: true } });
    });
    await waitFor(() => {
      expect(result.current.running?.pid).toBe(12345);
    });
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npm run test:run -- hooks/useTerminal.test.ts`
Expected: FAIL (hook file does not exist).

- [ ] **Step 3: Commit failing tests**

```bash
cd /Users/mk/codespace/pi-web
git add hooks/useTerminal.test.ts
git commit -m "test(terminal): add failing tests for useTerminal hook"
```

---

### Task 17: useTerminal — implement

**Files:**
- Create: `hooks/useTerminal.ts`

- [ ] **Step 1: Implement the hook**

Create `hooks/useTerminal.ts`:

```ts
// hooks/useTerminal.ts
//
// React hook for one terminal session (one cwd). Owns the EventSource
// connection to /api/terminal/[cwd]/stream, hydrates from a parallel
// /state fetch, and exposes { lines, history, running, submit, stop, clear }
// to the components that render the panel.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TerminalLine, RunningProcessSummary } from "@/lib/terminal/types";

export type UseTerminalResult = {
  lines: TerminalLine[];
  history: string[];
  running: RunningProcessSummary | null;
  isLoading: boolean;
  error: string | null;
  submit(command: string, keepRunning: boolean): Promise<void>;
  stop(): Promise<void>;
  clear(): Promise<void>;
};

type ServerEvent =
  | { type: "replay"; lines: TerminalLine[] }
  | { type: "line";   line: TerminalLine }
  | { type: "state";  running: RunningProcessSummary | null };

function encodeCwd(cwd: string): string {
  // path is passed as a single segment; the server uses filePathFromSegments
  // which expects the leading slash preserved. We URL-encode the whole thing.
  return encodeURIComponent(cwd);
}

export function useTerminal(cwd: string | null, enabled: boolean): UseTerminalResult {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [running, setRunning] = useState<RunningProcessSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;

  useEffect(() => {
    if (!enabled || !cwd) {
      esRef.current?.close();
      esRef.current = null;
      setLines([]);
      setHistory([]);
      setRunning(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    // 1) Hydrate from /state
    fetch(`/api/terminal/${encodeCwd(cwd)}/state`)
      .then((r) => {
        if (!r.ok) throw new Error(`state ${r.status}`);
        return r.json();
      })
      .then((body: { buffer: TerminalLine[]; history: string[]; running: RunningProcessSummary | null }) => {
        if (cwdRef.current !== cwd) return; // cwd changed during fetch
        setLines(body.buffer);
        setHistory(body.history);
        setRunning(body.running);
      })
      .catch((e: Error) => {
        if (cwdRef.current !== cwd) return;
        setError(e.message);
      })
      .finally(() => {
        if (cwdRef.current === cwd) setIsLoading(false);
      });

    // 2) Open SSE
    const es = new EventSource(`/api/terminal/${encodeCwd(cwd)}/stream`);
    esRef.current = es;
    es.onmessage = (e) => {
      if (cwdRef.current !== cwd) return;
      let evt: ServerEvent;
      try { evt = JSON.parse(e.data); } catch { return; }
      if (evt.type === "replay") {
        setLines(evt.lines);
      } else if (evt.type === "line") {
        setLines((prev) => [...prev, evt.line]);
      } else if (evt.type === "state") {
        setRunning(evt.running);
      }
    };
    es.onerror = () => {
      if (cwdRef.current !== cwd) return;
      // browser will auto-reconnect; surface a transient error
      setError("stream disconnected (reconnecting…)");
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [cwd, enabled]);

  const submit = useCallback(
    async (command: string, keepRunning: boolean) => {
      if (!cwd) return;
      const res = await fetch(`/api/terminal/${encodeCwd(cwd)}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command, keepRunning }),
      });
      if (!res.ok && res.status !== 202) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `run ${res.status}`);
      }
    },
    [cwd],
  );

  const stop = useCallback(async () => {
    if (!cwd) return;
    const res = await fetch(`/api/terminal/${encodeCwd(cwd)}/stop`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `stop ${res.status}`);
    }
  }, [cwd]);

  const clear = useCallback(async () => {
    // The server doesn't expose a clear endpoint in v1; clients clear
    // their own view by re-hydrating from /state. For now, no-op.
    // (A future task can add DELETE /buffer if real need emerges.)
    setLines([]);
  }, []);

  return { lines, history, running, isLoading, error, submit, stop, clear };
}
```

- [ ] **Step 2: Run tests, verify pass**

Run: `npm run test:run -- hooks/useTerminal.test.ts`
Expected: PASS, 5 tests, 0 failures.

- [ ] **Step 3: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/mk/codespace/pi-web
git add hooks/useTerminal.ts
git commit -m "feat(terminal): useTerminal hook with SSE + state hydration + submit/stop/clear"
```

---

## Phase 4 — UI components

### Task 18: TerminalOutput — write tests

**Files:**
- Create: `components/TerminalOutput.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `components/TerminalOutput.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TerminalOutput } from "./TerminalOutput";
import type { TerminalLine } from "@/lib/terminal/types";

describe("TerminalOutput", () => {
  it("renders an empty container when no lines are provided", () => {
    const { container } = render(<TerminalOutput lines={[]} />);
    expect(container.querySelector(".terminal-output")).toBeTruthy();
    expect(container.querySelectorAll(".line-cmd, .line-out, .line-exit, .line-err, .line-info")).toHaveLength(0);
  });

  it("renders each line kind with the right class", () => {
    const lines: TerminalLine[] = [
      { kind: "command",   text: "ls",                ts: 1, keepRunning: false },
      { kind: "output",    text: "file.txt\n",        ts: 2, stream: "stdout" },
      { kind: "output",    text: "warn: x\n",         ts: 3, stream: "stderr" },
      { kind: "exit",      code: 0, signal: null,     ts: 4 },
      { kind: "exit",      code: 1, signal: null,     ts: 5 },
      { kind: "error",     text: "spawn failed",      ts: 6 },
      { kind: "info",      text: "killed",            ts: 7 },
      { kind: "truncated", droppedBytes: 1024,        ts: 8 },
    ];
    const { container } = render(<TerminalOutput lines={lines} />);
    expect(container.querySelector(".line-cmd")).toBeTruthy();
    expect(container.querySelector(".line-stdout")).toBeTruthy();
    expect(container.querySelector(".line-stderr")).toBeTruthy();
    expect(container.querySelector(".line-exit-ok")).toBeTruthy();
    expect(container.querySelector(".line-exit-fail")).toBeTruthy();
    expect(container.querySelector(".line-err")).toBeTruthy();
    expect(container.querySelector(".line-info")).toBeTruthy();
  });

  it("shows the jump-to-bottom button when autoScroll is false (after scroll-up)", () => {
    const lines: TerminalLine[] = [
      { kind: "output", text: "hello", ts: 1, stream: "stdout" },
    ];
    const { container } = render(<TerminalOutput lines={lines} />);
    const scroller = container.querySelector(".terminal-output") as HTMLDivElement;
    // Simulate scroll up
    Object.defineProperty(scroller, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(scroller, "clientHeight", { value: 100, configurable: true });
    scroller.scrollTop = 0;
    fireEvent.scroll(scroller);
    // The jump button should now be in the DOM
    const btn = container.querySelector(".jump-to-bottom");
    expect(btn).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npm run test:run -- components/TerminalOutput.test.tsx`
Expected: FAIL (component file does not exist).

- [ ] **Step 3: Commit failing tests**

```bash
cd /Users/mk/codespace/pi-web
git add components/TerminalOutput.test.tsx
git commit -m "test(terminal): add failing tests for TerminalOutput"
```

---

### Task 19: TerminalOutput — implement

**Files:**
- Create: `components/TerminalOutput.tsx`

- [ ] **Step 1: Implement the component**

Create `components/TerminalOutput.tsx`:

```tsx
// components/TerminalOutput.tsx
//
// Renders the terminal scrollback. 6 distinct line-* classes. Auto-scrolls
// to the bottom when the user is within 30px of the bottom; pauses when
// they scroll up. A floating "↓ jump to bottom" button re-enables it.

"use client";

import { useEffect, useRef, useState } from "react";
import type { TerminalLine } from "@/lib/terminal/types";

const AUTOSCROLL_THRESHOLD_PX = 30;

export function TerminalOutput({ lines }: { lines: TerminalLine[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || !autoScroll) return;
    el.scrollTop = el.scrollHeight;
  }, [lines, autoScroll]);

  const onScroll = () => {
    const el = ref.current!;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAutoScroll(distFromBottom < AUTOSCROLL_THRESHOLD_PX);
  };

  return (
    <div ref={ref} className="terminal-output" onScroll={onScroll}>
      {lines.map((line, i) => (
        <Line key={i} line={line} />
      ))}
      {!autoScroll && (
        <button
          className="jump-to-bottom"
          onClick={() => {
            setAutoScroll(true);
            const el = ref.current;
            if (el) el.scrollTop = el.scrollHeight;
          }}
        >
          ↓ jump to bottom
        </button>
      )}
    </div>
  );
}

function Line({ line }: { line: TerminalLine }) {
  switch (line.kind) {
    case "command":
      return <div className="line-cmd">$ {line.text}</div>;
    case "output":
      return <div className={`line-out line-${line.stream}`}>{line.text}</div>;
    case "exit":
      if (line.code === 0) {
        return <div className="line-exit line-exit-ok">[exit 0]</div>;
      }
      return (
        <div className="line-exit line-exit-fail">
          [exit {line.code ?? line.signal ?? "?"}]
        </div>
      );
    case "error":
      return <div className="line-err">⚠ {line.text}</div>;
    case "info":
      return <div className="line-info">· {line.text}</div>;
    case "truncated":
      return <div className="line-info">… {line.droppedBytes} bytes truncated …</div>;
  }
}
```

- [ ] **Step 2: Run tests, verify pass**

Run: `npm run test:run -- components/TerminalOutput.test.tsx`
Expected: PASS, 3 tests, 0 failures.

- [ ] **Step 3: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/mk/codespace/pi-web
git add components/TerminalOutput.tsx
git commit -m "feat(terminal): TerminalOutput with 6 line classes + autoscroll + jump button"
```

---

### Task 20: TerminalInput — write tests

**Files:**
- Create: `components/TerminalInput.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `components/TerminalInput.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TerminalInput } from "./TerminalInput";

describe("TerminalInput", () => {
  it("submits on Enter and clears the field", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<TerminalInput history={[]} onSubmit={onSubmit} disabled={false} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "ls" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("ls", false);
    expect(input.value).toBe("");
  });

  it("does not submit on Shift+Enter", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<TerminalInput history={[]} onSubmit={onSubmit} disabled={false} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "x" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("ArrowUp from empty field shows the most recent history entry", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<TerminalInput history={["foo", "bar"]} onSubmit={onSubmit} disabled={false} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.value).toBe("bar");
  });

  it("ArrowDown from the oldest entry clears the field", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<TerminalInput history={["foo", "bar"]} onSubmit={onSubmit} disabled={false} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "ArrowUp" }); // -> bar
    fireEvent.keyDown(input, { key: "ArrowUp" }); // -> foo
    fireEvent.keyDown(input, { key: "ArrowDown" }); // -> bar
    fireEvent.keyDown(input, { key: "ArrowDown" }); // -> clear
    expect(input.value).toBe("");
  });

  it("toggles keep-running and resets after submit", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<TerminalInput history={[]} onSubmit={onSubmit} disabled={false} />);
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "tail -f" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("tail -f", true);
    expect(checkbox.checked).toBe(false);
  });

  it("disables input and ignores Enter when disabled", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<TerminalInput history={[]} onSubmit={onSubmit} disabled={true} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "x" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npm run test:run -- components/TerminalInput.test.tsx`
Expected: FAIL (component file does not exist).

- [ ] **Step 3: Commit failing tests**

```bash
cd /Users/mk/codespace/pi-web
git add components/TerminalInput.test.tsx
git commit -m "test(terminal): add failing tests for TerminalInput"
```

---

### Task 21: TerminalInput — implement

**Files:**
- Create: `components/TerminalInput.tsx`

- [ ] **Step 1: Implement the component**

Create `components/TerminalInput.tsx`:

```tsx
// components/TerminalInput.tsx
//
// Single-line input with Enter-to-submit, ↑/↓ history navigation, and a
// keep-running checkbox that resets after each submit. Shift+Enter is
// captured (no newline) — multi-line commands are out of scope in v1.

"use client";

import { useState } from "react";

export function TerminalInput({
  history,
  onSubmit,
  disabled,
}: {
  history: string[];
  onSubmit: (command: string, keepRunning: boolean) => Promise<void> | void;
  disabled: boolean;
}) {
  const [value, setValue] = useState("");
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [keepRunning, setKeepRunning] = useState(false);

  const submit = async () => {
    const cmd = value.trim();
    if (!cmd) return;
    const kr = keepRunning;
    setValue("");
    setHistoryIdx(-1);
    setKeepRunning(false);
    try {
      await onSubmit(cmd, kr);
    } catch {
      // surface error in parent (terminal output already shows server-side errors)
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0) return;
      const next = historyIdx === -1 ? history.length - 1 : historyIdx - 1;
      if (next < 0) return;
      setHistoryIdx(next);
      setValue(history[next]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIdx === -1) return;
      const next = historyIdx + 1;
      if (next >= history.length) {
        setHistoryIdx(-1);
        setValue("");
      } else {
        setHistoryIdx(next);
        setValue(history[next]);
      }
    }
  };

  return (
    <div className="terminal-input">
      <label className="keep-running-toggle">
        <input
          type="checkbox"
          checked={keepRunning}
          onChange={(e) => setKeepRunning(e.target.checked)}
          disabled={disabled}
        />
        keep running
      </label>
      <input
        className="terminal-input-field"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder={disabled ? "Running…" : "$ type a command, ↑/↓ for history"}
        autoFocus
        spellCheck={false}
        autoComplete="off"
      />
    </div>
  );
}
```

- [ ] **Step 2: Run tests, verify pass**

Run: `npm run test:run -- components/TerminalInput.test.tsx`
Expected: PASS, 6 tests, 0 failures.

- [ ] **Step 3: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/mk/codespace/pi-web
git add components/TerminalInput.tsx
git commit -m "feat(terminal): TerminalInput with Enter/↑↓/keep-running"
```

---

### Task 22: OpenTerminalButton — write tests

**Files:**
- Create: `components/OpenTerminalButton.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `components/OpenTerminalButton.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OpenTerminalButton } from "./OpenTerminalButton";

describe("OpenTerminalButton", () => {
  it("is enabled and triggers onClick when cwd is provided", () => {
    const onClick = vi.fn();
    render(<OpenTerminalButton hasCwd={true} onClick={onClick} />);
    const btn = screen.getByRole("button");
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is disabled with a tooltip when no cwd", () => {
    const onClick = vi.fn();
    render(<OpenTerminalButton hasCwd={false} onClick={onClick} />);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("title")).toMatch(/session/i);
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npm run test:run -- components/OpenTerminalButton.test.tsx`
Expected: FAIL (component file does not exist).

- [ ] **Step 3: Commit failing tests**

```bash
cd /Users/mk/codespace/pi-web
git add components/OpenTerminalButton.test.tsx
git commit -m "test(terminal): add failing tests for OpenTerminalButton"
```

---

### Task 23: OpenTerminalButton — implement

**Files:**
- Create: `components/OpenTerminalButton.tsx`

- [ ] **Step 1: Implement the component**

Create `components/OpenTerminalButton.tsx`:

```tsx
// components/OpenTerminalButton.tsx
//
// Icon button rendered inside ChatInput that opens the terminal drawer.
// Disabled with a tooltip when there is no active session (no cwd to
// scope the terminal to).

"use client";

export function OpenTerminalButton({
  hasCwd,
  onClick,
}: {
  hasCwd: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="terminal-open-btn"
      onClick={onClick}
      disabled={!hasCwd}
      title={hasCwd ? "Open terminal (for this project)" : "Open a session first"}
    >
      📟 Terminal
    </button>
  );
}
```

- [ ] **Step 2: Run tests, verify pass**

Run: `npm run test:run -- components/OpenTerminalButton.test.tsx`
Expected: PASS, 2 tests, 0 failures.

- [ ] **Step 3: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/mk/codespace/pi-web
git add components/OpenTerminalButton.tsx
git commit -m "feat(terminal): OpenTerminalButton with disabled state + tooltip"
```

---

### Task 24: TerminalPanel — write tests

**Files:**
- Create: `components/TerminalPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `components/TerminalPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/hooks/useTerminal", () => ({
  useTerminal: vi.fn(),
}));

import { useTerminal } from "@/hooks/useTerminal";
import { TerminalPanel } from "./TerminalPanel";

const mockUseTerminal = useTerminal as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockUseTerminal.mockReset();
});

describe("TerminalPanel", () => {
  it("renders nothing visible when open is false", () => {
    mockUseTerminal.mockReturnValue({
      lines: [], history: [], running: null, isLoading: false, error: null,
      submit: vi.fn(), stop: vi.fn(), clear: vi.fn(),
    });
    const { container } = render(
      <TerminalPanel cwd="/tmp/proj" open={false} height={0.4} onClose={vi.fn()} onHeightChange={vi.fn()} />,
    );
    expect(container.firstChild).toBeTruthy();
    expect((container.firstChild as HTMLElement).style.display).toBe("none");
  });

  it("renders status bar, output, and input when open", () => {
    mockUseTerminal.mockReturnValue({
      lines: [], history: [], running: null, isLoading: false, error: null,
      submit: vi.fn(), stop: vi.fn(), clear: vi.fn(),
    });
    render(
      <TerminalPanel cwd="/tmp/proj" open={true} height={0.4} onClose={vi.fn()} onHeightChange={vi.fn()} />,
    );
    expect(screen.getByText("📟 Terminal")).toBeTruthy(); // status bar shows cwd label
    // (useTerminal mock returns no running; we don't see a Stop button)
  });

  it("shows Stop button when running and keepRunning=true; click triggers stop()", () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    mockUseTerminal.mockReturnValue({
      lines: [], history: [],
      running: { pid: 12345, command: "tail -f", startedAt: Date.now(), isKeepRunning: true },
      isLoading: false, error: null,
      submit: vi.fn(), stop, clear: vi.fn(),
    });
    render(
      <TerminalPanel cwd="/tmp/proj" open={true} height={0.4} onClose={vi.fn()} onHeightChange={vi.fn()} />,
    );
    const stopBtn = screen.getByRole("button", { name: /stop/i });
    fireEvent.click(stopBtn);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("input is disabled when running and not keepRunning", () => {
    mockUseTerminal.mockReturnValue({
      lines: [], history: [],
      running: { pid: 1, command: "x", startedAt: Date.now(), isKeepRunning: false },
      isLoading: false, error: null,
      submit: vi.fn(), stop: vi.fn(), clear: vi.fn(),
    });
    render(
      <TerminalPanel cwd="/tmp/proj" open={true} height={0.4} onClose={vi.fn()} onHeightChange={vi.fn()} />,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npm run test:run -- components/TerminalPanel.test.tsx`
Expected: FAIL (component file does not exist).

- [ ] **Step 3: Commit failing tests**

```bash
cd /Users/mk/codespace/pi-web
git add components/TerminalPanel.test.tsx
git commit -m "test(terminal): add failing tests for TerminalPanel"
```

---

### Task 25: TerminalPanel — implement

**Files:**
- Create: `components/TerminalPanel.tsx`

- [ ] **Step 1: Implement the component**

Create `components/TerminalPanel.tsx`:

```tsx
// components/TerminalPanel.tsx
//
// Bottom-drawer container for the terminal UI. Owns the drag-to-resize
// handle and the status bar. Re-mounts the inner hook (and thus the SSE
// connection) whenever `cwd` changes — the parent (AppShell) is expected
// to set `key={cwd}` for that to work, or to re-mount the panel.

"use client";

import { useState, useRef, useCallback } from "react";
import { useTerminal } from "@/hooks/useTerminal";
import { TerminalOutput } from "./TerminalOutput";
import { TerminalInput } from "./TerminalInput";

export function TerminalPanel({
  cwd,
  open,
  height,
  onClose,
  onHeightChange,
}: {
  cwd: string;
  open: boolean;
  height: number;
  onClose: () => void;
  onHeightChange: (next: number) => void;
}) {
  const term = useTerminal(cwd, open);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);
  const startH = useRef(height);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      setDragging(true);
      startY.current = e.clientY;
      startH.current = height;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [height],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      const dy = startY.current - e.clientY;
      const newPx = startH.current * window.innerHeight + dy;
      const newFrac = Math.max(0.24, Math.min(0.8, newPx / window.innerHeight));
      onHeightChange(newFrac);
    },
    [dragging, onHeightChange],
  );
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    setDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  const elapsedSec = term.running
    ? Math.floor((Date.now() - term.running.startedAt) / 1000)
    : null;

  return (
    <div
      className="terminal-panel"
      data-open={open ? "true" : "false"}
      style={{ display: open ? "flex" : "none", height: `${height * 100}vh` }}
    >
      <div
        className="terminal-resize-handle"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        aria-label="Resize terminal"
      />
      <div className="terminal-status-bar">
        <span className="terminal-status-cwd" title={cwd}>📟 {shortenPath(cwd)}</span>
        {term.running && (
          <>
            <span className="terminal-status-pid">PID {term.running.pid}</span>
            <span className="terminal-status-elapsed">running {formatElapsed(elapsedSec!)}</span>
            {term.running.isKeepRunning && (
              <button className="terminal-status-stop" onClick={() => { void term.stop(); }}>
                Stop
              </button>
            )}
          </>
        )}
        {term.error && <span className="terminal-status-error">{term.error}</span>}
        <button className="terminal-status-close" onClick={onClose} aria-label="Close terminal">
          ✕
        </button>
      </div>
      <TerminalOutput lines={term.lines} />
      <TerminalInput
        history={term.history}
        disabled={!!term.running && !term.running.isKeepRunning}
        onSubmit={(cmd, kr) => term.submit(cmd, kr)}
      />
    </div>
  );
}

function shortenPath(p: string): string {
  // Show just the last 2 path components for compactness in the status bar
  const parts = p.split("/").filter(Boolean);
  if (parts.length <= 2) return p;
  return "…/" + parts.slice(-2).join("/");
}

function formatElapsed(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return `${m}m${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60}m`;
}
```

- [ ] **Step 2: Run tests, verify pass**

Run: `npm run test:run -- components/TerminalPanel.test.tsx`
Expected: PASS, 4 tests, 0 failures.

- [ ] **Step 3: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/mk/codespace/pi-web
git add components/TerminalPanel.tsx
git commit -m "feat(terminal): TerminalPanel drawer with status bar + resize handle"
```

---

### Task 26: Phase 4 exit gate

- [ ] **Step 1: Run all UI + hook tests**

Run:
```bash
node_modules/.bin/tsc --noEmit
npm run lint -- hooks/ components/Terminal* components/OpenTerminalButton.tsx
npm run test:run -- hooks/ components/
```
Expected: all green.

- [ ] **Step 2: Add CSS**

Append the following to `app/globals.css` (find a sensible insertion point near the other panel-related rules; if there isn't one, add at the end):

```css
/* === Terminal panel === */
.terminal-panel {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border);
  background: var(--bg-panel);
  flex-shrink: 0;
}
.terminal-resize-handle {
  height: 4px;
  cursor: ns-resize;
  background: transparent;
  flex-shrink: 0;
}
.terminal-resize-handle:hover {
  background: var(--accent);
  opacity: 0.4;
}
.terminal-status-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 12px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  flex-shrink: 0;
}
.terminal-status-cwd { color: var(--text); }
.terminal-status-pid { color: var(--text-dim); }
.terminal-status-elapsed { color: var(--text-dim); }
.terminal-status-stop,
.terminal-status-close {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  font: inherit;
}
.terminal-status-stop { margin-left: auto; }
.terminal-status-stop:hover { color: #f87171; border-color: #f87171; }
.terminal-status-error { color: #fbbf24; }

.terminal-output {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  position: relative;
}
.line-cmd        { color: var(--accent); font-weight: 600; }
.line-out        { color: var(--text); }
.line-stdout     { color: var(--text); }
.line-stderr     { color: #f87171; }
.line-exit       { }
.line-exit-ok    { color: #4ade80; }
.line-exit-fail  { color: #f87171; }
.line-err        { color: #fbbf24; }
.line-info       { color: var(--text-dim); font-style: italic; }

.jump-to-bottom {
  position: sticky;
  bottom: 12px;
  left: 100%;
  transform: translateX(-100%);
  margin: 0 12px 12px auto;
  display: block;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  z-index: 1;
}

.terminal-input {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  border-top: 1px solid var(--border);
  background: var(--bg);
  flex-shrink: 0;
}
.terminal-input-field {
  flex: 1;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 13px;
  padding: 6px 8px;
  border-radius: 4px;
  outline: none;
}
.terminal-input-field:focus { border-color: var(--accent); }
.terminal-input-field:disabled { opacity: 0.5; cursor: not-allowed; }
.keep-running-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-muted);
  user-select: none;
  cursor: pointer;
}

.terminal-open-btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}
.terminal-open-btn:hover:not(:disabled) { color: var(--text); border-color: var(--accent); }
.terminal-open-btn:disabled { opacity: 0.4; cursor: not-allowed; }
```

- [ ] **Step 3: Commit**

```bash
cd /Users/mk/codespace/pi-web
git add app/globals.css
git commit -m "feat(terminal): CSS for terminal panel, output lines, input, status bar"
```

---

## Phase 5 — Integration & QA

### Task 27: Wire OpenTerminalButton into ChatInput

**Files:**
- Modify: `components/ChatInput.tsx`
- Modify: `components/ChatWindow.tsx`

- [ ] **Step 1: Inspect ChatInput's existing props**

Run: `grep -n "interface\|type.*=\|export" components/ChatInput.tsx | head -30`

Confirm ChatInput has a `Props` / interface with the existing optional callbacks. We will add `onOpenTerminal?: () => void;`.

- [ ] **Step 2: Inspect ChatWindow's prop forwarding to ChatInput**

Run: `grep -n "ChatInput\|interface\|type.*=" components/ChatWindow.tsx | head -30`

Confirm ChatWindow passes callbacks to ChatInput via props. We will add `onOpenTerminal?: () => void;` to ChatWindow's interface and forward it.

- [ ] **Step 3: Add `onOpenTerminal` to ChatInput**

Edit `components/ChatInput.tsx`. Add the new prop to the Props type and render the button at the end of the existing controls row (find the closing tag of the model/thinking/tools/compact controls group — the exact location depends on the existing structure; look for the closing `</div>` of the `.input-controls` or similar):

```tsx
import { OpenTerminalButton } from "./OpenTerminalButton";
// ... inside Props:
onOpenTerminal?: () => void;
// ... inside the JSX, alongside the other controls:
{onOpenTerminal && (
  <OpenTerminalButton
    hasCwd={!!cwd}
    onClick={onOpenTerminal}
  />
)}
```

> Adjust the `cwd` prop name to match the existing variable in ChatInput that holds the current session's cwd. If ChatInput doesn't currently know the cwd, plumb it down from ChatWindow in the same edit.

- [ ] **Step 4: Forward from ChatWindow**

Edit `components/ChatWindow.tsx`. Add `onOpenTerminal?: () => void;` to the Props type and forward it to ChatInput:

```tsx
<ChatInput
  ...other props
  onOpenTerminal={onOpenTerminal}
/>
```

- [ ] **Step 5: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/mk/codespace/pi-web
git add components/ChatInput.tsx components/ChatWindow.tsx
git commit -m "feat(terminal): wire OpenTerminalButton into ChatInput via ChatWindow"
```

---

### Task 28: Mount TerminalPanel in AppShell

**Files:**
- Modify: `components/AppShell.tsx`

- [ ] **Step 1: Inspect AppShell's current state and layout**

Run: `grep -n "useState\|<main\|<aside\|className=.app-shell" components/AppShell.tsx | head -30`

Identify:
- Where state hooks live
- The top-level layout div(s)
- Where ChatWindow is rendered (so we can put TerminalPanel alongside it)

- [ ] **Step 2: Add terminal state to AppShell**

Add to the imports at the top of `components/AppShell.tsx`:

```tsx
import { TerminalPanel } from "./TerminalPanel";
```

Add new state hooks next to the existing `useState` calls:

```tsx
const [terminalOpen, setTerminalOpen] = useState(false);
const [terminalHeight, setTerminalHeight] = useState(0.4);
const terminalCwd = useMemo(() => {
  // replace `activeSession` with whatever variable holds the active session in AppShell
  const active = sessions.find(s => s.id === activeSessionId);
  return active?.cwd ?? null;
}, [sessions, activeSessionId]);
```

If `useMemo` is not already imported, add it to the React import.

- [ ] **Step 3: Pass `onOpenTerminal` down to ChatWindow**

Find the `<ChatWindow ... />` JSX and add the prop:

```tsx
<ChatWindow
  ...other props
  onOpenTerminal={() => setTerminalOpen(true)}
/>
```

- [ ] **Step 4: Mount TerminalPanel next to ChatWindow**

Find the top-level `<div className="app-shell">` (or equivalent). Inside it, add TerminalPanel AFTER ChatWindow so the drawer sits at the bottom of the column. Wrap ChatWindow in a flex column that lets the terminal push the chat up:

```tsx
<div className="app-shell-main" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
  <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
    <ChatWindow ... />
  </div>
  {terminalCwd && (
    <TerminalPanel
      key={terminalCwd}
      cwd={terminalCwd}
      open={terminalOpen}
      height={terminalHeight}
      onClose={() => setTerminalOpen(false)}
      onHeightChange={setTerminalHeight}
    />
  )}
</div>
```

> **Important**: the wrapping div with `flex: 1, overflow: hidden` is what makes the chat scroll independently of the terminal drawer. The terminal panel uses `flex-shrink: 0` (set in CSS) so it keeps its fixed height.

- [ ] **Step 5: Typecheck + lint**

Run:
```bash
node_modules/.bin/tsc --noEmit
npm run lint -- components/AppShell.tsx
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/mk/codespace/pi-web
git add components/AppShell.tsx
git commit -m "feat(terminal): mount TerminalPanel in AppShell, lift terminal state"
```

---

### Task 29: CHANGELOG entry

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Find the "Unreleased" section**

Run: `head -50 CHANGELOG.md`

Locate the "Unreleased" header. If there is none, add one above the most recent release.

- [ ] **Step 2: Add the entry**

Add the following bullet under "Unreleased":

```markdown
- Integrated bottom-drawer terminal panel for running shell commands (npm run dev, pytest, git, log tailing) in the browser. One terminal per project, independent from the agent's bash tool. Subprocess-based (no PTY) with a "keep running" mode for long tasks. Output is a 1MB in-memory ring buffer; default 5-minute timeout; 50-command history. Survives drawer close, page refresh, and session switch. See `docs/superpowers/specs/2026-06-09-pi-web-terminal-panel-design.md`.
```

- [ ] **Step 3: Commit**

```bash
cd /Users/mk/codespace/pi-web
git add CHANGELOG.md
git commit -m "docs(changelog): terminal panel entry"
```

---

### Task 30: Manual QA checklist (14 cases from spec §12.4)

This task is not automated. Walk through the 14 cases below, ticking each in a comment in this task before moving on.

- [ ] Open a session whose cwd is a Node project. Click `Terminal`. Drawer slides up.
- [ ] Type `npm run dev` (or `python -m http.server`) with `keep-running` checked. See "Server listening" appear.
- [ ] F5 the page. Reopen the drawer. Same output is still there; PID unchanged (verify via `ps -p <pid>`).
- [ ] Open a second session with a different cwd. The drawer auto-switches content.
- [ ] Return to the first session. Dev server is still running, output is still streaming.
- [ ] Run `ls /nonexistent`. See a red stderr line and a `[exit 1]` line.
- [ ] Run `python -c "print(2+2)"`. See `4` and `[exit 0]`.
- [ ] Run `python` (no `-c`). It exits immediately (stdin=ignore).
- [ ] Tick `keep-running`, run `tail -f /tmp/somefile` (or `sleep 100`). Output streams. Type a new command → old one is killed, new one starts; grey "killed by new command" line visible.
- [ ] Without `keep-running`, run `sleep 3`. See the input box disable, the Stop button hide, and the `exit` line appear after 3 s.
- [ ] With a keep-running process alive, click `Stop`. The process disappears from `ps`. Input stays enabled.
- [ ] Push the buffer past 1 MB (e.g. `yes | head -c 2000000 | head -c 1100000`). See a `truncated` line.
- [ ] Quit Pi.app (or stop `npm start`). Confirm via `ps aux | grep -E "sleep|npm"` that no terminal children survive.
- [ ] Re-launch Pi.app. Open a session. The terminal drawer opens with an empty buffer (in-memory only — no persistence by design).

If any case fails, open a follow-up commit. Do not mark this task done until all 14 pass.

---

### Task 31: Final regression — typecheck + lint + full test suite

- [ ] **Step 1: Run the full check**

Run:
```bash
cd /Users/mk/codespace/pi-web
node_modules/.bin/tsc --noEmit
npm run lint
npm run test:run
```
Expected: all green.

- [ ] **Step 2: If anything is red, fix it before claiming the slice is done**

Common follow-ups:
- Lint complaints on the new files (likely `no-explicit-any` in the test files — suppress with `// eslint-disable-next-line` if appropriate, or refactor the test to avoid `any`).
- Test isolation issues: if a unit test fails because of state leaking from a sibling test, import `resetTerminalManagerForTests()` into a `beforeEach`.
- Type errors: most often from not importing a type that another file references.

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
cd /Users/mk/codespace/pi-web
git add -A
git commit -m "chore(terminal): regression fixes from final test run"
```

---

## Self-Review

After writing the plan, check it against the spec:

**1. Spec coverage.** Skim each section of `docs/superpowers/specs/2026-06-09-pi-web-terminal-panel-design.md`:

| Spec section | Covered in plan |
|---|---|
| §1 Objective (integrated terminal panel) | Phase 1–5 holistically |
| §2 Scope (file inventory, OOS list) | Phase 1–5 tasks, OOS items called out in Task 1 / 6 / 11 / 16 |
| §3 Goals (drawer, persists, slot rules) | Tasks 8, 12, 13, 14, 17, 25, 28 |
| §3 Non-goals (no PTY, no multi-terminal, etc.) | Task 7 (no stdin), Task 2–5 (one slot), Task 21 (no Shift+Enter) |
| §4 Architecture (file layout, component tree) | Phase 1–4 file structure table, Task 25 (component tree) |
| §5 Data model (6 types) | Task 1 |
| §6 Lifecycle + state machine (slot rules, kill, timeout, buffer) | Task 8 (startCommand), Task 3 (ring buffer), Task 9 (cleanup) |
| §7 Cleanup / HMR / crash safety | Task 9 (cleanup), Task 7 (globalThis registry) |
| §8 API contract (4 endpoints) | Tasks 11–14 |
| §9 Frontend (hook + 4 components) | Tasks 16–25 |
| §10 Settings | Task 5 |
| §11 Error matrix | Tasks 8 (slot occupied, kill replacement), 11 (403), 13 (409), 14 (404), 7 (killAll) |
| §12 Testing strategy | Tests written in every task; manual QA in Task 30 |
| §13 Phased plan | This document |
| §14 Risks | Task 30 (HMR stress test via F5 during dev), Task 7 (globalThis), Task 9 (cleanup) |

No gaps found.

**2. Placeholder scan.** Search the plan for `TBD`, `TODO`, "implement later", "appropriate error handling", "similar to Task N" — none present. Every step shows actual code or commands.

**3. Type consistency.** The types in Task 1 are used verbatim across all subsequent tasks:
- `TerminalLine` discriminated union — 6 cases (`command` / `output` / `exit` / `error` / `info` / `truncated`) — used in Tasks 2, 3, 6, 7, 8, 17, 18, 19.
- `RunningProcess` / `RunningProcessSummary` — used in Tasks 7, 8, 11, 12, 13, 14, 17, 25.
- `TerminalSession` — used in Tasks 2, 3, 6, 7, 8, 11, 12, 13, 14, 17.
- `TerminalEvent` discriminated union — 3 cases (`replay` / `line` / `state`) — used in Tasks 6, 7, 12, 17.
- `TerminalListener` — used in Tasks 6, 7, 12.

`useTerminal` API (`{ lines, history, running, submit, stop, clear }`) is consistent between Task 16 (tests) and Task 17 (implementation). The hook is consumed by Task 25 (TerminalPanel) with the exact same shape.

`TerminalManager` API (`getOrCreate`, `subscribe`, `emit`, `appendLine`, `startCommand`, `stop`, `killAll`) is consistent between Tasks 6/7/8/9 (manager) and Tasks 11/12/13/14 (routes) and Tasks 16/17 (hook, via fetch).

No type mismatches.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-09-pi-web-terminal-panel-implementation-plan.md` (31 tasks across 5 phases, ~5.5 days of focused work).**

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration with two-stage review.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review.

Which approach?
