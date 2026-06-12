# Pi Agent Web - Development Notes

## Quick Start

```bash
npm run dev   # port 30142 (dev) — production uses 30141
```

Typecheck: `node_modules/.bin/tsc --noEmit`
Lint: `npm run lint`
**Never run `next build` during dev** — pollutes `.next/` and breaks `npm run dev`.

After any code change (not docs-only), run and fix until all pass:

```bash
node_modules/.bin/tsc --noEmit && npm run lint && npm run test:run
```

If you add or change a test file, run `npm run test:run` again after fixing failures.

---

## Dev / Production Isolation

**Rule: 30141 is for daily use; all active development and testing use 30142 only.**

Dev must **never** share the same data directory or port with 30141, and must not hot-reload the 30141 process while you are coding.

### Data isolation
Dev reads/writes its own session data directory via `PI_CODING_AGENT_DIR` in the **`npm run dev` script** (not `.env.local` — that file is loaded in all modes and would break prod isolation):

```bash
# package.json
"dev": "PI_CODING_AGENT_DIR=~/tmp/pi-dev-agent NEXT_DIST_DIR=.next-dev-30142 next dev -p 30142"
```

30141 uses the default `~/.pi/agent/` via `npm start` or the `pi-app` CLI. The env var is honored by `getAgentDir()` in `lib/agent-dir.ts`.

> **Never set `PI_CODING_AGENT_DIR` in `.env.local`** — Next.js loads it for both dev and production, which hides real sessions on 30141.

### Port isolation
| Use | Port | Command | Data directory |
|---|---|---|---|
| Daily use (stable) | **30141** | `npm start` or `pi-app` | `~/.pi/agent/` |
| Dev / test (HMR) | **30142** | `npm run dev` | `~/tmp/pi-dev-agent/` |

Do **not** run `next dev` on 30141 while developing on 30142 — both watch the same source tree, so saves will reload 30141 with WIP code. Use `npm start` on 30141 (build first: `npm run build && npm start`).

`dev:prod` (`next dev -p 30141`) exists only for rare HMR debugging against real data; do not run it alongside `npm run dev`.

### Test files
All test files that mock localhost must use port **30142**, not 30141. Search for `127.0.0.1:30142` or `localhost:30142` to find them.

### Three `.next` directories (easy to ship the wrong UI)

| Directory | Written by | Consumed by |
|-----------|------------|-------------|
| `.next-dev-30142` | `npm run dev` | **30142** only |
| `.next` | `npm run build` (default `NEXT_DIST_DIR`) | **`npm start` / `pi-app` on 30141** |
| `.next-package` | `npm run package:macos` (`NEXT_DIST_DIR=.next-package`) | **copied into `Pi.app` → `Resources/pi-web/.next`** |

**30142 looking correct does not update 30141 or Pi.app.** After UI/API changes that should reach daily use, always `npm run build` (refreshes `.next`) before `npm start` or packaging.

### Packaging / 30141 — do not repeat the stale-server mistake

**Failure mode we hit:** `ditto` replaced `Pi.app` on disk while an old `next start` on **30141** kept running. `/api/health` still returned `ok`, so the shell treated the server as ready, but HTML referenced **old chunk hashes** that no longer exist on disk → 404 JS, UI looks like an old build (missing features such as file attach).

**Before claiming a macOS install or 30141 refresh succeeded:**

1. Stop listeners on 30141: `osascript -e 'quit app "Pi"'`; `lsof -ti tcp:30141 | xargs kill -TERM` (wait until port is free).
2. Refresh production artifacts:
   - Daily **30141** in repo: `npm run build` then `npm start` (uses `.next`, not `.next-package`).
   - **Pi.app**: `npm run package:macos` (no `SKIP_BUILD=1` after code changes). Script rebuilds Swift when `macos/PiWorkbench/Sources/**` is newer than the release binary.
3. Install: `rm -rf /Applications/Pi.app && ditto dist/macos/Pi.app /Applications/Pi.app && xattr -cr /Applications/Pi.app`
4. **Verify UI, not just health:** `curl -s http://127.0.0.1:30141/` → take a `/_next/static/chunks/app/page-*.js` URL → confirm that file exists under the serving tree **and** contains the expected symbol (e.g. `rg attachFile` on the served chunk). Mismatch between HTML chunk name and files on disk means a zombie `next-server` — go back to step 1.

`ServerManager` now calls `terminateStaleListenersOnPort()` before spawn so a new Pi.app launch clears orphaned 30141 processes; still quit Pi and free the port when replacing the bundle manually.

**Never:** tell the user Pi.app or 30141 is updated after packaging alone without killing the old process and running the verification above.

---

## Architecture

```
Browser                Next.js Server              AgentSession (in-process)
  │                        │                               │
  ├─ GET /api/sessions ────▶ reads $PI_CODING_AGENT_DIR/sessions/ │
  ├─ GET /api/sessions/[id] reads .jsonl file directly            │
  │                        │                               │
  ├─ send message ─────────▶ POST /api/agent/[id]          │
  │                        │   startRpcSession() ─────────▶│ createAgentSession()
  │                        │   session.send(cmd) ─────────▶│ session.prompt()
  │                        │                               │
  ├─ SSE connect ──────────▶ GET /api/agent/[id]/events    │
  │                        │   session.onEvent() ◀─────────│ session.subscribe()
  │◀── data: {...} ─────────│                               │
```

**Session browsing** (read-only): reads `.jsonl` files directly via `lib/session-reader.ts` — no AgentSession created.  
**Sending a message**: `startRpcSession()` in `lib/rpc-manager.ts` creates an AgentSession in-process.

**macOS App (M1)**: Shell probes `GET /api/health` (loopback only). Web ↔ shell IPC via `window.piNative` — see `lib/pi-native.d.ts`, `lib/notify-agent-end.ts`. Dev shell: `macos/PiWorkbench` (SwiftPM). `.app` bundle + embedded Node is still M1-A packaging work under `macos/README.md`.

---

## File Map

```
app/api/
  sessions/route.ts               GET  list all sessions
  sessions/[id]/route.ts          GET/PATCH/DELETE session
  sessions/[id]/context/route.ts  GET ?leafId= — context for a specific leaf
  sessions/new/route.ts           returns 410 (no longer used)
  agent/new/route.ts              POST { cwd, message, toolNames?, provider?, modelId? }
  agent/[id]/route.ts             GET state | POST any command
  agent/[id]/events/route.ts      GET SSE stream
  files/[...path]/route.ts        GET file contents for viewer
  models/route.ts                 GET { models, modelList, defaultModel }
  models-config/route.ts          GET/PUT — read/write $PI_CODING_AGENT_DIR/models.json
  health/route.ts                 GET { ok, version } — loopback probe for macOS shell
  notifications/agent-end/route.ts POST Web Push fallback when no piNative

lib/
  rpc-manager.ts      AgentSessionWrapper + registry + startRpcSession
  session-reader.ts   parse .jsonl; getModelNameMap/getModelList/getDefaultModel
  types.ts            shared TypeScript types
  normalize.ts        normalizeAgentMessage() — toolCall fields + compaction/branch summary roles

components/
  AppShell.tsx        layout + URL state + tab management
  SessionSidebar.tsx  session tree + FileExplorer
  ChatWindow.tsx      messages + streaming + SSE + fork/navigate logic
  ChatInput.tsx       input bar + model/thinking/tools/compact controls
  MessageView.tsx     renders one message (user/assistant/toolCall/toolResult)
  BranchNavigator.tsx in-session branch switcher
  ChatMinimap.tsx     scroll minimap alongside the message list
  ToolPanel.tsx       exports PRESET_NONE/DEFAULT/FULL + getPresetFromTools
  ModelsConfig.tsx    modal for editing models.json (opened from sidebar bottom)
  FileExplorer.tsx    file tree inside sidebar
  FileViewer.tsx      file content in a tab
  TabBar.tsx          tab bar (Chat + open file tabs)
```

---

## Key Design Decisions & Traps

### AgentSession lifecycle (`lib/rpc-manager.ts`)
- One `AgentSessionWrapper` per session id, keyed in `globalThis.__piSessions`
- `globalThis` survives Next.js hot-reload; plain module-level Map does not
- Idle timeout: 10 minutes. Concurrent `startRpcSession()` calls share a single start Promise (`globalThis.__piStartLocks`)

### Fork must destroy the wrapper immediately
`AgentSession.fork()` **mutates the wrapper's inner state in-place** — after fork, `inner.sessionId` is the *new* session's id. If the wrapper stays alive in the registry under the old id, the next request gets the already-forked state and subsequent forks produce a corrupt `parentSession` chain.

**Fix**: `send("fork")` captures `newSessionId`, then calls `this.destroy()` before returning. The next request for the original session reloads a clean AgentSession from the original file.

### Two kinds of branching — don't confuse them
- **Fork** (Fork button on user message): creates a new independent `.jsonl` file. Shown as a child in the sidebar tree via `parentSession` header field.
- **In-session branch** (Continue button / BranchNavigator): calls `navigate_tree` within the same file. Multiple entries share the same `parentId`. Switching between them calls `/api/sessions/[id]/context?leafId=`.

### Session files can be fully rewritten
`parentSession` in the header is **display metadata only** — has zero effect on chat content. Safe to `writeFileSync` the entire file (pi does this itself during migrations). Used when cascade-reparenting children on delete.

### ToolCall field normalization
Pi stores toolCall blocks as `{type:"toolCall", id, name, arguments}` but `ToolCallContent` uses `{toolCallId, toolName, input}`. `normalizeAgentMessage()` in `lib/normalize.ts` handles tool calls and timeline summary roles — used in `session-reader.ts` (file load) and `useAgentSession` SSE updates.

### New session tool preset
Tool names are passed at session creation (`POST /api/agent/new` → `toolNames[]`). For existing sessions, the active preset is inferred on mount via `get_tools` → `getPresetFromTools()`. When tools are fully disabled (`toolNames = []`), `rpc-manager.ts` clears `agent.state.systemPrompt` after `createAgentSession`.

### Skills in system prompt
`startRpcSession()` uses `createAgentResourceLoader()` (`lib/agent-resource-loader.ts`), which appends `PI_WEB_SKILL_WORKFLOW_APPEND` (`lib/skill-system-prompt.ts`) via `DefaultResourceLoader.appendSystemPrompt`. Upstream `formatSkillsForPrompt()` in `@earendil-works/pi-coding-agent` lists installed skills in `<available_skills>` and defines the match → read → recommend-install workflow.

### Model defaults for new sessions
`GET /api/models` returns `defaultModel` read from `$PI_CODING_AGENT_DIR/settings.json`. `ChatWindow` pre-selects this on mount for new sessions.

### SSE reconnect on page refresh mid-stream
On `ChatWindow` mount, `GET /api/agent/[id]` is called. If `state.isStreaming === true`, SSE is reconnected automatically. `thinkingLevel` and `isCompacting` are also synced from this response.

### Compaction SSE events
Newer pi emits `compaction_start` / `compaction_end`; older versions emitted `auto_compaction_start` / `auto_compaction_end`. `handleAgentEvent` accepts both sets to keep `isCompacting` in sync. Manual compact is a blocking POST — the button stays disabled until the response returns.

### Orphaned sessions
Sessions whose first line can't be parsed as a valid header are marked `orphaned: true` in the API response — displayed with an "incomplete" badge in the sidebar and not clickable.

---

**Pi Session File Format**

Location: `$PI_CODING_AGENT_DIR/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl`

```jsonl
{"type":"session","version":3,"id":"<uuid>","timestamp":"...","cwd":"/path","parentSession":"/abs/path/to/parent.jsonl"}
{"type":"model_change","id":"<8hex>","parentId":null,"provider":"zenmux","modelId":"claude-sonnet-4-6","timestamp":"..."}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"user","content":"..."}}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"assistant","content":[...],...}}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"toolResult","toolCallId":"...","content":[...]}}
{"type":"compaction","id":"<8hex>","parentId":"<8hex>","summary":"...","firstKeptEntryId":"<8hex>","tokensBefore":N}
{"type":"session_info","id":"...","parentId":"...","name":"user-defined name"}
```

`entryIds[]` in `SessionContext` is a parallel array to `messages[]` — maps each displayed message back to its `.jsonl` entry id, used for fork and navigate_tree calls.

---

## CSS Variables (`app/globals.css`)

```
--bg --bg-panel --bg-hover --bg-selected --border
--text --text-muted --text-dim
--accent --user-bg --tool-bg
--font-mono
```
