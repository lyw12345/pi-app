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
