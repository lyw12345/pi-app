// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { TerminalOutput } from "./TerminalOutput";
import type { TerminalLine } from "@/lib/terminal/types";

const prompt = "mk@host proj %";

describe("TerminalOutput", () => {
  it("renders an empty container when no lines are provided", () => {
    const { container } = render(<TerminalOutput lines={[]} prompt={prompt} />);
    expect(container.querySelector(".terminal-output")).toBeTruthy();
    expect(container.querySelectorAll(".line-cmd, .line-out, .line-exit, .line-err, .line-info")).toHaveLength(0);
  });

  it("renders line kinds with terminal-style command prompts and hidden exit rows", () => {
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
    const { container } = render(<TerminalOutput lines={lines} prompt={prompt} />);
    expect(container.querySelector(".line-cmd")?.textContent).toContain("mk@host proj % ls");
    expect(container.querySelector(".line-stdout")).toBeTruthy();
    expect(container.querySelector(".line-stderr")).toBeTruthy();
    expect(container.querySelector(".line-exit")).toBeFalsy();
    expect(container.querySelector(".line-err")).toBeTruthy();
    expect(container.querySelector(".line-info")).toBeTruthy();
  });

  it("shows the jump-to-bottom button when autoScroll is false (after scroll-up)", () => {
    const lines: TerminalLine[] = [
      { kind: "output", text: "hello", ts: 1, stream: "stdout" },
    ];
    const { container } = render(<TerminalOutput lines={lines} prompt={prompt} />);
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
