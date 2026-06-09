// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import type { ComponentProps } from "react";
import { TerminalInput } from "./TerminalInput";

function getInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector(".terminal-input-field") as HTMLInputElement;
}

function renderInput(props: Partial<ComponentProps<typeof TerminalInput>> = {}) {
  return render(
    <TerminalInput
      history={[]}
      onSubmit={vi.fn().mockResolvedValue(undefined)}
      disabled={false}
      prompt="mk@host proj %"
      {...props}
    />,
  );
}

describe("TerminalInput", () => {
  it("renders prompt inline with the command field", () => {
    const { container } = renderInput();
    expect(container.querySelector(".terminal-input-line")?.textContent).toContain("mk@host proj %");
    expect(getInput(container)).toBeTruthy();
  });

  it("submits on Enter and clears the field", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = renderInput({ onSubmit });
    const input = getInput(container);
    fireEvent.change(input, { target: { value: "ls" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("ls");
    expect(input.value).toBe("");
  });

  it("does not submit on Shift+Enter", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = renderInput({ onSubmit });
    const input = getInput(container);
    fireEvent.change(input, { target: { value: "x" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("ArrowUp from empty field shows the most recent history entry", () => {
    const { container } = renderInput({ history: ["foo", "bar"] });
    const input = getInput(container);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.value).toBe("bar");
  });

  it("ArrowDown from the oldest entry clears the field", () => {
    const { container } = renderInput({ history: ["foo", "bar"] });
    const input = getInput(container);
    fireEvent.keyDown(input, { key: "ArrowUp" }); // -> bar
    fireEvent.keyDown(input, { key: "ArrowUp" }); // -> foo
    fireEvent.keyDown(input, { key: "ArrowDown" }); // -> bar
    fireEvent.keyDown(input, { key: "ArrowDown" }); // -> clear
    expect(input.value).toBe("");
  });

  it("disables input and ignores Enter when disabled", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = renderInput({ onSubmit, disabled: true });
    const input = getInput(container);
    expect(input.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "x" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
