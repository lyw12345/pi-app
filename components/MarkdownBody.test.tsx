import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownBody } from "./MarkdownBody";

describe("MarkdownBody", () => {
  it("renders fenced code content instead of undefined", () => {
    const html = renderToStaticMarkup(
      <MarkdownBody>
        {["```text", "/Users/mk/.pi/agent/prompts/mk-qa.md", "```"].join("\n")}
      </MarkdownBody>,
    );

    expect(html).toContain("/Users/mk/.pi/agent/prompts/mk-qa.md");
    expect(html).not.toContain("undefined");
  });
});
