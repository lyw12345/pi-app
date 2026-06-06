# pi-web `web_fetch` Extension Design

Date: 2026-06-06
Project: `pi-web` (provides pi extension)
Status: Proposed

## Summary

Add a pi extension `web-fetch` that registers an LLM-callable `web_fetch` tool. The tool fetches a URL and returns LLM-friendly content, automatically choosing the cheapest sufficient backend. Built as a standalone npm-packaged extension that installs alongside `agent-browser` (Vercel Labs) as its cross-platform Tier 2 backend, with a native macOS `WKWebView` path (via `piNative`) for Pi.app users.

The extension works in `pi` CLI, `pi-web`, and Pi.app on macOS. Installation is `pi install <repo>`; the LLM gains the tool immediately, and `agent-browser` is auto-installed as an npm dependency.

A new `Web Fetch` section in pi-web Settings exposes:
- agent-browser status, version, install button (default-installed state)
- macOS `WKWebView` availability and toggle (Pi.app only)
- Default T2 backend preference
- Cache TTL

## Goals

- Give the LLM a single typed `web_fetch` tool that converts any URL into structured JSON-LD or clean Markdown
- Minimize token cost: prefer zero-cost structured data extraction (JSON-LD, OpenGraph), then lightweight fetch + Readability, then headless browser as a last resort
- Minimize latency: parallelize the cheap paths, cache by URL+options hash
- Work in all three pi runtimes (CLI, pi-web, Pi.app)
- Make Tier 2 default-installed: `agent-browser` ships as an npm dependency so users get T2 with one `pi install`
- Use macOS native `WKWebView` (via `piNative`) as the preferred T2 on Pi.app, falling back to `agent-browser` when unavailable or disabled
- Surface T2 configuration in pi-web Settings — agent-browser status, WKWebView toggle, default backend, cache TTL — so users can manage the tool from the UI without touching the terminal

## Non-Goals

- A `+URL` button, link-preview chip, or any UX that intercepts the user's input
- Pre-fetch injection or eager URL detection (the LLM still decides when to fetch; we only optimize the tool's output)
- Interactive browser automation (login, click, form fill) — `agent-browser`'s skill already covers that; we only do read-only fetching
- Local site adapters, knowledge bases, or persistent crawl storage
- A web-search tool (separate concern; install `badlogic/pi-skills/brave-search` for that)
- Linux/Windows native browser bridges (only macOS gets the `WKWebView` fast path; other platforms use `agent-browser`)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  pi extension: web-fetch  (~/.pi/agent/extensions/)         │
│                                                             │
│  ┌────────────────┐                                         │
│  │  web_fetch     │ ← LLM calls this typed tool             │
│  │  (registerTool)│                                         │
│  └────────┬───────┘                                         │
│           ▼                                                 │
│  ┌────────────────┐                                         │
│  │   Cache.check  │ → hit? return cached result             │
│  └────────┬───────┘                                         │
│           ▼                                                 │
│  ┌────────────────┐                                         │
│  │    Router      │ ← decides T0/T1/T2, parallelizes        │
│  └─┬──────┬────┬──┘                                         │
│    │      │    │                                            │
│    ▼      ▼    ▼                                            │
│  ┌────┐ ┌────┐ ┌────────┐                                   │
│  │ T0 │ │ T1 │ │  T2    │                                   │
│  │    │ │    │ │  (auto)│                                   │
│  └──┬─┘ └──┬─┘ └───┬────┘                                   │
│     │      │       │                                        │
│  JSON-LD  cheerio  ┌────────────────────┐                   │
│   regex  +readability  Platform-aware:  │                   │
│                     │  • macOS Pi.app:   │                   │
│                     │    piNative        │                   │
│                     │    → WKWebView     │                   │
│                     │  • Other:          │                   │
│                     │    agent-browser   │                   │
│                     │    subprocess      │                   │
│                     └────────────────────┘                   │
│                                                             │
│  ┌────────────────┐                                         │
│  │  Formatter     │ ← unifies output shape                  │
│  └────────────────┘                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────┐
│  pi-web  (project side, P3 + P4)                            │
│                                                             │
│  ┌────────────────────────────┐                             │
│  │  app/api/web-fetch/        │                             │
│  │   • status/route.ts        │ → GET /api/web-fetch/status│
│  │   • install/route.ts       │ → POST trigger install      │
│  └────────────┬───────────────┘                             │
│               │                                             │
│  ┌────────────▼───────────────┐                             │
│  │  components/Settings/      │                             │
│  │   WebFetchSettings.tsx     │                             │
│  │   • agent-browser row      │                             │
│  │   • WKWebView row (macOS)  │                             │
│  │   • T2 backend preference  │                             │
│  │   • cache TTL input        │                             │
│  └────────────────────────────┘                             │
│                                                             │
│  macos/PiWorkbench/Sources/PiWorkbench/                     │
│   • PiNativeBridge.swift  ← +webFetch() method              │
│   • WebView.swift         ← +hidden fetch mode              │
│                                                             │
│  lib/pi-native.d.ts  ← +webFetch() type                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Tier Routing

The router runs tiers in order of cost, all in parallel where possible:

| Tier | Backend | Trigger | Latency | Token output |
|------|---------|---------|---------|--------------|
| **T0** | `extractors/jsonld.ts` (regex on T1-fetched HTML) | Always, runs in parallel with T1 markdown extraction | ~50ms | Structured JSON, ~0 LLM extraction cost |
| **T1** | `backends/http.ts` (fetch) + `backends/readability.ts` (cheerio + Mozilla Readability + turndown) | Always, shares the T0/T1 HTML fetch | ~500ms | Clean Markdown |
| **T2** | Platform-aware: `backends/webkit.ts` (macOS Pi.app via `piNative`) OR `backends/agent-browser.ts` (cross-platform subprocess) | Only if T0 and T1 are both insufficient AND `render != "never"` | WKWebView: ~500ms; agent-browser: ~2-3s | Accessibility-tree Markdown |

A tier is "sufficient" if:

- **T0**: parsed any JSON-LD block with `@type` AND at least one meaningful field (`name`, `headline`, `description`, `articleBody`, etc.). If a `selector` is given, T0 also requires the selector to match in the JSON-LD `description` or `articleBody` text.
- **T1**: Mozilla Readability extracted ≥ 200 chars of clean text. If a `selector` is given, T1 only counts as sufficient if the selector matches a non-empty element.
- **T2**: Always sufficient (last resort) unless `render == "never"`.

If T0 succeeds, the LLM gets structured JSON it can answer questions about without further extraction. If T0 fails, the router falls back to T1. If T1 also fails, the router escalates to T2 (unless disabled). T2 failures are returned with a clear error and any partial result from earlier tiers.

### Cache

- In-memory `Map<string, { result, expiresAt }>`, keyed by `sha256(url + JSON.stringify(sortedOptions)).slice(0, 16)`
- TTL: 1 hour (configurable via `~/.pi/agent/settings.json` under `webFetch.cacheTtlMs`, exposed in pi-web Settings)
- Cache lookup runs before any tier; cache miss stores the final formatted result
- Caching is per-process; no disk persistence in v1
- "Clear cache" button in pi-web Settings → calls `cache.clear()` in the running extension

### Platform-Aware Tier 2

T2 chooses the backend at runtime based on platform and user preference:

1. If `webFetch.t2Backend` is `"webkit"` AND `window.piNative?.webFetch` is available AND we are running in Pi.app → use **WKWebView** (`backends/webkit.ts`)
2. Else if `webFetch.t2Backend` is `"agent-browser"` OR `agent-browser` is on `$PATH` → use **agent-browser** (`backends/agent-browser.ts`)
3. Else if `webFetch.t2Backend == "auto"` AND none of the above → return error hinting at install

The preference is read from `~/.pi/agent/settings.json` under `webFetch.t2Backend` (`"auto" | "webkit" | "agent-browser"`, default `"auto"`) and mirrored in the pi-web Settings UI.

### Output Format

The tool returns a structured `content` array suitable for the LLM:

```typescript
type WebFetchResult = {
  type: "structured" | "markdown";
  source: "jsonld" | "readability" | "agent-browser" | "selector";
  url: string;
  data?: Record<string, unknown>;   // present when type === "structured"
  content?: string;                 // present when type === "markdown"
  truncated?: boolean;              // present if max_tokens hit
  meta?: {
    fetchedAt: number;
    cacheHit: boolean;
    tiersAttempted: Array<"t0" | "t1" | "t2">;
    latencyMs: number;
  };
};
```

The extension returns this as a `content: [{ type: "text", text: JSON.stringify(result) }]` so the LLM gets a single uniform payload regardless of which tier succeeded.

### Error Handling

| Failure | Response |
|---------|----------|
| T0 fails to parse | T0 returns `null`; router continues |
| T1 fetch throws (network, 4xx, 5xx) | T1 returns `null`; router continues |
| T2 `agent-browser` not in PATH | T2 returns `{ error: "agent-browser not installed. Run: brew install agent-browser && agent-browser install" }`; tool returns error to LLM with T0/T1 partial if any |
| T2 subprocess timeout (>30s) | T2 returns `{ error: "agent-browser timeout" }`; same as above |
| T2 subprocess non-zero exit | T2 returns `{ error: "agent-browser exit <code>: <stderr>" }`; same as above |
| `selector` matches nothing | Tool returns `{ type: "markdown", content: "", source: "selector", error: "selector matched no elements" }` |
| All tiers fail | Tool returns `{ content: [{ type: "text", text: JSON.stringify({ error, url, reasons }) }], isError: true }` |
| User aborts (Esc) | `ctx.signal` cancellation propagates; partial result discarded |

The LLM sees error details in the result and can decide to retry with different parameters (e.g., try `render: "never"` to skip the browser, or accept a partial result).

## Components

### `package.json`

```json
{
  "name": "pi-web-fetch",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "dependencies": {
    "cheerio": "^1.1.0",
    "@mozilla/readability": "^0.6.0",
    "turndown": "^7.2.0",
    "agent-browser": "^0.27.0"
  },
  "pi": { "extensions": ["./src/index.ts"] }
}
```

`agent-browser` is declared as a dependency so its binary and `skills/` directory are installed alongside the extension. The extension code does not `import` from `agent-browser`; it only `spawn`s the binary.

### `src/index.ts`

Entry point. Exports a default async factory function. On `session_start`, runs `checkAgentBrowser()` and caches the result. Registers the `web_fetch` tool. On `resources_discover`, returns the path to the bundled `agent-browser` skill so it is visible in the LLM's system prompt.

### `src/router.ts`

Orchestrates the three tiers. Accepts `{ url, render, selector, maxTokens, signal }`. Runs cache check → T0 ∥ T1 → T2 (if needed) → formatter → cache store. Reports progress via `onUpdate` at each phase.

### `src/extractors/jsonld.ts`

Exports `extractJsonLd(html: string, url: string): JsonLdResult | null`. Pure regex-based, no I/O. Handles `<script type="application/ld+json">` blocks and OpenGraph `<meta>` tags. Returns the first structured-data block that has both a `@type` and a meaningful field. Handles JSON-LD arrays (some sites embed multiple objects).

### `src/extractors/selector.ts`

Exports `extractBySelector(html: string, selector: string): { text: string; html: string } | null`. Uses cheerio to parse and find the first matching element. Returns inner text and inner HTML. Used when the LLM passes a `selector` to narrow extraction.

### `src/backends/http.ts`

Exports `fetchHtml(url, signal): Promise<{ html, finalUrl, headers }>`. Uses built-in `fetch` with a 8s timeout. Follows up to 3 redirects. Returns response body, final URL (after redirects), and headers. Throws on non-2xx unless `Accept` was honored and content type is HTML.

### `src/backends/readability.ts`

Exports `extractReadable(html, url): { markdown, length } | null`. Runs Mozilla Readability, then turndown with GFM plugin. Returns `null` if extracted text is < 200 chars.

### `src/backends/agent-browser.ts`

Exports `fetchViaAgentBrowser(url, signal, options?): Promise<{ markdown, length }>`. Spawns `agent-browser batch` with three commands: `open <url> --headless`, `snapshot --format json --depth 20`, `close`. Parses snapshot JSON, walks the accessibility tree, flattens to Markdown. Returns `null` if agent-browser is not in PATH (caller handles the error). 30s total timeout.

### `src/formatter.ts`

Exports `formatResult(rawResult, options): WebFetchResult`. Unifies the three tier outputs into the LLM-facing shape. Truncates to `maxTokens` (default 8000) by character count approximation (chars / 4) when exceeded; sets `truncated: true` and adds an ellipsis marker.

### `src/cache.ts`

Exports `get(key)`, `set(key, value, ttlMs)`, `clear()`. Simple in-memory Map with TTL eviction on get.

### `src/check-env.ts`

Exports `checkAgentBrowser(): { available: boolean; version?: string; installHint?: string }`. Runs `agent-browser --version` with 2s timeout. Returns version if available, otherwise an install hint.

### `src/backends/webkit.ts`

Exports `fetchViaWebKit(url, signal, options?): Promise<{ markdown, length }>`. macOS Pi.app only. Calls `window.piNative.webFetch(url, options)` and parses the result. The Swift side runs a hidden `WKWebView` (or reuses the main one in a non-visible mode) to navigate, waits for `networkidle`, then runs a JS extraction snippet that walks the accessibility tree and returns it as a flat structure. Returns `null` if `piNative.webFetch` is not available (caller falls back to `agent-browser`).

The Swift `WebView.swift` extension:

- Adds a `hiddenWebView: WKWebView` instance, configured with the same process pool as the main WebView so cookies/storage are shared
- New Swift method `webFetch(url: String, options: [String: Any]) -> Promise<[String: Any]>` that:
  1. Loads `url` in `hiddenWebView`
  2. Waits for `WKNavigationDelegate.webView(_:didFinish:)` or `networkidle` (via `evaluateJavaScript` of `performance.timing`)
  3. Runs a pre-bundled JS extractor (similar to `agent-browser snapshot`) that returns the accessibility tree as JSON
  4. Resolves with `{ markdown, length, title, finalUrl }`

The TypeScript bridge type:

```typescript
// lib/pi-native.d.ts
interface WebFetchOptions {
  /** Wait condition: 'load' | 'domcontentloaded' | 'networkidle' (default 'networkidle') */
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
  /** Timeout in ms (default 15000) */
  timeoutMs?: number;
  /** Run JS in page to extract content (default: accessibility walker) */
  script?: string;
}

interface WebFetchResult {
  markdown: string;
  length: number;
  title: string;
  finalUrl: string;
}

interface PiNativeBridge {
  // ... existing methods ...
  /** macOS Pi.app only — hidden WKWebView fetch. Resolves null if unavailable. */
  webFetch?: (url: string, options?: WebFetchOptions) => Promise<WebFetchResult | null>;
}
```

### `src/preferences.ts`

Exports `getPreferences(): { t2Backend: "auto" | "webkit" | "agent-browser"; cacheTtlMs: number }`. Reads from `~/.pi/agent/settings.json` (`webFetch.t2Backend`, `webFetch.cacheTtlMs`) with defaults. Caches result per-process; re-reads on each call so changes in pi-web Settings take effect without restart.

## pi-web Settings Integration (project-side changes)

This is the only section that adds files to the `pi-web` repo. All other phases are pure extension changes.

### `app/api/web-fetch/status/route.ts`

```typescript
// GET /api/web-fetch/status
// Returns environment capability for the settings UI:
{
  agentBrowser: { available: boolean; version?: string; installHint?: string };
  webkit: { available: boolean; platform: "macos" | "other" };
  t2Backend: "auto" | "webkit" | "agent-browser";
  cacheTtlMs: number;
}
```

Implementation: reads `window.piNative` from the requesting browser context (for `webkit`), runs `agent-browser --version` via `child_process.exec` (server-side) for `agentBrowser`, reads settings.json for preferences.

### `app/api/web-fetch/preferences/route.ts`

```typescript
// GET  /api/web-fetch/preferences  → current values
// PUT  /api/web-fetch/preferences  → update values
// Body: { t2Backend?: "auto" | "webkit" | "agent-browser"; cacheTtlMs?: number }
```

Persists to `~/.pi/agent/settings.json` under `webFetch.*` (merge, not replace). Triggers extension reload if needed (the extension reads on each call so usually no reload).

### `app/api/web-fetch/install-agent-browser/route.ts`

```typescript
// POST /api/web-fetch/install-agent-browser
// Triggers: npm install -g agent-browser && agent-browser install
// Returns: stream of progress events (SSE) for the settings UI
```

Implementation: spawns `npm install -g agent-browser` and then `agent-browser install` (downloads Chrome). Streams stdout/stderr lines as SSE events. The settings UI shows a progress bar.

If `npm install -g` is not allowed (e.g., on a system without npm globals or with sudo required), the route returns an error with the manual command and links to docs.

### `components/Settings/WebFetchSettings.tsx`

New settings section, added to `AppShell`'s settings modal/drawer (whatever the current pattern is). Layout:

```
┌─ Web Fetch ─────────────────────────────────────────────┐
│                                                          │
│  agent-browser                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │ ✓ Installed · v0.21.4                            │   │
│  │ [Reinstall] [View docs ↗]                        │   │
│  └──────────────────────────────────────────────────┘   │
│  OR (if missing)                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ ⚠ Not installed                                  │   │
│  │ Tier 2 (JS-rendered pages) requires agent-browser.│   │
│  │ [Install] (≈ 200 MB download)                    │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  macOS WebKit                                            │
│  ┌──────────────────────────────────────────────────┐   │
│  │ ✓ Available (Pi.app on macOS)                    │   │
│  │ Faster than agent-browser; reuses app's WebView. │   │
│  └──────────────────────────────────────────────────┘   │
│  OR (not in Pi.app)                                      │
│  ┌──────────────────────────────────────────────────┐   │
│  │ — Not available (only in Pi.app on macOS)        │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  Tier 2 backend                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ ◉ Auto    ○ WebKit (macOS Pi.app)                │   │
│  │ ○ agent-browser                                  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  Cache TTL                                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 1 hour  [—]━━━━━━━━━━━━━━━━━━━━━[+]              │   │
│  └──────────────────────────────────────────────────┘   │
│  [Clear cache]                                           │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### `lib/pi-native.d.ts` (modify)

Add the `webFetch` method type as shown in the WebKit section above.

### `macos/PiWorkbench/Sources/PiWorkbench/PiNativeBridge.swift` (modify)

Add a new `case "webFetch":` in the `handle(method:args:)` switch, dispatching to a new `webFetch(url:options:)` Swift method that uses `hiddenWebView`. The result is encoded as a JSON dictionary and returned via the existing IPC mechanism.

### `macos/PiWorkbench/Sources/PiWorkbench/WebView.swift` (modify)

Add a `hiddenWebView: WKWebView` lazy property. Add helper methods for:
- `loadHidden(_ url: URL, waitUntil: String) async throws`
- `extractAccessibilityTree() async throws -> String` (runs a pre-bundled JS extractor)

The pre-bundled JS extractor is added as a `WKUserScript` injected at document end on the hidden WebView. It walks the DOM, builds a flat list of `{role, name, value, level}` elements, and posts back to Swift via a custom scheme handler.

### Swift packaging note

The Swift changes are conditionally compiled: only built when `WebFetchSettings.swift` and the JS extractor are present. The build script in `macos/PiWorkbench/` already rebuilds when `Sources/**` changes (see `macos/README.md`), so no script changes are needed.

### `src/types.ts`

Shared types: `WebFetchResult`, `TierName`, `FetchOptions`, `RouterInput`.

## Data Flow

A single `web_fetch` call:

```
LLM calls web_fetch({
  url: "https://blog.example.com/post-123",
  render: "auto",
  max_tokens: 8000
})
  │
  ▼
index.ts: web_fetch.execute
  │
  ├─► cache.get("a1b2c3d4...")
  │     hit? → return cached WebFetchResult (with meta.cacheHit: true)
  │
  ▼
router.ts: route()
  │
  ├─► onUpdate("Cache miss, fetching HTML (T0 + T1 in parallel)...")
  │
  ├─► backends/http.ts: fetchHtml(url, signal)              // single shared fetch
  │
  ├─► Promise.allSettled([
  │      extractors/jsonld.ts: extractJsonLd(html, url),    // T0
  │      backends/readability.ts: extractReadable(html, url) // T1 markdown
  │    ])
  │
  ├─► Pick best:
  │     - T0 has structured data + meaningful fields?  → return T0 result
  │     - T1 has ≥ 200 chars markdown?                 → return T1 result
  │     - else if render == "never"                    → return error
  │     - else                                         → escalate to T2
  │
  ├─► onUpdate("Escalating to T2 (agent-browser)...")
  │
  ├─► backends/agent-browser.ts: fetchViaAgentBrowser(url, signal)
  │     success → return T2 result
  │     failure → return T0/T1 partial or error
  │
  ▼
formatter.ts: formatResult(raw, options)
  │
  ├─► Truncate to max_tokens if exceeded
  ├─► Build WebFetchResult
  │
  ▼
cache.set(key, result, ttl)
  │
  ▼
return { content: [{ type: "text", text: JSON.stringify(result) }] }
```

LLM receives the formatted JSON, sees the `type` and `source` fields, and uses the `data` or `content` field directly in its response.

## Lifecycle Integration

- `pi.registerTool()` — registers `web_fetch` as a typed tool visible to the LLM
- `pi.on("session_start", ...)` — runs `checkAgentBrowser()`, stores result in module-level variable. Tool execution checks this before calling T2.
- `pi.on("resources_discover", ...)` — returns `{ skillPaths: [path.resolve(__dirname, "../node_modules/agent-browser/skills")] }` so the agent-browser skill is loaded into the system prompt.
- `ctx.signal` — passed to `fetch` and to the agent-browser subprocess (the subprocess is killed on abort).
- `onUpdate` — called at each tier transition to stream progress to the LLM.

## Distribution

The extension ships as a separate npm package (e.g., `pi-web-fetch`), distributable via:

```bash
pi install github.com/<owner>/pi-web-fetch
# or
pi install npm:pi-web-fetch
```

The package's `pi.extensions` field in `package.json` points to `src/index.ts`. After `npm install`, `pi` discovers the extension on next session start.

In v1 we host in a separate repo. Once stable, publish to npm with `pi-package` topic for `pi.dev/packages` discovery.

## Phasing

| Phase | Scope | Exit criteria |
|-------|-------|---------------|
| **P1** | Extension + T0 (JSON-LD) + T1 (Readability) + cache + formatter + preferences + unit tests + README | `web_fetch` returns structured JSON for product pages, Markdown for articles. Token cost ≤ 2k for typical news article. Test coverage ≥ 80%. Settings change to `cacheTtlMs` takes effect without restart. |
| **P2** | T2 (agent-browser subprocess integration) + smoke test | T2 successfully fetches a known SPA (e.g., a public Twitter profile). `agent-browser` skill visible in system prompt. `agent-browser` not installed → tool returns clear install hint. |
| **P3** | pi-web HTTP API + Settings UI + agent-browser install trigger | `GET /api/web-fetch/status` returns correct values. Settings panel shows agent-browser status, lets user trigger install (with progress), change T2 preference, change cache TTL, clear cache. `PUT /api/web-fetch/preferences` persists to `settings.json`. |
| **P4** | macOS WKWebView backend (Swift + piNative + extension `webkit.ts`) | Pi.app on macOS: T2 uses WKWebView, fetches are < 1s for typical pages. T2 backend preference toggles between WKWebView and agent-browser. Non-Pi.app environments fall back to agent-browser transparently. |
| **P5** | pi-web `docs/advanced-features.md` section + extension README finalization + CI workflow | Doc section merged. CI runs unit + integration tests on PR. Extension discoverable via `pi.dev/packages`. |

## Testing Strategy

### Extension unit tests (`pi-web-fetch/tests/`)

- `extractors/jsonld.test.ts` — fixture HTML with single JSON-LD, array JSON-LD, OpenGraph, microdata; verify correct extraction and `null` for invalid
- `extractors/selector.test.ts` — verify cheerio-based selector extraction, edge cases (no match, multiple matches, nested)
- `backends/http.test.ts` — mocked fetch (via `vi.spyOn(globalThis, "fetch")`); verify redirect handling, timeout, non-HTML rejection
- `backends/agent-browser.test.ts` — mocked spawn; verify command construction, output parsing, timeout, missing-binary error
- `backends/webkit.test.ts` — mocked `window.piNative.webFetch`; verify platform detection, fallback to agent-browser when unavailable
- `backends/readability.test.ts` — fixture HTML; verify Markdown output, length threshold
- `router.test.ts` — mocked tiers; verify routing logic (T0 wins over T1, T2 escalation, render=never, platform-aware T2 selection)
- `cache.test.ts` — TTL eviction, key generation
- `formatter.test.ts` — truncation, output shape
- `preferences.test.ts` — settings.json read, defaults, hot-reload
- `check-env.test.ts` — agent-browser version parsing, timeout, missing-binary

### Extension integration tests

- `tests/integration.test.ts` — fixed HTML fixtures, end-to-end through router, assert final `WebFetchResult` shape
- Marked `integration: true` in test config so unit-test run skips them

### pi-web HTTP API tests (project side, P3)

- `app/api/web-fetch/status/route.test.ts` — mocked child_process, mocked piNative; verify response shape
- `app/api/web-fetch/preferences/route.test.ts` — GET returns current, PUT merges into settings.json
- `app/api/web-fetch/install-agent-browser/route.test.ts` — mocked spawn; verify SSE stream format

### pi-web Settings UI tests (P3)

- `components/Settings/WebFetchSettings.test.tsx` — render each state (installed/missing, macOS/other), test preference change calls PUT, test install button triggers POST and shows progress

### Swift unit tests (P4, in PiWorkbench)

- `macos/PiWorkbench/Tests/PiNativeBridgeTests.swift` — test webFetch method dispatch, hidden WebView lifecycle, error handling

### Smoke tests (manual, gated)

- `pi-web-fetch/tests/smoke.test.ts` — real network fetches; gated behind `RUN_SMOKE=1`; verifies agent-browser and WKWebView against known sites
- Not run in CI

### Coverage targets

- Extension `src/`: ≥ 80% line coverage
- Extension `src/extractors/jsonld.ts` and `src/formatter.ts`: 100% (small, critical)
- pi-web new code: ≥ 80% line coverage
- Swift code: best-effort, smoke-tested manually

## Risks and Open Questions

1. **`agent-browser` install script on first install** — `agent-browser` postinstall downloads Chrome (~150MB). This makes the initial `pi install` slow. Mitigation: the Settings UI's install button shows the download size; README documents it; user can defer install until they need T2.
2. **T2 latency on first call** — spawning `agent-browser` for the first time is ~3-5s (Chrome cold start). Acceptable for v1; deferred optimization is a persistent daemon mode. WKWebView path on macOS avoids this.
3. **Readability false negatives** — Mozilla Readability sometimes refuses to extract content (returns `null`) for valid articles with unusual markup. Falls through to T2.
4. **JSON-LD format variance** — sites use `application/ld+json`, sometimes nested `@graph`, sometimes as `application/json`. The extractor handles the common cases; rare variants return `null` and T1/T2 still work.
5. **Cache key collision** — SHA-256 truncated to 16 hex chars; collision probability is ~negligible for the in-memory cache lifetime, but documented.
6. **Pi.app's WKWebView is shared with the main UI** — running heavy extraction in it could affect the visible UI's responsiveness. Mitigation: use a separate `hiddenWebView` instance sharing the same `WKProcessPool` (so cookies/storage are shared) but independent layout/render cycles.
7. **`npm install -g agent-browser` may require sudo on some systems** — the Settings UI's install button surfaces the manual command in this case.
8. **The pi extension's preferences re-read happens per-call** — this means a PUT to preferences takes effect on the next `web_fetch` call, with no restart needed. Confirmed in P1's `preferences.ts` implementation.
9. **Swift JS extractor is bundled in the app binary** — adding/modifying it requires a Swift rebuild and Pi.app reinstall. Mitigation: keep the extractor small and stable; future versions could allow extension-provided scripts via a custom scheme.

## References

- `agent-browser` docs: <https://agent-browser.dev>
- `agent-browser` repo: <https://github.com/vercel-labs/agent-browser>
- pi extension docs: <https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/extensions.md>
- pi `registerTool` signature: same docs, "Custom Tools" section
- Mozilla Readability: <https://github.com/mozilla/readability>
- pi-web macOS shell contract: `docs/macos-shell-contract.md`
- piNative types: `lib/pi-native.d.ts`
- Pi.app Swift sources: `macos/PiWorkbench/Sources/PiWorkbench/`
