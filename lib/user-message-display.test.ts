import { describe, expect, it } from "vitest";
import { displayUserMessageText } from "./user-message-display";

describe("displayUserMessageText", () => {
  it("keeps slash skill invocations", () => {
    expect(displayUserMessageText("/skill:foo-bar")).toBe("/skill:foo-bar");
  });

  it("collapses legacy expanded /team prompt to slash label", () => {
    const expanded = `你是 pi-agent 的 \`/team\` 入口。用户只需一条命令。

## 需求：D-2026-002 verify`;
    expect(displayUserMessageText(expanded)).toBe("/team D-2026-002 verify");
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
