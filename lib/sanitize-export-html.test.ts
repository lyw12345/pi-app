import { describe, expect, it } from "vitest";
import { sanitizeExportHtml } from "./sanitize-export-html";

describe("sanitizeExportHtml", () => {
  it("redacts home paths and api keys", () => {
    const html = `<pre>/Users/alice/.pi/agent/auth.json sk-abcdefghijklmnopqrstuvwxyz</pre>`;
    const sanitized = sanitizeExportHtml(html, "/Users/alice");
    expect(sanitized).not.toContain("/Users/alice");
    expect(sanitized).toContain("~");
    expect(sanitized).toContain("[credentials]");
    expect(sanitized).toContain("[redacted]");
    expect(sanitized).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
  });
});
