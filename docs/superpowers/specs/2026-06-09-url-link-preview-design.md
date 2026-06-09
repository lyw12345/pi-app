# pi-web — URL Link Preview in the Right Panel

Date: 2026-06-09
Project: `pi-web` (Next.js 14 web UI, port 30142 dev / 30141 prod)
Status: Draft (awaiting user review)
Parent spec: `docs/superpowers/specs/2026-06-01-pi-web-enterprise-workbench-design.md`

## 1. Objective

When the LLM emits a URL in a chat message, clicking the link should open
the page in the existing right-side preview panel — instead of navigating
the main `WKWebView` away from the chat UI. This restores the
"stay-in-the-workbench-while-following-a-link" workflow the user already
has for local files (via `FileAttachmentChip`).

The right panel already supports multiple tabs and multiple content kinds
(image / audio / PDF / text / system fallback). The change extends the
panel to a fourth tab content kind — **remote web URL**, rendered in an
`<iframe>` — and teaches `MessageView` to route `<a href="https://…">`
clicks to a new `onOpenLink` callback that opens such a tab.

The macOS shell is changed only to fix the regression that
`window.open(url, "_blank")` would otherwise re-cover the main webview: a
tiny `decidePolicyFor` interceptor routes any external link the user
opens from inside the iframe/panel back to `NSWorkspace.shared.open`.

## 2. Scope

In scope:

- New `Tab` discriminated union in `AppShell` (file vs. URL).
- New callback `onOpenLink(url, label)` on `MessageView` →
  `AssistantMessageView` → `TextBlock`.
- `ReactMarkdown` in `TextBlock` gets a custom `a` component that:
  - Recognizes `http(s)://` URLs and calls `onOpenLink` (with
    `preventDefault`).
  - Leaves plain anchor `href` intact for all other cases (so future
    schemes still work, e.g. `mailto:`, `tel:`, and any unhandled
    local-path variant the existing `FileAttachmentChip` flow
    already covers).
  - Modifier-clicks (`⌘` / `Ctrl` / `Shift` / `Alt`) skip the panel
    route and let the browser open the link itself; the macOS shell
    interceptor (§4.4) makes that safe.
- New pure helper `assertSafePreviewUrl(url)` in `lib/safe-url.ts`:
  protocol allowlist (`http:`, `https:`), rejects `javascript:`,
  `data:`, `file:`, `vbscript:`, empty, malformed. Throws a typed
  `UnsafeUrlError`.
- New component `components/WebPreview.tsx` rendering a single
  `<iframe>` with a strict `sandbox`, `referrerPolicy="no-referrer"`,
  a 15 s load timeout, and a fallback panel ("此页面拒绝嵌入预览 /
  在系统浏览器打开") shown when the iframe never reaches `load`.
- Tab header gets a small "↗ open in system browser" action button
  that fires `window.open(url, "_blank", "noopener,noreferrer")` for
  the current URL tab.
- i18n: extend `fileViewer.*` namespace with `webPreview.*` keys,
  plus rename `appShell.hideFilePanel` / `showFilePanel` / `noFileOpen`
  to panel-agnostic names. (Only `AppShell` consumes these keys —
  single call site, so the rename is safe and contained.)
- Unit tests:
  - `lib/safe-url.test.ts` — protocol allowlist edge cases.
  - `components/WebPreview.test.tsx` — sandbox attributes, timeout
    path, fallback render.
  - `components/MessageView.test.tsx` — `https://…` triggers
    `onOpenLink`; local path triggers `onOpenFile`; `mailto:`
    triggers neither callback.
- macOS shell: `PiWebView` implements
  `webView(_:decidePolicyFor:decisionHandler:)` to route any
  `navigationAction` whose URL host is **not** `127.0.0.1` /
  `localhost` / `::1` to `NSWorkspace.shared.open(url)` + `.cancel`
  the in-webview navigation.
- `CHANGELOG.md` "Unreleased" entry under the existing "Right Panel"
  theme.

Out of scope (explicit non-goals):

- No Pi-internal "preview browser window" (a separate `NSWindow` with
  its own `WKWebView`). That was a separate brainstorm option and is
  deferred.
- No server-side HTML proxy (`/api/preview/url`) — the spec goes
  with the simpler `<iframe src={url}>` strategy. Sites that set
  `X-Frame-Options: DENY` or `Content-Security-Policy: frame-ancestors
  'none'` (e.g. `github.com`, `x.com`, most SaaS) will show a fallback
  panel; the user is one click away from the system browser.
- No URL rewriting / link decoration / link expansion (e.g. fetching
  `<title>` to show in the tab).
- No "remember last opened URL per session" state.
- No hover-preview / link tooltip.
- No change to the local-file `FileAttachmentChip` flow.
- No change to the existing `webFetch` / `HiddenWebFetcher` extension
  (used for agent-side content extraction, orthogonal).

## 3. Goals and Non-Goals

Goals:

- Clicking an LLM-emitted `https://…` link in chat opens a new tab
  in the right panel; the chat (main webview) does not navigate.
- Clicking a local file path in chat (current behavior) still opens
  a file tab in the right panel; no regression.
- Right panel supports mixed file + URL tabs in the same stack.
  Closing the last tab collapses the right panel (existing behavior,
  unchanged).
- The "↗ open in system browser" button on a URL tab always works,
  regardless of whether the iframe succeeded in rendering the site.
- Unsafe URLs (`javascript:`, `data:`, `file:`) are rejected with no
  navigation, no tab created, and a console warning.
- The macOS app never has its main `WKWebView` navigate to an
  external origin, even if the user clicks an unsanitized `<a>` that
  the `ReactMarkdown` `<a>` custom component fails to intercept.

Non-goals:

- We are not implementing a general "browser window" subsystem
  inside Pi — only the right-panel tab.
- We are not changing the file path detection heuristic in
  `extractAssistantOutputFileRefs`; URL classification in the new
  `ReactMarkdown` `a` component is its own concern and uses
  `URL_SCHEME_RE` directly via `new URL()`.
- We are not making URL tabs persistent across reloads (right panel
  state is already ephemeral — file tabs are not persisted either,
  so URL tabs follow the same rule).
- We are not adding telemetry on link clicks.

## 4. Architecture

### 4.1. Link click routing in `TextBlock`

`TextBlock` currently passes `displayText` to `<ReactMarkdown
remarkPlugins={[remarkGfm]} components={…} />` with overrides for
`code` and `pre`. We add a third override, for `a`:

```tsx
a({ href, children, ...rest }) {
  const url = href ?? "";
  if (isHttpUrl(url)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          try {
            assertSafePreviewUrl(url);
            onOpenLink?.(url, labelFromChildren(children));
          } catch (err) {
            console.warn("[pi-web] refusing to open unsafe URL", err);
          }
        }}
        {...rest}
      >
        {children}
      </a>
    );
  }
  return <a href={href} {...rest}>{children}</a>;
}
```

Non-`http(s)://` schemes (`mailto:`, `tel:`, `file:`, …) fall through
to the default anchor. In the macOS app, the `decidePolicyFor`
interceptor in §4.4 then routes the navigation: `file://` opens the
file in the user's default app via `NSWorkspace.shared.open`,
`mailto:` opens the default mail client, `tel:` the dialer. The
right panel is therefore *only* used for `http(s)://` URLs; any
other scheme bypasses the panel entirely.

`isHttpUrl`:

```ts
function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
```

`labelFromChildren` flattens the anchor's children to a string for use
as the tab label. If empty, the caller (`AppShell.handleOpenLink`)
falls back to `new URL(url).host`.

`target="_blank" rel="noopener noreferrer"` is kept on the `<a>` even
though we `preventDefault` on the simple click: when the user
modifier-clicks (e.g. `⌘+click` on macOS), the browser's default
behavior takes over and we want it to open the link via the
browser's own pipeline, not a panel tab. The macOS shell
interceptor (§4.4) makes that safe.

### 4.2. Right panel: tabs become a discriminated union

Current shape in `AppShell`:

```ts
type Tab = { id: string; label: string; filePath: string };
```

New shape:

```ts
type Tab =
  | { kind: "file"; id: string; label: string; filePath: string }
  | { kind: "url";  id: string; label: string; url: string };
```

`Tab.id` namespaces:

- `file:${encodeURIComponent(filePath)}` (existing — keep behavior)
- `url:${encodeURIComponent(url)}` (new — same dedup-as-file pattern)

Deduplication logic stays in `AppShell.handleOpenFile` /
`handleOpenLink`: if a tab with the id already exists, just
`setActiveFileTabId`; do not append.

`activeFileTab?.filePath` rendering becomes a `kind` switch:

```tsx
{activeFileTab?.kind === "file" && (
  <FileViewer filePath={activeFileTab.filePath} ... />
)}
{activeFileTab?.kind === "url" && (
  <WebPreview url={activeFileTab.url} label={activeFileTab.label} />
)}
{!activeFileTab && <EmptyState />}
```

### 4.3. `WebPreview` component

```tsx
function WebPreview({ url, label }: { url: string; label: string }) {
  const [blocked, setBlocked] = useState(false);
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setBlocked(false);
    loadTimer.current = setTimeout(() => setBlocked(true), 15_000);
    return () => {
      if (loadTimer.current) clearTimeout(loadTimer.current);
    };
  }, [url]);

  return (
    <div className="web-preview">
      <FilePreviewHeader title={label} filePath={url} badge="web" />
      <div className="web-preview-toolbar">
        <span className="web-preview-url">{url}</span>
        <a
          className="web-preview-open-external"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title={i18nT("fileViewer.openInSystemBrowser")}
        >
          ↗
        </a>
      </div>
      <div className="web-preview-body">
        {blocked ? (
          <EmbedBlockedFallback url={url} />
        ) : (
          <iframe
            key={url}
            src={url}
            sandbox="allow-scripts allow-same-origin allow-forms"
            referrerPolicy="no-referrer"
            title={label}
          />
        )}
      </div>
    </div>
  );
}
```

Sandbox values are the **minimum** needed for typical sites:

- `allow-scripts` — most sites show a blank page without JS.
- `allow-same-origin` — preserves cookies / storage so logged-in
  sites keep their session. The iframe's origin is the remote site;
  with `sandbox` it has no DOM access to the parent. Allowing
  `allow-same-origin` *plus* `allow-scripts` lets the iframe reach
  its own origin's storage (the cross-origin case is blocked by
  SOP). This is the standard tradeoff; we accept it.
- `allow-forms` — search boxes and login forms.
- (intentionally omitted) `allow-popups`, `allow-top-navigation`,
  `allow-popups-to-escape-sandbox`, `allow-modals`,
  `allow-presentation`.

The 15 s timer is the empirical threshold for "this iframe is never
going to load" (an `X-Frame-Options: DENY` site stays on
`about:blank` forever; some CSP-blocked embeds likewise). Falling
back to a panel after 15 s is responsive without flashing on
slow-but-eventually-loading sites.

### 4.4. macOS shell: external-link interceptor

Currently `PiWebView: WKNavigationDelegate` declares the protocol
conformance but does not implement any method. `WKWebView`'s default
behavior is to navigate the main frame for any `<a href>` the user
clicks.

New implementation in `WebView.swift`:

```swift
extension PiWebView {
  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    guard let url = navigationAction.request.url else {
      decisionHandler(.allow);
      return;
    }
    if isLocalPiWebURL(url) {
      decisionHandler(.allow);
    } else {
      NSWorkspace.shared.open(url)
      decisionHandler(.cancel);
    }
  }
}

private func isLocalPiWebURL(_ url: URL) -> Bool {
  guard let host = url.host else { return false; }
  return host == "127.0.0.1" || host == "localhost" || host == "::1";
}
```

This is the safety net. Even if a future change to `MessageView`
forgets the `preventDefault`, or a 3rd-party iframe redirects its
top frame, the shell will not navigate the main `WKWebView` to a
remote origin.

### 4.5. `assertSafePreviewUrl`

```ts
export class UnsafeUrlError extends Error {
  constructor(public readonly url: string, public readonly reason: string) {
    super(`unsafe URL: ${reason} (${url})`);
    this.name = "UnsafeUrlError";
  }
}

export function assertSafePreviewUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UnsafeUrlError(url, "not a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UnsafeUrlError(url, `protocol ${parsed.protocol} not allowed`);
  }
  if (!parsed.hostname) {
    throw new UnsafeUrlError(url, "missing hostname");
  }
  return parsed;
}
```

Used in:

- `MessageView.TextBlock` `a` onClick handler.
- `AppShell.handleOpenLink` (defense in depth, even though
  `MessageView` already validated; we don't trust the caller).

## 5. Data Flow (end-to-end)

1. User reads an assistant message containing
   `https://github.com/foo/bar`.
2. User clicks the link.
3. `ReactMarkdown`'s `a` component fires. Modifier check passes (no
   modifier), `preventDefault` runs, `assertSafePreviewUrl` passes.
4. `onOpenLink("https://github.com/foo/bar", "view on GitHub")` is
   called → `MessageView` → `AssistantMessageView` → `AppShell.handleOpenLink`.
5. `AppShell.handleOpenLink`:
   - Computes `id = "url:" + encodeURIComponent(url)`.
   - If a tab with that id exists → `setActiveFileTabId(id)`.
   - Otherwise → appends new `{ kind: "url", id, label, url }`,
     `setActiveFileTabId(id)`, `setRightPanelOpen(true)`.
6. `<FilePreviewHeader>` re-renders for the URL tab. The `<iframe>`
   is mounted with `src={url}`.
7. If the iframe loads successfully → user sees the page. If 15 s
   elapse without a `load` event → fallback panel: "此页面拒绝嵌入
   预览" + "↗ 在系统浏览器打开" button.
8. User clicks the toolbar `↗` button. The anchor's
   `target="_blank"` fires `window.open(url, "_blank",
   "noopener,noreferrer")`. In the dev browser this opens a new
   tab; in Pi.app, since `PiWebView` does not implement
   `webView(_:createWebViewWith:for:windowFeatures:)`, `WKWebView`
   falls back to a top-frame navigation, **but** the new
   `decidePolicyFor` interceptor sees the external origin and
   routes to `NSWorkspace.shared.open(url)` + cancels the
   in-webview navigation. The user lands in Safari/Chrome.
9. User closes the URL tab. Existing `handleCloseFileTab` removes
   it. If it was the last tab, `setRightPanelOpen(false)`
   collapses the right panel.

## 6. Files Touched

| File | Change |
| --- | --- |
| `components/MessageView.tsx` | `ReactMarkdown` `components` map: add `a`. New `onOpenLink` prop on `TextBlock` / `AssistantMessageView` / `MessageView`. |
| `components/AppShell.tsx` | `Tab` type → discriminated union. New `handleOpenLink`. New `onOpenLink={handleOpenLink}` prop on `ChatWindow` → `MessageView`. Render switch on `activeFileTab.kind`. New `fileViewer.openInSystemBrowser` tooltip on the toolbar `↗` link. |
| `components/WebPreview.tsx` (new) | `<iframe>` with sandbox + timeout fallback. |
| `lib/safe-url.ts` (new) | `assertSafePreviewUrl` + `UnsafeUrlError`. |
| `lib/safe-url.test.ts` (new) | Unit tests for the protocol allowlist. |
| `components/WebPreview.test.tsx` (new) | Sandbox attribute, timeout fallback. |
| `components/MessageView.test.tsx` (new) | `a` component routing for `https://`, local path, `mailto:`. |
| `lib/i18n/messages/en.ts` | New `fileViewer.webPreview.*` keys; rename `appShell.hideFilePanel/showFilePanel/noFileOpen` → `hideSidePanel/showSidePanel/noPreview`. |
| `lib/i18n/messages/zh-CN.ts` | Same as above, Chinese values. |
| `macos/PiWorkbench/Sources/PiWorkbench/WebView.swift` | Implement `decidePolicyFor` to route external links to `NSWorkspace.shared.open`. |
| `CHANGELOG.md` | Unreleased entry under "Right Panel". |

No new dependencies. No `package.json` change. No new API route.
No schema change.

## 7. Test Plan

Unit (vitest, `npm run test:run`):

- `lib/safe-url.test.ts`:
  1. `https://example.com` → ok
  2. `http://example.com` → ok
  3. `javascript:alert(1)` → throws `UnsafeUrlError`
  4. `data:text/html,…` → throws
  5. `file:///etc/passwd` → throws
  6. `vbscript:msgbox(1)` → throws
  7. `not a url` → throws
  8. `https://` (no host) → throws
- `components/WebPreview.test.tsx`:
  1. Renders `<iframe>` with `src={url}`, `sandbox` attribute,
     `referrerPolicy="no-referrer"`.
  2. After `vi.advanceTimersByTime(15_000)`, renders fallback markup
     instead of the iframe.
  3. Toolbar `↗` anchor has `href={url}` and `target="_blank"`.
- `components/MessageView.test.tsx`:
  1. A markdown body containing
     `[text](https://example.com)` produces an anchor whose
     `onClick` calls `onOpenLink` (preventDefault'd).
  2. A markdown body containing a local path that resolves to a
     file calls `onOpenFile`, not `onOpenLink`.
  3. A markdown body containing `[mail me](mailto:foo@bar)` does
     not call `onOpenLink` or `onOpenFile`; the default anchor
     navigation is preserved.
  4. Modifier-click (`e.metaKey = true`) does not call
     `onOpenLink`.

Manual:

- `node_modules/.bin/tsc --noEmit` clean.
- `npm run lint` clean.
- `npm run test:run` clean.
- In dev (port 30142):
  - Open a session, send a message, get the LLM to emit a
    `https://` link, click it → URL opens in right panel; chat
    is unchanged.
  - Click a local file path in the same response → file tab
    opens; URL tabs and file tabs coexist; switching between
    them works.
  - Click the `↗` button on a URL tab → page opens in default
    browser; main webview unchanged.
  - Try `https://github.com/…` (X-Frame-Options: DENY) → iframe
    stays blank; after 15 s the fallback panel shows.
  - Right-panel toolbar (top-right toggle) hides / shows the
    right panel; the i18n tooltip reads "隐藏预览面板" /
    "显示预览面板" (or English equivalent).
- In Pi.app (port 30141, after `npm run build && npm run
  package:macos` and reinstall per `AGENTS.md`):
  - Repeat the four dev checks.
  - Confirm `decidePolicyFor` intercept: paste a raw
    `<a href="https://…">` into the chat input and submit (or
    any other way to get a raw anchor through), click it → page
    opens in system browser, not in the main Pi webview.

## 8. Risks & Mitigations

- **Sandboxed iframe → same-origin storage + scripts**: a malicious
  remote page that *itself* is allowed to embed (e.g. an attacker
  controls `evil.example.com`) can run JS that talks to its own
  backend. This is the **same** risk as opening the page in Safari
  with default settings. We accept it because the user's intent is
  "open this URL"; the macOS shell does not gain any new capability
  it did not already have via `HiddenWebFetcher.webFetch`.
  Mitigation: clear documentation in `CHANGELOG` and the user-guide
  — "remote pages run in a sandboxed iframe, but they still execute
  their own JS in their own origin — same as your regular browser."
- **`X-Frame-Options: DENY` is the dominant failure mode** for
  developer-tool URLs (GitHub, Notion, Linear, etc.). Users will
  hit this often. Mitigation: the fallback panel makes the next
  action obvious (`↗` button), and the 15 s timeout is short
  enough to feel responsive.
- **LLM emits `javascript:alert(1)`**: `react-markdown` already
  filters `javascript:` from rendered anchors (v9+), and our
  `assertSafePreviewUrl` is a second line of defense. Either layer
  alone is sufficient; both together are belt-and-suspenders.
- **Right-panel close semantics**: a URL tab closing should not
  unexpectedly close the panel while the user is reading a file
  tab next to it. The existing `handleCloseFileTab` only collapses
  on the *last* tab, so this is fine — but we need to make sure
  the rename of `setFileTabs` (now used for the union) keeps the
  same semantics. Mitigation: zero behavior change to
  `handleCloseFileTab` other than the type signature.
- **macOS `decidePolicyFor` over-cancels**: if the user clicks a
  link that *is* on the local server (e.g. an internal redirect
  to a Next.js asset), we must allow it. The `isLocalPiWebURL`
  check uses `127.0.0.1` / `localhost` / `::1` as the allowlist —
  these are the only hosts the local server binds. Off-LAN: the
  local server is not exposed externally in Pi.app, so this is
  safe.
- **Modifier-click (`⌘+click`) bypasses our handler**: by design,
  the `if (e.metaKey || e.ctrlKey || …) return` early-out lets the
  browser open the link in a new tab. In Pi.app, the new
  `decidePolicyFor` interceptor then routes that to the system
  browser. Net behavior: `⌘+click` on a chat link → system
  browser. This is a reasonable, discoverable shortcut; no need
  to document it further than the user-guide one-liner.

## 9. Rollout

- No feature flag. The change is additive (new `kind: "url"`
  branch, new component, new i18n keys, one shell method). The
  `decidePolicyFor` shell change is a hardening, not a behavior
  change for any currently-working path.
- CHANGELOG entry under the existing "Right Panel" theme:
  > *Chat links to `https://` URLs now open in the right preview
  > panel as a sandboxed iframe, with a one-click "open in
  > system browser" fallback for sites that refuse embedding. The
  > main chat is no longer replaced when clicking a link.*

## 10. Open Questions

None. The user confirmed:

- 1A: tab label = link text, falling back to host.
- 2A: tab close behavior reuses existing `handleCloseFileTab`
  (closing last tab collapses the right panel).
- 3A: render strategy = `<iframe src={url}>` direct embed.
- 4: write the spec + changelog entry.
