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
    if (disabled) return;
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
