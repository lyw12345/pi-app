import { describe, expect, it } from "vitest";
import { displayUserMessageText } from "./user-message-display";

describe("displayUserMessageText", () => {
  it("keeps slash skill invocations", () => {
    expect(displayUserMessageText("/skill:foo-bar")).toBe("/skill:foo-bar");
  });

  it("collapses skill blocks to slash label", () => {
    const block = `<skill name="ai-image" location="/tmp/SKILL.md">
body here
</skill>`;
    expect(displayUserMessageText(block)).toBe("/skill:ai-image");
  });

  it("shows trailing user text after skill block", () => {
    const block = `<skill name="x" location="/p">
doc
</skill>

Please draw a cat`;
    expect(displayUserMessageText(block)).toBe("Please draw a cat");
  });

  it("passes through normal messages", () => {
    expect(displayUserMessageText("hello")).toBe("hello");
  });
});
