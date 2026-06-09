// components/TerminalInput.tsx
//
// Inline terminal prompt input. The input is rendered as the final line in
// the scrollback area (prompt + editable command), matching common zsh-like
// terminal interaction instead of a separate form field.

"use client";

import { useEffect, useRef, useState, memo } from "react";

export const TerminalInput = memo(function TerminalInput({
  history,
  onSubmit,
  disabled,
  open = true,
  prompt,
}: {
  history: string[];
  onSubmit: (command: string) => Promise<void> | void;
  disabled: boolean;
  open?: boolean;
  prompt: string;
}) {
  const [value, setValue] = useState("");
  const [historyIdx, setHistoryIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previousFocusState = useRef({ disabled: true, open: false });

  useEffect(() => {
    const previous = previousFocusState.current;
    previousFocusState.current = { disabled, open };
    if (!open || disabled) return;
    if (!previous.open || previous.disabled) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [disabled, open]);

  const submit = async () => {
    const cmd = value.trim();
    if (!cmd) return;
    setValue("");
    setHistoryIdx(-1);
    try {
      await onSubmit(cmd);
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
    <div className="terminal-input-line" onMouseDown={() => inputRef.current?.focus()}>
      <span className="terminal-prompt">{prompt}</span>
      <span className="terminal-input-spacer"> </span>
      <input
        ref={inputRef}
        className="terminal-input-field"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        aria-label="Terminal command"
        placeholder={disabled ? "running…" : ""}
        spellCheck={false}
        autoComplete="off"
      />
    </div>
  );
});
