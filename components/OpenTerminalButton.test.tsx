// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { OpenTerminalButton } from "./OpenTerminalButton";

describe("OpenTerminalButton", () => {
  it("is enabled and triggers onClick when cwd is provided", () => {
    const onClick = vi.fn();
    const { container } = render(<OpenTerminalButton hasCwd={true} onClick={onClick} />);
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is disabled with a tooltip when no cwd", () => {
    const onClick = vi.fn();
    const { container } = render(<OpenTerminalButton hasCwd={false} onClick={onClick} />);
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("title")).toMatch(/session/i);
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});
