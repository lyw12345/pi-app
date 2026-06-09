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
