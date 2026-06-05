import { describe, expect, it } from "vitest";
import {
  assistantOutputDisplayText,
  extractAssistantOutputFileRefs,
} from "./assistant-output-files";

describe("assistant output file refs", () => {
  it("extracts absolute paths from inline code", () => {
    expect(extractAssistantOutputFileRefs("Saved `/Users/mk/project/out/report.html`.")).toEqual([
      { path: "/Users/mk/project/out/report.html", label: "report.html" },
    ]);
  });

  it("resolves relative markdown links against cwd", () => {
    expect(extractAssistantOutputFileRefs("Open [report](dist/report.pdf)", "/Users/mk/project")).toEqual([
      { path: "/Users/mk/project/dist/report.pdf", label: "report" },
    ]);
  });

  it("supports explicit file refs and removes them from display text", () => {
    const text = "Done\n<file name=\"/tmp/final.csv\" label=\"Final CSV\"></file>";
    expect(extractAssistantOutputFileRefs(text)).toEqual([
      { path: "/tmp/final.csv", label: "Final CSV" },
    ]);
    expect(assistantOutputDisplayText(text)).toBe("Done");
  });

  it("hides standalone output path lines once they are shown as chips", () => {
    const text = [
      "已修改 A:",
      "",
      "`docs/prototypes/apple-ui/pi-web-apple-ui-skin.html`",
      "",
      "更新内容:",
    ].join("\n");

    expect(assistantOutputDisplayText(text, "/repo")).toBe("已修改 A:\n\n更新内容:");
  });

  it("keeps prose that mentions a file path inline", () => {
    const text = "Saved `/repo/out/report.html` successfully.";
    expect(assistantOutputDisplayText(text)).toBe(text);
  });

  it("ignores remote URLs and non-file inline code", () => {
    expect(extractAssistantOutputFileRefs("See [site](https://example.com) and `npm run test`.", "/repo")).toEqual([]);
  });

  it("deduplicates repeated output files", () => {
    expect(extractAssistantOutputFileRefs("`out/a.txt` and [again](out/a.txt)", "/repo")).toEqual([
      { path: "/repo/out/a.txt", label: "again" },
    ]);
  });
});
