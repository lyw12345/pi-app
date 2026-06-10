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
  /** Stderr buffer for line- and carriage-return collapsing (e.g. git progress bars). */
  stderrBuf: string;
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
  /** The current working directory for the next command (may differ from key after `cd`). */
  currentCwd: string;
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
  | { type: "state";  running: RunningProcessSummary | null }
  | { type: "prompt"; text: string };

/** Result of `POST /run` for the 409 case. */
export type RunError =
  | { error: "command_in_progress"; running: RunningProcessSummary }
  | { error: "forbidden" }
  | { error: "bad_request"; reason: string };
