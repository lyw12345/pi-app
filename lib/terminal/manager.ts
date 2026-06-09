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
//   - stop(session)  -- added below
//   - killAll()      -- added below

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
import { spawn } from "child_process";

declare global {
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

declare global {
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
