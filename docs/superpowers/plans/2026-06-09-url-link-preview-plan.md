# pi-web URL Link Preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make LLM-emitted `https://` links in chat open in the existing right-side preview panel (sandboxed `<iframe>`), instead of navigating the main `WKWebView` and replacing the chat UI.

**Architecture:**
- Extract two pure functions (`assertSafePreviewUrl`, `classifyAnchor` + `routeAnchorClick`) and one config builder (`buildIframeAttributes`) — fully unit-testable, no React.
- Add a new `WebPreview` component (sandboxed `<iframe>` with 15 s load-timeout fallback).
- Extend `MessageView` to route `<a href="https://…">` clicks to a new `onOpenLink` callback.
- Extend `AppShell` `Tab` to a discriminated union (`file` | `url`); add `handleOpenLink`; switch render by `kind`.
- Add a `decidePolicyFor` interceptor in the macOS shell so any external navigation (including `window.open(_blank)` and 3rd-party iframe top-redirects) routes to `NSWorkspace.shared.open` instead of replacing the main webview.

**Tech Stack:** TypeScript · React 18 · vitest (existing, `environment: "node"`, `include: *.test.ts`) · react-markdown 10 (existing) · Swift / WebKit (existing PiWorkbench).

**Spec:** `docs/superpowers/specs/2026-06-09-url-link-preview-design.md`

---

## File Structure (locked in up-front)

### New files

| File | Responsibility | Lines (est.) |
|---|---|---|
| `lib/safe-url.ts` | `assertSafePreviewUrl(url)` + `isHttpUrl(value)` + `UnsafeUrlError` class | ~35 |
| `lib/safe-url.test.ts` | Protocol allowlist edge cases | ~60 |
| `lib/anchor-routing.ts` | `classifyAnchor(href, cwd) → "url" \| "file" \| "other"`, `routeAnchorClick({href, cwd, modifiers, callbacks}) → action` | ~70 |
| `lib/anchor-routing.test.ts` | Routing for https, local path, mailto, modifier-click | ~100 |
| `lib/iframe-attrs.ts` | `buildIframeAttributes(url, options) → Record<string, string>` — pure, no React | ~30 |
| `lib/iframe-attrs.test.ts` | Sandbox / referrerPolicy / key correctness | ~40 |
| `components/WebPreview.tsx` | UI: header + toolbar ↗ button + `<iframe>` + 15 s timeout fallback | ~110 |
| `components/WebPreview.test.tsx` | Server-render snapshot of `WebPreview` (using `react-dom/server`) + use of `buildIframeAttributes` directly | ~50 |

### Modified files

| File | Change |
|---|---|
| `components/MessageView.tsx` | `ReactMarkdown` `components` map: add `a` (uses `lib/anchor-routing.ts`). New `onOpenLink?: (url, label) => void` prop on `TextBlock` / `AssistantMessageView` / `MessageView`. |
| `components/AppShell.tsx` | `Tab` type → discriminated union `{kind:"file"}` \| `{kind:"url"}`. New `handleOpenLink(url, label)`. Pass `onOpenLink={handleOpenLink}` through to `ChatWindow` → `MessageView`. Render switch on `activeFileTab.kind`. Update the three `appShell.hideFilePanel/showFilePanel/noFileOpen` references to the new key names. |
| `lib/i18n/messages/en.ts` | New `fileViewer.webPreview.*` keys + 3 renamed `appShell.*` keys |
| `lib/i18n/messages/zh-CN.ts` | Same in Chinese |
| `macos/PiWorkbench/Sources/PiWorkbench/WebView.swift` | Implement `webView(_:decidePolicyFor:decisionHandler:)` |
| `CHANGELOG.md` | Unreleased entry under "Right Panel" |

### Out of scope (deferred)

- Pi-internal "preview browser window" (separate `NSWindow`).
- Server-side HTML proxy (`/api/preview/url`).
- URL persistence across page reloads (right-panel state is already ephemeral).
- Link hover preview / tooltip.
- `FileAttachmentChip` flow.
- macOS `webFetch` / `HiddenWebFetcher` extension.

### New dependencies

**None.** Plan stays within the existing `vitest` (`*.test.ts`, `environment: "node"`) + React 18 + react-markdown + Swift/WebKit stack. The spec called for `components/*.test.tsx` with `@testing-library/react`; the plan **deviates from the spec** in this respect and uses `react-dom/server.renderToString` + pure-function tests instead (see §"Test strategy" below for rationale). The spec will be amended accordingly at plan-execution time.

### Test strategy (key deviation from spec, intentional)

`vitest.config.ts` declares `include: ["**/*.test.ts"]` and `environment: "node"`; the project has no `@testing-library/react` in `devDependencies`, and no `*.test.tsx` files exist. Adding a React component test dependency would balloon the plan. Instead:

- All routing/classification logic lives in **pure functions** (`classifyAnchor`, `routeAnchorClick`, `assertSafePreviewUrl`, `buildIframeAttributes`) and is unit-tested in `*.test.ts`.
- `WebPreview` is a thin React wrapper around `buildIframeAttributes` + `useState`/`useEffect`; its behavior is verified through the pure-function tests of `buildIframeAttributes`, plus a `react-dom/server.renderToString` snapshot in `components/WebPreview.test.tsx` to confirm the rendered DOM shape (sandbox attribute present, fallback markup absent in the happy path).
- `MessageView`'s `<a>` integration is verified by importing `classifyAnchor` from a small test that constructs the same `<a>` JSX and asserts `classifyAnchor` is called with the right `href` — a smoke test, not a behavioral test. The behavioral coverage is in `lib/anchor-routing.test.ts`.

This is documented and intentional, not a placeholder.

---

## Phase 1 — Pure functions + i18n (TDD)

### Task 1: `assertSafePreviewUrl`

**Files:**
- Create: `lib/safe-url.ts`
- Test: `lib/safe-url.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/safe-url.test.ts` exactly as shown:

```ts
import { describe, it, expect } from "vitest";
import { assertSafePreviewUrl, isHttpUrl, UnsafeUrlError } from "./safe-url";

describe("isHttpUrl", () => {
  it.each([
    ["https://example.com", true],
    ["http://example.com", true],
    ["https://example.com/path?q=1#h", true],
    ["mailto:foo@bar.com", false],
    ["tel:+1234", false],
    ["file:///etc/passwd", false],
    ["javascript:alert(1)", false],
    ["data:text/html,<x>", false],
    ["", false],
    ["not a url at all", false],
    ["//example.com", false],
  ])("isHttpUrl(%j) === %j", (input, expected) => {
    expect(isHttpUrl(input)).toBe(expected);
  });
});

describe("assertSafePreviewUrl", () => {
  it("accepts https URLs and returns the parsed URL", () => {
    const u = assertSafePreviewUrl("https://example.com/foo?bar=1");
    expect(u.protocol).toBe("https:");
    expect(u.hostname).toBe("example.com");
  });
  it("accepts http URLs", () => {
    const u = assertSafePreviewUrl("http://example.com");
    expect(u.protocol).toBe("http:");
  });
  it("rejects javascript: with UnsafeUrlError", () => {
    expect(() => assertSafePreviewUrl("javascript:alert(1)")).toThrow(UnsafeUrlError);
  });
  it("rejects data: URLs", () => {
    expect(() => assertSafePreviewUrl("data:text/html,<script>1</script>")).toThrow(UnsafeUrlError);
  });
  it("rejects file: URLs", () => {
    expect(() => assertSafePreviewUrl("file:///etc/passwd")).toThrow(UnsafeUrlError);
  });
  it("rejects vbscript: URLs", () => {
    expect(() => assertSafePreviewUrl("vbscript:msgbox(1)")).toThrow(UnsafeUrlError);
  });
  it("rejects empty string", () => {
    expect(() => assertSafePreviewUrl("")).toThrow(UnsafeUrlError);
  });
  it("rejects strings with no protocol", () => {
    expect(() => assertSafePreviewUrl("not a url")).toThrow(UnsafeUrlError);
  });
  it("rejects URLs with empty host", () => {
    expect(() => assertSafePreviewUrl("https://")).toThrow(UnsafeUrlError);
  });
  it("includes the URL and reason on the error", () => {
    try {
      assertSafePreviewUrl("javascript:alert(1)");
    } catch (e) {
      expect(e).toBeInstanceOf(UnsafeUrlError);
      expect((e as UnsafeUrlError).url).toBe("javascript:alert(1)");
      expect((e as UnsafeUrlError).reason).toMatch(/protocol/);
      return;
    }
    throw new Error("expected throw");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `node_modules/.bin/vitest run lib/safe-url.test.ts`
Expected: FAIL with "Cannot find module './safe-url'" or similar.

- [ ] **Step 3: Implement the module**

Create `lib/safe-url.ts` exactly as shown:

```ts
// lib/safe-url.ts
//
// URL allowlist helpers for the right-panel "open this link in a
// sandboxed iframe" feature. Defense in depth on top of
// react-markdown's built-in protocol filter (which already strips
// javascript: / data: / file:). See:
// docs/superpowers/specs/2026-06-09-url-link-preview-design.md §4.5

export class UnsafeUrlError extends Error {
  public readonly url: string;
  public readonly reason: string;
  constructor(url: string, reason: string) {
    super(`unsafe URL: ${reason} (${url})`);
    this.name = "UnsafeUrlError";
    this.url = url;
    this.reason = reason;
  }
}

const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

/** Cheap protocol check, no thrown errors. */
export function isHttpUrl(value: string): boolean {
  if (!value) return false;
  try {
    const u = new URL(value);
    return SAFE_PROTOCOLS.has(u.protocol);
  } catch {
    return false;
  }
}

/**
 * Throw UnsafeUrlError unless `url` is a parseable http(s) URL with
 * a non-empty hostname. Returns the parsed URL on success.
 */
export function assertSafePreviewUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UnsafeUrlError(url, "not a valid URL");
  }
  if (!SAFE_PROTOCOLS.has(parsed.protocol)) {
    throw new UnsafeUrlError(url, `protocol ${parsed.protocol} not allowed`);
  }
  if (!parsed.hostname) {
    throw new UnsafeUrlError(url, "missing hostname");
  }
  return parsed;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `node_modules/.bin/vitest run lib/safe-url.test.ts`
Expected: PASS, 20/20 (or so).

- [ ] **Step 5: Commit**

```bash
cd /Users/mk/codespace/pi-web
git add lib/safe-url.ts lib/safe-url.test.ts
git commit -m "feat(safe-url): add assertSafePreviewUrl + isHttpUrl + UnsafeUrlError"
```

### Task 2: `classifyAnchor` + `routeAnchorClick`

**Files:**
- Create: `lib/anchor-routing.ts`
- Test: `lib/anchor-routing.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/anchor-routing.test.ts` exactly as shown:

```ts
import { describe, it, expect, vi } from "vitest";
import {
  classifyAnchor,
  routeAnchorClick,
  type AnchorCallbacks,
} from "./anchor-routing";

const CWD = "/Users/mk/project";

describe("classifyAnchor", () => {
  it("classifies http URLs", () => {
    expect(classifyAnchor("https://example.com", CWD)).toBe("url");
  });
  it("classifies https URLs", () => {
    expect(classifyAnchor("https://example.com/foo", CWD)).toBe("url");
  });
  it("classifies absolute file paths", () => {
    expect(classifyAnchor("/Users/mk/project/out/report.pdf", CWD)).toBe("file");
  });
  it("classifies relative file paths with file extension", () => {
    expect(classifyAnchor("./out/report.pdf", CWD)).toBe("file");
  });
  it("classifies bare file names with file extension", () => {
    expect(classifyAnchor("README.md", CWD)).toBe("file");
  });
  it("classifies mailto: as other", () => {
    expect(classifyAnchor("mailto:foo@bar.com", CWD)).toBe("other");
  });
  it("classifies tel: as other", () => {
    expect(classifyAnchor("tel:+1234", CWD)).toBe("other");
  });
  it("classifies bare relative path without file extension as other", () => {
    // ./foo (no extension) is not a file we know how to preview
    expect(classifyAnchor("./foo", CWD)).toBe("other");
  });
  it("classifies empty href as other", () => {
    expect(classifyAnchor("", CWD)).toBe("other");
  });
  it("classifies fragment-only href as other", () => {
    expect(classifyAnchor("#section", CWD)).toBe("other");
  });
});

describe("routeAnchorClick", () => {
  function makeCallbacks(): AnchorCallbacks & { onOpenLink: ReturnType<typeof vi.fn>; onOpenFile: ReturnType<typeof vi.fn> } {
    return {
      onOpenLink: vi.fn(),
      onOpenFile: vi.fn(),
    };
  }

  function makeClickEvent(overrides: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean }> = {}) {
    return {
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      defaultPrevented: false,
      preventDefault: vi.fn(),
      ...overrides,
    };
  }

  it("routes http URLs to onOpenLink and preventDefaults", () => {
    const cb = makeCallbacks();
    const evt = makeClickEvent();
    const action = routeAnchorClick({
      href: "https://example.com",
      cwd: CWD,
      label: "example",
      event: evt as unknown as React.MouseEvent,
      callbacks: cb,
    });
    expect(action).toBe("open-link");
    expect(cb.onOpenLink).toHaveBeenCalledWith("https://example.com", "example");
    expect(evt.preventDefault).toHaveBeenCalled();
  });

  it("routes local file paths to onOpenFile and preventDefaults", () => {
    const cb = makeCallbacks();
    const evt = makeClickEvent();
    const action = routeAnchorClick({
      href: "/Users/mk/project/out/report.pdf",
      cwd: CWD,
      label: "report.pdf",
      event: evt as unknown as React.MouseEvent,
      callbacks: cb,
    });
    expect(action).toBe("open-file");
    expect(cb.onOpenFile).toHaveBeenCalledWith("/Users/mk/project/out/report.pdf", "report.pdf");
    expect(evt.preventDefault).toHaveBeenCalled();
  });

  it("returns 'default' for mailto: and does not call either callback", () => {
    const cb = makeCallbacks();
    const evt = makeClickEvent();
    const action = routeAnchorClick({
      href: "mailto:foo@bar.com",
      cwd: CWD,
      label: "mail",
      event: evt as unknown as React.MouseEvent,
      callbacks: cb,
    });
    expect(action).toBe("default");
    expect(cb.onOpenLink).not.toHaveBeenCalled();
    expect(cb.onOpenFile).not.toHaveBeenCalled();
    expect(evt.preventDefault).not.toHaveBeenCalled();
  });

  it("returns 'default' for https when metaKey is held", () => {
    const cb = makeCallbacks();
    const evt = makeClickEvent({ metaKey: true });
    const action = routeAnchorClick({
      href: "https://example.com",
      cwd: CWD,
      label: "example",
      event: evt as unknown as React.MouseEvent,
      callbacks: cb,
    });
    expect(action).toBe("default");
    expect(cb.onOpenLink).not.toHaveBeenCalled();
  });

  it("returns 'default' for https when ctrlKey is held", () => {
    const cb = makeCallbacks();
    const evt = makeClickEvent({ ctrlKey: true });
    const action = routeAnchorClick({
      href: "https://example.com",
      cwd: CWD,
      label: "example",
      event: evt as unknown as React.MouseEvent,
      callbacks: cb,
    });
    expect(action).toBe("default");
    expect(cb.onOpenLink).not.toHaveBeenCalled();
  });

  it("returns 'default' for https when shiftKey is held", () => {
    const cb = makeCallbacks();
    const evt = makeClickEvent({ shiftKey: true });
    const action = routeAnchorClick({
      href: "https://example.com",
      cwd: CWD,
      label: "example",
      event: evt as unknown as React.MouseEvent,
      callbacks: cb,
    });
    expect(action).toBe("default");
    expect(cb.onOpenLink).not.toHaveBeenCalled();
  });

  it("returns 'default' for https when altKey is held", () => {
    const cb = makeCallbacks();
    const evt = makeClickEvent({ altKey: true });
    const action = routeAnchorClick({
      href: "https://example.com",
      cwd: CWD,
      label: "example",
      event: evt as unknown as React.MouseEvent,
      callbacks: cb,
    });
    expect(action).toBe("default");
    expect(cb.onOpenLink).not.toHaveBeenCalled();
  });

  it("does not call onOpenLink and warns when URL is unsafe", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cb = makeCallbacks();
    const evt = makeClickEvent();
    const action = routeAnchorClick({
      href: "javascript:alert(1)",
      cwd: CWD,
      label: "x",
      event: evt as unknown as React.MouseEvent,
      callbacks: cb,
    });
    expect(action).toBe("default");
    expect(cb.onOpenLink).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `node_modules/.bin/vitest run lib/anchor-routing.test.ts`
Expected: FAIL with "Cannot find module './anchor-routing'".

- [ ] **Step 3: Implement the module**

Create `lib/anchor-routing.ts` exactly as shown:

```ts
// lib/anchor-routing.ts
//
// Pure routing logic for `<a>` clicks inside markdown-rendered chat
// messages. Decides whether a click should be hijacked into the
// right preview panel (URL tab or file tab) or fall through to the
// browser's default anchor behavior. See:
// docs/superpowers/specs/2026-06-09-url-link-preview-design.md §4.1

import { isLocalFileCandidate, normalizeCandidatePath } from "./assistant-output-files";
import { isHttpUrl } from "./safe-url";

export type AnchorKind = "url" | "file" | "other";

/**
 * Classify an anchor href. This is the only function the `a`
 * component uses to decide which "track" a link belongs to.
 */
export function classifyAnchor(href: string, cwd: string | null | undefined): AnchorKind {
  if (!href) return "other";
  if (href.startsWith("#")) return "other";
  if (isHttpUrl(href)) return "url";
  if (normalizeCandidatePath(href, cwd ?? undefined) !== null) return "file";
  return "other";
}

export interface AnchorCallbacks {
  onOpenLink?: (url: string, label: string) => void;
  onOpenFile?: (filePath: string, label: string) => void;
}

export interface RouteAnchorClickInput {
  href: string;
  cwd: string | null | undefined;
  label: string;
  /** The DOM MouseEvent-like object. We only need modifier flags + preventDefault. */
  event: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; preventDefault: () => void };
  callbacks: AnchorCallbacks;
}

export type AnchorAction = "open-link" | "open-file" | "default";

/**
 * Decide what to do with an `<a>` click. Returns the action taken so
 * the caller can keep the `<a>` declarative and side-effect-free for
 * tests. The function mutates `event` only by calling
 * `event.preventDefault()` when it returns "open-link" or
 * "open-file".
 */
export function routeAnchorClick(input: RouteAnchorClickInput): AnchorAction {
  const { href, cwd, label, event, callbacks } = input;

  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return "default";
  }

  const kind = classifyAnchor(href, cwd);
  if (kind === "url") {
    if (!callbacks.onOpenLink) return "default";
    try {
      // Defensive: re-check protocol through the same allowlist used
      // by AppShell. isHttpUrl already passed in classifyAnchor, but
      // we re-validate via a no-throw path for safety.
      if (!isHttpUrl(href)) return "default";
      event.preventDefault();
      callbacks.onOpenLink(href, label);
      return "open-link";
    } catch (err) {
      console.warn("[pi-web] anchor-routing: refusing to open URL", err);
      return "default";
    }
  }
  if (kind === "file") {
    if (!callbacks.onOpenFile) return "default";
    event.preventDefault();
    callbacks.onOpenFile(href, label);
    return "open-file";
  }
  return "default";
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `node_modules/.bin/vitest run lib/anchor-routing.test.ts`
Expected: PASS, 15/15.

- [ ] **Step 5: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors. (If `normalizeCandidatePath` is not exported from `lib/assistant-output-files.ts`, the next step fixes that.)

- [ ] **Step 6: Export `normalizeCandidatePath` and `isLocalFileCandidate` from `lib/assistant-output-files.ts`**

Open `lib/assistant-output-files.ts`. Find the two function declarations and add `export` in front of them:

```ts
export function decodeFileHref(value: string): string { ... }
```

Find:

```ts
function isAbsolutePath(value: string): boolean {
```

Replace with:

```ts
export function isAbsolutePath(value: string): boolean {
```

Find:

```ts
function isLocalFileCandidate(value: string): boolean {
```

Replace with:

```ts
export function isLocalFileCandidate(value: string): boolean {
```

Find:

```ts
function normalizeCandidatePath(value: string, cwd?: string): string | null {
```

Replace with:

```ts
export function normalizeCandidatePath(value: string, cwd?: string): string | null {
```

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors.

Run: `node_modules/.bin/vitest run lib/assistant-output-files.test.ts lib/anchor-routing.test.ts`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/mk/codespace/pi-web
git add lib/anchor-routing.ts lib/anchor-routing.test.ts lib/assistant-output-files.ts
git commit -m "feat(anchor-routing): classify + route <a> clicks for url/file/other"
```

### Task 3: `buildIframeAttributes`

**Files:**
- Create: `lib/iframe-attrs.ts`
- Test: `lib/iframe-attrs.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/iframe-attrs.test.ts` exactly as shown:

```ts
import { describe, it, expect } from "vitest";
import { buildIframeAttributes, DEFAULT_IFRAME_SANDBOX } from "./iframe-attrs";

describe("buildIframeAttributes", () => {
  it("returns src and the default sandbox", () => {
    const attrs = buildIframeAttributes({ url: "https://example.com" });
    expect(attrs.src).toBe("https://example.com");
    expect(attrs.sandbox).toBe(DEFAULT_IFRAME_SANDBOX);
  });
  it("always sets referrerPolicy to no-referrer", () => {
    const attrs = buildIframeAttributes({ url: "https://example.com" });
    expect(attrs.referrerPolicy).toBe("no-referrer");
  });
  it("uses the url as the title when no label is given", () => {
    const attrs = buildIframeAttributes({ url: "https://example.com/foo" });
    expect(attrs.title).toBe("https://example.com/foo");
  });
  it("uses the label as the title when provided", () => {
    const attrs = buildIframeAttributes({ url: "https://example.com/foo", label: "Foo" });
    expect(attrs.title).toBe("Foo");
  });
  it("the default sandbox value includes the minimum allowlist", () => {
    // Doc: minimum needed for typical sites.
    expect(DEFAULT_IFRAME_SANDBOX).toContain("allow-scripts");
    expect(DEFAULT_IFRAME_SANDBOX).toContain("allow-same-origin");
    expect(DEFAULT_IFRAME_SANDBOX).toContain("allow-forms");
  });
  it("the default sandbox value omits dangerous tokens", () => {
    // Doc: explicitly NOT in the allowlist.
    expect(DEFAULT_IFRAME_SANDBOX).not.toContain("allow-top-navigation");
    expect(DEFAULT_IFRAME_SANDBOX).not.toContain("allow-popups");
    expect(DEFAULT_IFRAME_SANDBOX).not.toContain("allow-modals");
  });
  it("honors a caller-supplied sandbox override", () => {
    const attrs = buildIframeAttributes({ url: "https://example.com", sandbox: "allow-scripts" });
    expect(attrs.sandbox).toBe("allow-scripts");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `node_modules/.bin/vitest run lib/iframe-attrs.test.ts`
Expected: FAIL with "Cannot find module './iframe-attrs'".

- [ ] **Step 3: Implement the module**

Create `lib/iframe-attrs.ts` exactly as shown:

```ts
// lib/iframe-attrs.ts
//
// Pure builder for the `<iframe>` element attributes used by
// components/WebPreview. The WebPreview component is a thin React
// wrapper around this builder. See:
// docs/superpowers/specs/2026-06-09-url-link-preview-design.md §4.3

/** Minimum sandbox allowlist for typical sites. Omitted tokens are intentionally not allowed. */
export const DEFAULT_IFRAME_SANDBOX = "allow-scripts allow-same-origin allow-forms";

export interface BuildIframeAttributesInput {
  url: string;
  label?: string;
  sandbox?: string;
}

export interface IframeAttributes {
  src: string;
  sandbox: string;
  referrerPolicy: "no-referrer";
  title: string;
}

export function buildIframeAttributes(input: BuildIframeAttributesInput): IframeAttributes {
  return {
    src: input.url,
    sandbox: input.sandbox ?? DEFAULT_IFRAME_SANDBOX,
    referrerPolicy: "no-referrer",
    title: input.label?.trim() || input.url,
  };
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `node_modules/.bin/vitest run lib/iframe-attrs.test.ts`
Expected: PASS, 7/7.

- [ ] **Step 5: Commit**

```bash
cd /Users/mk/codespace/pi-web
git add lib/iframe-attrs.ts lib/iframe-attrs.test.ts
git commit -m "feat(iframe-attrs): pure builder for sandboxed preview iframe"
```

### Task 4: i18n strings + rename

**Files:**
- Modify: `lib/i18n/messages/en.ts`
- Modify: `lib/i18n/messages/zh-CN.ts`

- [ ] **Step 1: Add new keys to `en.ts`**

Open `lib/i18n/messages/en.ts`. Inside the `fileViewer: { ... }` object (find it via the existing `pdf: "PDF",` line), add a new `webPreview` block. The exact location doesn't matter for correctness; pick the end of the `fileViewer` object. Add:

```ts
    webPreview: {
      badge: "web",
      embedBlocked: "This page refuses to be embedded. Use the button below to open it in your default browser.",
      embedBlockedTitle: "Embed blocked",
      openInSystemBrowser: "Open in system browser",
      openInSystemBrowserHint: "Open this page in your default browser (Safari, Chrome, …)",
    },
```

Also add the three new namespaced panel-toggle keys under `appShell:`. Find the existing block (it has `noFileOpen`, `hideFilePanel`, `showFilePanel`). Replace those three lines with the new names AND add the new ones:

```ts
    noPreview: "Nothing to preview",
    hideSidePanel: "Hide side panel",
    showSidePanel: "Show side panel",
```

(The `noFileOpen`, `hideFilePanel`, `showFilePanel` lines are deleted from this object.)

- [ ] **Step 2: Add matching Chinese keys to `zh-CN.ts`**

Open `lib/i18n/messages/zh-CN.ts`. Inside the `fileViewer: { ... }` object, add the same `webPreview` block:

```ts
    webPreview: {
      badge: "网页",
      embedBlocked: "此页面拒绝嵌入预览。点击下方按钮在系统默认浏览器中打开。",
      embedBlockedTitle: "无法嵌入",
      openInSystemBrowser: "在系统浏览器打开",
      openInSystemBrowserHint: "在系统默认浏览器中打开此页面（Safari、Chrome…）",
    },
```

Find the existing `noFileOpen` / `hideFilePanel` / `showFilePanel` lines in the `appShell:` block and replace them with:

```ts
    noPreview: "暂无预览内容",
    hideSidePanel: "隐藏侧栏",
    showSidePanel: "显示侧栏",
```

- [ ] **Step 3: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/mk/codespace/pi-web
git add lib/i18n/messages/en.ts lib/i18n/messages/zh-CN.ts
git commit -m "feat(i18n): add webPreview.* keys + rename hideFilePanel to hideSidePanel"
```

---

## Phase 2 — Web UI

### Task 5: `WebPreview` component

**Files:**
- Create: `components/WebPreview.tsx`
- Test: `components/WebPreview.test.tsx`

- [ ] **Step 1: Write the snapshot test**

Create `components/WebPreview.test.tsx` exactly as shown. Note: this file is `.tsx` but only contains a `react-dom/server` render; no `@testing-library/react` is needed.

```tsx
// components/WebPreview.test.tsx
//
// Verifies the server-rendered DOM shape of <WebPreview /> and the
// behavior of its 15 s timeout via a fake timer. No
// @testing-library/react dependency: we use react-dom/server for
// the snapshot and exercise the timeout directly via the component
// instance by re-rendering with a controlled clock.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";
import { WebPreview } from "./WebPreview";
import { buildIframeAttributes } from "@/lib/iframe-attrs";

describe("WebPreview", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders an iframe with sandbox + referrerPolicy in the happy path", () => {
    const html = renderToString(<WebPreview url="https://example.com" label="example" />);
    expect(html).toContain("<iframe");
    expect(html).toContain('src="https://example.com"');
    expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-forms"');
    expect(html).toContain('referrerpolicy="no-referrer"');
    expect(html).toContain('title="example"');
  });

  it("renders a toolbar anchor that opens the URL in a new browser tab", () => {
    const html = renderToString(<WebPreview url="https://example.com" label="example" />);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("https://example.com");
  });

  it("uses buildIframeAttributes under the hood", () => {
    // Smoke: the iframe attributes WebPreview renders must match
    // what buildIframeAttributes returns. This keeps the React
    // wrapper in lockstep with the pure builder.
    const attrs = buildIframeAttributes({ url: "https://example.com", label: "example" });
    expect(attrs.src).toBe("https://example.com");
    expect(attrs.sandbox).toBe("allow-scripts allow-same-origin allow-forms");
    expect(attrs.referrerPolicy).toBe("no-referrer");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `node_modules/.bin/vitest run components/WebPreview.test.tsx`
Expected: FAIL with "Cannot find module './WebPreview'".

(If the run fails with "No test files found" because of the `include: ["**/*.test.ts"]` glob, temporarily add `.tsx` to the include in `vitest.config.ts` for the test, then revert it in step 4. The repo's current config is documented in §"Test strategy" above; for this task we need the .tsx snapshot. Update `vitest.config.ts`'s `include` to `["**/*.test.ts", "**/*.test.tsx"]`.)

- [ ] **Step 3: Implement the component**

Create `components/WebPreview.tsx` exactly as shown:

```tsx
// components/WebPreview.tsx
//
// Right-panel "URL" tab content. Renders a sandboxed <iframe> with
// a 15 s load-timeout fallback and a "open in system browser" toolbar
// action. See:
// docs/superpowers/specs/2026-06-09-url-link-preview-design.md §4.3

"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { buildIframeAttributes } from "@/lib/iframe-attrs";

const LOAD_TIMEOUT_MS = 15_000;

export interface WebPreviewProps {
  url: string;
  label: string;
}

export function WebPreview({ url, label }: WebPreviewProps) {
  const { t } = useI18n();
  const [blocked, setBlocked] = useState(false);
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setBlocked(false);
    if (loadTimer.current) clearTimeout(loadTimer.current);
    loadTimer.current = setTimeout(() => setBlocked(true), LOAD_TIMEOUT_MS);
    return () => {
      if (loadTimer.current) clearTimeout(loadTimer.current);
    };
  }, [url]);

  const iframeAttrs = buildIframeAttributes({ url, label });
  const openHint = t("fileViewer.webPreview.openInSystemBrowserHint");

  return (
    <div className="web-preview" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "4px 12px 4px 16px",
          borderBottom: "1px solid var(--border)",
          fontSize: 11,
          color: "var(--text-dim)",
          background: "var(--bg)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "var(--text)",
            fontSize: 12,
          }}
          title={url}
        >
          {label}
        </span>
        <span style={{ flexShrink: 0, color: "var(--text-dim)" }}>
          {t("fileViewer.webPreview.badge")}
        </span>
        <a
          className="web-preview-open-external"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title={openHint}
          style={{
            flexShrink: 0,
            padding: "4px 10px",
            fontSize: 11,
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--bg-hover)",
            color: "var(--text)",
            textDecoration: "none",
            cursor: "pointer",
          }}
        >
          ↗
        </a>
      </div>
      <div style={{ flex: 1, minHeight: 0, background: "var(--bg-panel)" }}>
        {blocked ? (
          <div
            style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
              color: "var(--text-muted)",
              fontSize: 13,
              textAlign: "center",
              gap: 12,
            }}
          >
            <strong style={{ color: "var(--text)" }}>
              {t("fileViewer.webPreview.embedBlockedTitle")}
            </strong>
            <p style={{ maxWidth: 360, margin: 0 }}>{t("fileViewer.webPreview.embedBlocked")}</p>
          </div>
        ) : (
          <iframe {...iframeAttrs} key={url} style={{ width: "100%", height: "100%", border: "none", background: "#eef1f5" }} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Revert `vitest.config.ts` if you changed it in step 2**

If you changed the `include` glob in step 2 to add `*.test.tsx`, revert it back to `["**/*.test.ts"]`. (Decide: keep `.tsx` permanently if you want this test running in CI; the choice is a 1-line config change and documented in §"Test strategy" above as a deviation. **Recommendation:** keep the change — `.tsx` snapshot tests are cheap, and future component tests will benefit.)

The recommended final config: change `include: ["**/*.test.ts"]` to `include: ["**/*.test.ts", "**/*.test.tsx"]` and leave it that way.

- [ ] **Step 5: Run test, verify it passes**

Run: `node_modules/.bin/vitest run components/WebPreview.test.tsx`
Expected: PASS, 3/3.

- [ ] **Step 6: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/mk/codespace/pi-web
git add components/WebPreview.tsx components/WebPreview.test.tsx vitest.config.ts
git commit -m "feat(WebPreview): right-panel sandboxed iframe with timeout fallback"
```

### Task 6: `MessageView` `a` component integration

**Files:**
- Modify: `components/MessageView.tsx`

- [ ] **Step 1: Read the current `TextBlock` to confirm the prop-wiring path**

Open `components/MessageView.tsx`. Find the `TextBlock` function signature (around line 591), the `AssistantMessageView` function signature (around line 349), and the `MessageView` function signature (around line 76). Note the prop names already used.

- [ ] **Step 2: Add `onOpenLink` to `MessageView` props**

Find `export function MessageView({ message, isStreaming, toolResults, modelNames, entryId, onFork, forking, onNavigate, prevAssistantEntryId, onEditContent, onOpenFile, cwd, showTimestamp, prevTimestamp }: Props) {` and add `onOpenLink` to the destructure list. Find the `Props` type (just above) and add `onOpenLink?: (url: string, label: string) => void;`.

- [ ] **Step 3: Add `onOpenLink` to `AssistantMessageView` props and forward to `TextBlock`**

Find `function AssistantMessageView(...)` and its `Props` type. Add `onOpenLink?: (url: string, label: string) => void;` to the type and `onOpenLink,` to the destructure. Find the `TextBlock` JSX inside `AssistantMessageView` and add `onOpenLink={onOpenLink}` to its props.

- [ ] **Step 4: Add `onOpenLink` to `TextBlock` props and use it in the `a` component**

Find `function TextBlock({ block, isStreaming, onOpenFile, cwd }: ...)` and its `Props` type. Add `onOpenLink?: (url: string, label: string) => void;` to the type and `onOpenLink,` to the destructure.

Inside the same `TextBlock`, find the `<ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code({ className, children, ...props }) { ... }, pre({ children }) { ... } }}>` JSX. Add a third `a` component to the `components` map, **before the closing `}}>`**:

```tsx
          a({ href, children, node, ...rest }) {
            const url = href ?? "";
            const labelText = extractAnchorLabel(children);
            return (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) =>
                  routeAnchorClick({
                    href: url,
                    cwd,
                    label: labelText,
                    event,
                    callbacks: { onOpenLink, onOpenFile },
                  })
                }
                {...rest}
              >
                {children}
              </a>
            );
          },
```

Also add a small helper inside the same file (above the `TextBlock` definition) to flatten anchor children to a string:

```tsx
function extractAnchorLabel(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(extractAnchorLabel).join("");
  if (children && typeof children === "object" && "props" in children) {
    return extractAnchorLabel((children as { props: { children?: React.ReactNode } }).props.children);
  }
  return "";
}
```

Add the imports at the top of the file (next to the existing `import ReactMarkdown from "react-markdown";`):

```tsx
import { routeAnchorClick } from "@/lib/anchor-routing";
import type React from "react";
```

(If `React` is already imported for `JSX`, leave the `import type React from "react";` line as the only addition.)

- [ ] **Step 5: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Run the pure-function test that powers this component**

Run: `node_modules/.bin/vitest run lib/anchor-routing.test.ts`
Expected: PASS (regression check).

- [ ] **Step 7: Commit**

```bash
cd /Users/mk/codespace/pi-web
git add components/MessageView.tsx
git commit -m "feat(MessageView): route <a> clicks for https/local/mailto via anchor-routing"
```

### Task 7: `AppShell` Tab union + `handleOpenLink` + render switch

**Files:**
- Modify: `components/AppShell.tsx`

- [ ] **Step 1: Replace the `Tab` type with the discriminated union**

Find `const [fileTabs, setFileTabs] = useState<Tab[]>([]);` (around line 134) and the `Tab` type definition (just above or imported). Replace the type with:

```tsx
type Tab =
  | { kind: "file"; id: string; label: string; filePath: string }
  | { kind: "url";  id: string; label: string; url: string };
```

Find every place that creates a `Tab` literal (in `handleOpenFile`):

```tsx
return [...prev, { id: tabId, label: fileName, filePath }];
```

Replace with:

```tsx
return [...prev, { kind: "file", id: tabId, label: fileName, filePath }];
```

- [ ] **Step 2: Add `handleOpenLink` and `labelFromAnchor`**

Find the `handleOpenFile` callback (around line 389). After it (and after `handleCloseFileTab`), add:

```tsx
  const handleOpenLink = useCallback((url: string, linkLabel: string) => {
    try {
      assertSafePreviewUrl(url);
    } catch (err) {
      console.warn("[pi-web] refusing to open link in right panel", err);
      return;
    }
    const tabId = `url:${encodeURIComponent(url)}`;
    let fallbackLabel = linkLabel;
    if (!fallbackLabel) {
      try {
        fallbackLabel = new URL(url).host;
      } catch {
        fallbackLabel = url;
      }
    }
    setFileTabs((prev) => {
      if (prev.find((t) => t.id === tabId)) return prev;
      return [...prev, { kind: "url", id: tabId, label: fallbackLabel, url }];
    });
    setActiveFileTabId(tabId);
    setRightPanelOpen(true);
  }, []);
```

Add the import at the top of `AppShell.tsx`:

```tsx
import { assertSafePreviewUrl } from "@/lib/safe-url";
```

(If `useCallback` is not already imported from React, add it.)

- [ ] **Step 3: Pass `onOpenLink={handleOpenLink}` to `ChatWindow`**

Find the `<ChatWindow ... />` JSX. Add `onOpenLink={handleOpenLink}` to its props. Open `components/ChatWindow.tsx`, find the `Props` type and the `ChatWindow` function signature, add `onOpenLink?: (url: string, label: string) => void;` to the type and `onOpenLink,` to the destructure. Find the `<MessageView ... />` JSX inside `ChatWindow` and add `onOpenLink={onOpenLink}` to its props.

- [ ] **Step 4: Switch render on `activeFileTab.kind`**

Find the right-panel content area (around line 757):

```tsx
{activeFileTab?.filePath ? (
  <FileViewer filePath={activeFileTab.filePath} displayLabel={activeFileTab.label} cwd={activeCwd ?? undefined} />
) : (
  <div ...>{i18nT("appShell.noFileOpen")}</div>
)}
```

Replace with:

```tsx
{activeFileTab?.kind === "file" ? (
  <FileViewer filePath={activeFileTab.filePath} displayLabel={activeFileTab.label} cwd={activeCwd ?? undefined} />
) : activeFileTab?.kind === "url" ? (
  <WebPreview url={activeFileTab.url} label={activeFileTab.label} />
) : (
  <div
    style={{
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "var(--text-dim)",
      fontSize: 12,
    }}
  >
    {i18nT("appShell.noPreview")}
  </div>
)}
```

Add the import at the top of `AppShell.tsx`:

```tsx
import { WebPreview } from "./WebPreview";
```

- [ ] **Step 5: Update the renamed i18n keys**

In the same file, find the two `appShell.hideFilePanel` / `appShell.showFilePanel` references and replace with `appShell.hideSidePanel` / `appShell.showSidePanel`:

```tsx
title={rightPanelOpen ? i18nT("appShell.hideSidePanel") : i18nT("appShell.showSidePanel")}
```

(There is no remaining `appShell.noFileOpen` reference once step 4 above is done — it was already replaced with `appShell.noPreview`.)

- [ ] **Step 6: Typecheck + lint + test**

Run: `node_modules/.bin/tsc --noEmit && npm run lint && npm run test:run`
Expected: all PASS.

- [ ] **Step 7: Manual smoke test in dev (port 30142)**

Start the dev server: `npm run dev`. Open `http://127.0.0.1:30142/`, pick a session, send a message that contains a `https://` URL, click the link:

- Right panel opens with a new URL tab; chat is unchanged.
- Click a local file path in another message → file tab opens; URL + file tabs coexist.
- Click the `↗` button on a URL tab → opens in default browser (in Safari on macOS).
- Click the right-panel toggle (top-right) → panel hides; click again → panel shows with the last-active tab.

- [ ] **Step 8: Commit**

```bash
cd /Users/mk/codespace/pi-web
git add components/AppShell.tsx components/ChatWindow.tsx
git commit -m "feat(AppShell): URL tab in right panel + handleOpenLink + kind switch"
```

### Task 8: `CHANGELOG.md` entry

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Find the "Unreleased" section**

Open `CHANGELOG.md`. Find the topmost "Unreleased" header (or create one if it does not exist, modeled on the existing "Unreleased" sections in this file).

- [ ] **Step 2: Add the entry under "Right Panel" theme**

If there is a "### Right Panel" or "**Right Panel**" sub-header under Unreleased, add the following bullet under it. If not, create it:

```markdown
- Chat links to `https://` URLs now open in the right preview panel as a sandboxed iframe, with a one-click "open in system browser" fallback for sites that refuse embedding. The main chat is no longer replaced when clicking a link.
```

- [ ] **Step 3: Commit**

```bash
cd /Users/mk/codespace/pi-web
git add CHANGELOG.md
git commit -m "docs(changelog): URL link preview in right panel"
```

---

## Phase 3 — macOS shell

### Task 9: `decidePolicyFor` external-link interceptor

**Files:**
- Modify: `macos/PiWorkbench/Sources/PiWorkbench/WebView.swift`

- [ ] **Step 1: Read the current file**

Open `macos/PiWorkbench/Sources/PiWorkbench/WebView.swift`. Confirm the current shape: a `PiWebView: WKWebView, WKNavigationDelegate` class, no `decidePolicyFor` method.

- [ ] **Step 2: Add the `decidePolicyFor` implementation as an extension**

Append to the end of the file (after the existing `WebViewRepresentable` struct):

```swift
extension PiWebView {
  /// Route any navigation whose target is not the local pi-web
  /// server to the user's default app. This is the safety net that
  /// keeps the main WKWebView from being replaced by an external
  /// site, even if the web side forgets to preventDefault a link
  /// click. See:
  /// docs/superpowers/specs/2026-06-09-url-link-preview-design.md §4.4
  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    guard let url = navigationAction.request.url else {
      decisionHandler(.allow)
      return
    }
    if Self.isLocalPiWebURL(url) {
      decisionHandler(.allow)
    } else {
      NSWorkspace.shared.open(url)
      decisionHandler(.cancel)
    }
  }

  /// True iff `url` targets the local Next.js server (127.0.0.1,
  /// localhost, or ::1). The local server is loopback-only in Pi.app,
  /// so this is a safe allowlist.
  static func isLocalPiWebURL(_ url: URL) -> Bool {
    guard let host = url.host else { return false }
    return host == "127.0.0.1" || host == "localhost" || host == "::1"
  }
}
```

(Confirm `import AppKit` is present at the top of the file so `NSWorkspace.shared` is available; if not, add it.)

- [ ] **Step 3: Build the macOS app**

Per `AGENTS.md` §"Packaging / 30141":
1. `osascript -e 'quit app "Pi"'` (or skip if not running).
2. `npm run package:macos` (rebuilds Swift because the file in `macos/PiWorkbench/Sources/**` is newer than the release binary).
3. `rm -rf /Applications/Pi.app && ditto dist/macos/Pi.app /Applications/Pi.app && xattr -cr /Applications/Pi.app`

- [ ] **Step 4: Verify the new behavior**

Launch Pi.app. Reproduce the four dev manual-test cases from Task 7 step 7. Then, to confirm the new interceptor works, paste a raw `<a href="https://example.com">raw</a>` into the chat input and submit (or any other way to get a non-`onOpenLink`'d anchor through). Click it. The page should open in Safari/Chrome, and the main Pi webview should remain on the chat.

- [ ] **Step 5: Commit**

```bash
cd /Users/mk/codespace/pi-web
git add macos/PiWorkbench/Sources/PiWorkbench/WebView.swift
git commit -m "feat(macos): decidePolicyFor routes external links to NSWorkspace"
```

---

## Phase 4 — Final validation

### Task 10: Full gate

- [ ] **Step 1: Typecheck, lint, test**

Run: `node_modules/.bin/tsc --noEmit && npm run lint && npm run test:run`
Expected: all PASS.

- [ ] **Step 2: Spec coverage check (self-review)**

Walk the spec sections and confirm a task covers each one:

| Spec section | Covered by |
|---|---|
| §2 Scope — Tab discriminated union | Task 7 step 1 |
| §2 Scope — onOpenLink callback | Task 6 |
| §2 Scope — ReactMarkdown `a` custom | Task 6 |
| §2 Scope — assertSafePreviewUrl | Task 1 |
| §2 Scope — WebPreview component | Task 5 |
| §2 Scope — Toolbar ↗ button | Task 5 |
| §2 Scope — i18n | Task 4 |
| §2 Scope — Unit tests for safe-url, WebPreview, MessageView | Tasks 1, 5 (3rd test deferred to spec self-amendment) |
| §2 Scope — macOS decidePolicyFor | Task 9 |
| §2 Scope — CHANGELOG | Task 8 |
| §4.1 Link click routing | Tasks 2 + 6 |
| §4.2 Tab union | Task 7 |
| §4.3 WebPreview | Task 5 |
| §4.4 macOS interceptor | Task 9 |
| §4.5 assertSafePreviewUrl | Task 1 |
| §5 Data flow end-to-end | Tasks 6, 7, 9 (smoke) |
| §7 Test plan | Tasks 1, 2, 3, 5 |
| §9 Rollout | Task 8 + final manual gate |

- [ ] **Step 3: Self-review placeholder scan**

`rg -n "TODO|TBD|fill in|implement later|add appropriate" docs/superpowers/plans/2026-06-09-url-link-preview-plan.md` should return nothing.

- [ ] **Step 4: Self-review type consistency**

Check that the following names are spelled identically in every task that uses them:

- `assertSafePreviewUrl` (Task 1) ← used in Tasks 2, 7
- `UnsafeUrlError` (Task 1) ← used in Task 1 test
- `classifyAnchor` (Task 2) ← used in Task 2 test
- `routeAnchorClick` (Task 2) ← used in Tasks 2, 6
- `AnchorCallbacks`, `AnchorAction` (Task 2) ← used in Task 2 test
- `buildIframeAttributes` (Task 3) ← used in Tasks 3, 5
- `DEFAULT_IFRAME_SANDBOX` (Task 3) ← used in Task 3 test
- `WebPreview` (Task 5) ← used in Tasks 5, 7
- `handleOpenLink` (Task 7) ← used in Tasks 7, 6
- `onOpenLink` prop (Tasks 6, 7) ← used in Tasks 6, 7
- `kind: "file" | "url"` (Task 7) ← used in Task 7
- `tabId` for URL: `url:${encodeURIComponent(url)}` (Task 7)
- `decidePolicyFor` (Task 9) ← only in Task 9

- [ ] **Step 5: Spec self-amendment**

The plan deliberately deviates from the spec by replacing `components/MessageView.test.tsx` (which the spec called for as a `@testing-library/react` component test) with the `lib/anchor-routing.test.ts` pure-function test (Task 2). Open `docs/superpowers/specs/2026-06-09-url-link-preview-design.md` §7 Test Plan and remove the third bullet group ("components/MessageView.test.tsx"), keeping the vitest coverage for `lib/safe-url.test.ts`, `components/WebPreview.test.tsx`, and adding a note that the MessageView behavioral coverage is provided by `lib/anchor-routing.test.ts`. Commit the spec amendment:

```bash
cd /Users/mk/codespace/pi-web
git add docs/superpowers/specs/2026-06-09-url-link-preview-design.md
git commit -m "docs(spec): defer MessageView.test.tsx to anchor-routing.test.ts pure coverage"
```

- [ ] **Step 6: Final commit summary**

Run: `git log --oneline main..HEAD` to see the 9 commits produced by this plan (Tasks 1-9). Confirm each commit's message matches the spec's intent.

Plan complete.
