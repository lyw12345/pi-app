// components/TerminalPanel.tsx
//
// Bottom-drawer container for the terminal UI. Owns the drag-to-resize
// handle and the status bar. Re-mounts the inner hook (and thus the SSE
// connection) whenever `cwd` changes — the parent (AppShell) is expected
// to set `key={cwd}` for that to work, or to re-mount the panel.

"use client";

import { useState, useRef, useCallback, useEffect } from "react";
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
  const [now, setNow] = useState(() => Date.now());
  const [keepRunning, setKeepRunning] = useState(false);
  const startY = useRef(0);
  const startH = useRef(height);

  useEffect(() => {
    if (!term.running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [term.running]);

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
    ? Math.floor((now - term.running.startedAt) / 1000)
    : null;

  const submitCommand = term.submit;
  const handleSubmit = useCallback((cmd: string) => {
    const shouldKeepRunning = keepRunning;
    setKeepRunning(false);
    void submitCommand(cmd, shouldKeepRunning);
  }, [keepRunning, submitCommand]);

  const handleClose = useCallback(() => {
    // go through onClose which is stable (setter from useState)
    onClose();
  }, [onClose]);

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
        <span className="terminal-status-cwd" title={cwd}>Terminal · {shortenPath(cwd)}</span>
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
        <span className="terminal-status-spacer" />
        <label className="terminal-keep-running-toggle" title="Run command as a long-running process that can be stopped">
          <input
            type="checkbox"
            checked={keepRunning}
            onChange={(e) => setKeepRunning(e.target.checked)}
            disabled={!!term.running && !term.running.isKeepRunning}
          />
          keep
        </label>
        <button className="terminal-status-close" onClick={handleClose} aria-label="Close terminal">
          Close
        </button>
      </div>
      <TerminalOutput lines={term.lines} prompt={term.prompt}>
        <TerminalInput
          history={term.history}
          disabled={!!term.running && !term.running.isKeepRunning}
          open={open}
          prompt={term.prompt}
          onSubmit={handleSubmit}
        />
      </TerminalOutput>
    </div>
  );
}

function shortenPath(p: string): string {
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
