import { describe, expect, it } from "vitest";
import {
  collectSlashCommands,
  filterSlashCommands,
  getSlashCompletionAtCursor,
  insertSlashCommandAtCursor,
} from "./slash-commands";

describe("slash-commands", () => {
  it("collects extension, prompt, and skill commands", () => {
    const commands = collectSlashCommands({
      extensionRunner: {
        getRegisteredCommands: () => [{ invocationName: "session-name", description: "Rename" }],
      },
      promptTemplates: [{ name: "fix-tests", description: "Fix tests" }],
      resourceLoader: {
        getSkills: () => ({ skills: [{ name: "brave-search", description: "Search" }] }),
      },
    });
    expect(commands.map((c) => c.name)).toEqual(["session-name", "fix-tests", "skill:brave-search"]);
  });

  it("filters commands by prefix", () => {
    const all = [
      { name: "skill:foo", source: "skill" as const },
      { name: "fix", source: "prompt" as const },
    ];
    expect(filterSlashCommands(all, "skill").map((c) => c.name)).toEqual(["skill:foo"]);
  });

  it("detects slash completion at line start and after whitespace", () => {
    expect(getSlashCompletionAtCursor("/fix", 4)).toEqual({ query: "fix", replaceStart: 1 });
    expect(getSlashCompletionAtCursor("hello /sk", 9)).toEqual({ query: "sk", replaceStart: 7 });
    expect(getSlashCompletionAtCursor("no slash", 8)).toBeNull();
  });

  it("inserts a picked command without sending", () => {
    const text = "为什么不直接调用 /gpt";
    const cursor = text.length;
    expect(insertSlashCommandAtCursor(text, cursor, "skill:gpt-image-2")).toEqual({
      text: "为什么不直接调用 /skill:gpt-image-2 ",
      cursor: "为什么不直接调用 /skill:gpt-image-2 ".length,
    });
  });
});
