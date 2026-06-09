// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { TerminalInput } from "./TerminalInput";

function getInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector(".terminal-input-field") as HTMLInputElement;
}

function getCheckbox(container: HTMLElement): HTMLInputElement {
  return container.querySelector(".keep-running-toggle input") as HTMLInputElement;
}

describe("TerminalInput", () => {
  it("submits on Enter and clears the field", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<TerminalInput history={[]} onSubmit={onSubmit} disabled={false} />);
    const input = getInput(container);
    fireEvent.change(input, { target: { value: "ls" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("ls", false);
    expect(input.value).toBe("");
  });

  it("does not submit on Shift+Enter", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<TerminalInput history={[]} onSubmit={onSubmit} disabled={false} />);
    const input = getInput(container);
    fireEvent.change(input, { target: { value: "x" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("ArrowUp from empty field shows the most recent history entry", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<TerminalInput history={["foo", "bar"]} onSubmit={onSubmit} disabled={false} />);
    const input = getInput(container);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.value).toBe("bar");
  });

  it("ArrowDown from the oldest entry clears the field", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<TerminalInput history={["foo", "bar"]} onSubmit={onSubmit} disabled={false} />);
    const input = getInput(container);
    fireEvent.keyDown(input, { key: "ArrowUp" }); // -> bar
    fireEvent.keyDown(input, { key: "ArrowUp" }); // -> foo
    fireEvent.keyDown(input, { key: "ArrowDown" }); // -> bar
    fireEvent.keyDown(input, { key: "ArrowDown" }); // -> clear
    expect(input.value).toBe("");
  });

  it("toggles keep-running and resets after submit", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<TerminalInput history={[]} onSubmit={onSubmit} disabled={false} />);
    const checkbox = getCheckbox(container);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    const input = getInput(container);
    fireEvent.change(input, { target: { value: "tail -f" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("tail -f", true);
    expect(checkbox.checked).toBe(false);
  });

  it("disables input and ignores Enter when disabled", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<TerminalInput history={[]} onSubmit={onSubmit} disabled={true} />);
    const input = getInput(container);
    expect(input.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "x" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
