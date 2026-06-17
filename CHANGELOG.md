# Changelog

## [0.8.6] - 2026-06-17

**Bundle:** `0.8.6p0.79.6` (pi-app + `@earendil-works/pi-coding-agent`)

### Added
- **Pi.app 全局 `pi` CLI**：App 启动时自动安装或更新全局 `pi` 命令（已有 `pi` 时原地刷新 shim，默认 `~/.local/bin/pi`）。`scripts/install-pi-cli-from-app.mjs` + `ServerManager` 首次启动钩子。

### Fixed
- **Skills 安装（Pi.app）**：从 Dock/Finder 启动时 PATH 不含 Homebrew，`npx skills add` 报 `env: node: No such file or directory`；`lib/npx.ts` 与 `ServerManager` 为子进程补全 node 目录。
- **Pi.app 打包**：standalone 追踪不含 `pi-coding-agent`，导致全局 `pi` 无法运行；`package-macos-app.sh` 增加 `ensure_pi_cli_deps`。

### Changed
- **pi engine**：`@earendil-works/pi-coding-agent` / `pi-ai` 0.79.3 → **0.79.6**。

## [0.8.0] - 2026-06-11

### Added
- **安装即提供 `pi` CLI**：全局安装 pi-app（`npm i -g pi-app`）时，若系统中尚无 `pi` 命令，自动生成一个独立 shim（转发到内置的 `@earendil-works/pi-coding-agent` CLI）；若已有 `pi` 则保留、不覆盖（避免 npm 全局 bin 冲突 `EEXIST` 导致安装失败）。新增 `bin/pi.js` 与 `scripts/{install-cli,uninstall-cli,cli-link-common}.mjs`，`package.json` 注册 `postinstall` / `postuninstall`。

### Changed
- **卸载降级**：npm 不执行 `postuninstall`，卸载 pi-app 后 `pi` shim 会残留；因其为独立 shim 而非失效软链，运行 `pi` 会给出友好提示（重装/删除）而非报错。

## [0.7.0] - 2026-06-07

### Changed
- **Package renamed**: `@agegr/pi-web` → `pi-app` (npm). The `@agegr` scope belonged to another user; we couldn't publish there. Now published under the `livos` npm user.
- **GitHub repo renamed**: `asiachrispy/pi-web` → `asiachrispy/pi-app`. Internal Swift paths unchanged (`Pi.app/Contents/Resources/pi-web/...`) because that's a runtime path inside the .app bundle.
- **CLI binary renamed**: `pi-web` → `pi-app`. Update shell aliases / service units if you used the old name.
- **Documentation sync**: `AGENTS.md`, `README.md`, `docs/advanced-features.md`, and the web-fetch spec (`docs/superpowers/specs/2026-06-06-...`) updated to use the new names. Historical references in old CHANGELOG entries are preserved verbatim.

### Added
- **CI publish workflow**: `.github/workflows/publish-npm.yml` (simpler than the old `release.yml` — no `file:`-dep hack needed because pi-app no longer uses local monorepo paths).
- **Swift CI**: `.github/workflows/swift-build.yml` builds and tests the macOS Swift code (`HiddenWebFetcher`, `PiNativeBridge`) on `macos-14`, in addition to the Node/Next build.
- **Issue templates**: `bug_report.md`, `feature_request.md`, `web_fetch_feedback.md` for triaging T0/T1/T2 issues.

## [0.8.5] - 2026-06-13

**Bundle:** `0.8.5p0.79.3` (pi-app + `@earendil-works/pi-coding-agent`)

### Changed
- **pi engine**: bump `@earendil-works/pi-coding-agent` and `pi-ai` from 0.79.0 → **0.79.3** (Codex context limits, adaptive thinking, overflow error detection — see [earendil-works/pi releases](https://github.com/earendil-works/pi/releases)).
- **Release workflow**: scripts and `AGENTS.md` checklist — every release syncs pi upstream, pins npm pi deps, and publishes GitHub Release with dual-version notes + DMG.

## [0.8.4] - 2026-06-13

### Fixed
- **Preview (Pi.app)**: image copy/save uses the native bridge instead of browser-only APIs.
- **Chat**: reset `initialScrollDone` on session switch so scroll-to-user fires again.
- **Chat**: preserve the first user bubble and sync the sidebar after creating a new session.
- **Skills**: resolve `npx-cli.js` under Homebrew so Pi.app can install skills.
- **Chat**: wire skills into the new-session slash palette; open external links in the system browser.

### Changed
- **Docs**: clean up the docs directory.

## [Unreleased]

### Added
- **Integrated terminal panel**: bottom-drawer terminal (`npm run dev`, `pytest`, `git`, log tail) in the browser. One terminal per project, independent from the agent's `bash` tool. Subprocess-based (no PTY) with a "keep running" mode for long tasks. 1 MB in-memory ring buffer; default 5-minute timeout; 50-command history. Survives drawer close, page refresh, and session switch. Configurable under `terminal.*` in `settings.json`. See `docs/superpowers/specs/2026-06-09-pi-web-terminal-panel-design.md`.
- **M2 conversation UX**: optional「切换前先总结」on branch switch; **从这里另开一版** (fork) vs **复制为新对话** (clone RPC); timeline blocks for compaction and branch summaries; chat top bar session title; Settings **About** with pi-web / pi-coding-agent versions. Docs: [managing-conversations-and-branches.md](docs/managing-conversations-and-branches.md). Pre-flight: `npm run test:m2` (`PI_M2_TEST_SUMMARIZE=1` for branch-summary model path).
- **Remote access (LAN/VPN)**: token + pairing-link auth for non-loopback clients. Config in `~/.pi/agent/pi-web-remote.json`; Settings → Remote access panel with QR pairing, master token rotation, allowed hostnames, and paired-device revoke. API: `GET/POST /api/remote`, `POST /api/remote/pair`. CLI: `pi-web --remote`. See [docs/remote-access.md](docs/remote-access.md).
- **Remote access Phase 2**: Cloudflare/Tailscale tunnel commands in Settings; Web Push on `agent_end` (`/api/push`, `pi-web-push.json`, `public/sw.js`); PWA offline shell via service worker; read-only remote banner via `GET /api/remote/client`.
- **Remote access Phase 3**: E2EE relay tunnel (`lib/pi-relay`, `npm run relay:*`); remote audit log (`pi-web-remote-audit.jsonl`, `GET /api/remote/audit`); device session labels and revoke-all; paired-device management UI polish.
- **Scene config page**: per-scene override editor for `defaultPrompt`, `outputStyle`, and `suggestedStarters`, reachable from a new "Customize scenes" card in WorkbenchSettings. Overrides are persisted to `~/.pi/agent/scene-overrides.json` via `lib/scene-overrides.ts` (atomic tmp + rename write, process-level mutex, defensive JSON parse). New API: `GET /api/scene-overrides`, `PUT/DELETE /api/scene-overrides/[sceneId]` (field limits 16K / 500 / 8 items × 200 chars; `rejectUnsafeMutation` guard; `sanitizePromptInput` on every field).
- **Richer history**: per-row "Details" button in `WorkbenchHistory` opens a new `WorkbenchHistoryDetail` modal showing the full session summary, first user message, started/updated timestamps, cwd, and a link back to the chat. Each session is auto-summarized to a first-sentence title (120-char clamp) by `lib/history-summary.ts`.
- **Smart next step**: after each agent turn, `ChatWindow` computes a `suggestedActionId` via `lib/next-step-suggestion.ts` (four conservative rules: long output → summarize, refine → export, customer-communication followup, draft-reply fallback). The scene header surfaces the next suggested action. Rule priority is long-text > refine→export, and disabled actions are skipped.
- **Centralized action policy**: `lib/scene-action-policy.ts` owns the prompt template per action alias (`refine`, `summarize`, `translate`, `followup`, `export`) and a generic fallback for unknown actions, so the action prompt and the next-step suggestion share one source of truth.

### Changed
- **Agent skill workflow**: append Pi Web guidance to the system prompt so the model matches user requests to installed skills (read SKILL.md or `/skill:name`), and when none fit recommends a `skill:<name>` / skills.sh package for Settings → Skills install instead of improvising or auto-sending.
- **API auth**: Node.js middleware on `/api/*` plus per-route `requireApiAuth`; replaces `PI_WEB_ALLOW_REMOTE_MUTATIONS` (deprecated, still honored temporarily).
- **`getScenes` and `getSceneById` now return a shallow clone of the static scene** (no I/O, no `scene-overrides` read). New `getScenesWithOverrides(map)` and `getSceneByIdWithOverride(id, override)` variants return merged scenes for server-side callers that need to honor `scene-overrides.json` (`app/api/scenes`, `app/api/scenes/[id]`, `app/api/scenes/[id]/launch`). The `mergeSceneWithOverride` helper is exported and unit-tested.
- **`app/api/product-sessions/[id]` metadata**: PATCH endpoint now supports updating `summary` and `lastActionId` on the product-session metadata so the rich-history detail modal and smart next-step suggestion survive page reloads.
- **WorkbenchSettings**: third "Customize scenes" card added alongside Models and Skills, opening the new `SceneConfigEditor` modal. Uses the same `"workbench:scenes"` cache key as WorkbenchHome and invalidates it after every PUT/DELETE so the home view reflects the new merged values immediately.
- **`lib/scenes.ts` static path**: `getScenes` and `getSceneById` now delegate to `mergeSceneWithOverride(scene, null)` instead of inlining the clone, removing the duplicated `{ ...scene, suggestedStarters: [...] }` spread.

### Fixed
- **Dev server hang / blank page**: removed experimental `nodeMiddleware` (Node middleware pulled in `pi-coding-agent` and blocked Next dev). API auth middleware now uses Edge-safe Web Crypto (`lib/middleware-auth.ts`); Bearer tokens still validated in route handlers. Added `requireApiAuth` to unguarded `GET /api/models-config` and `GET /api/skills`. `BranchNavigator` inline mode defined a `chevron` SVG (used in the non-inline sidebar variant) but didn't render it, so the top-bar button looked like a regular toggle. `AppShell`'s System button had no chevron at all. Both now render the same 10×10 chevron rotated 180° when the panel is open.
- **Scene config / history detail modals had semi-transparent backgrounds**: both `SceneConfigEditor` and `WorkbenchHistoryDetail` used `bg-bg-elevated` (92% opacity) for the main modal panel, which let the chat content behind the modal backdrop bleed through and visually compete with the modal's own content. Both now use the new `var(--bg-popover)` (fully opaque, `#ffffff` / `#1c1c1e`).
- **System / Branches dropdown panels were semi-transparent**: both top-bar dropdowns used `background: var(--bg-panel)` (72% opacity, designed for the sidebar / top bar chrome) plus `backdrop-filter: blur`. Because the panels are `position: fixed` overlays that don't cover the full chat area, the underlying chat content (edit / bash / read tool blocks, markdown) bled through at 28% and overlapped the panel text, making the system prompt and branch tree unreadable. Switched both to opaque `var(--bg)` and dropped the redundant `backdrop-filter`; the `boxShadow` already provides the popover separation.
- **Top-bar Branches / System button height overflowed the 38px top bar**: `height: "100%"` + `borderTop: "2px solid var(--accent)"` on a `box-sizing: content-box` button made the actual box 40px tall, pushing the active 2px top border 2px above the top bar. Both buttons now set `box-sizing: border-box` so the border is included in the height and the active accent line aligns with the Home/History/Settings tab strip.
- **Sidebar showed empty after adding a new project + new session**: `handleCwdChange` updated `activeCwd` and `workbenchView` but never bumped `refreshKey`, so the session list (gated on `refreshKey` in `SessionSidebar`'s `loadSessions` effect) was stale when the user switched to a brand-new cwd and then created a session there. Now also calls `setRefreshKey((k) => k + 1)` so the next render re-fetches `/api/sessions` and the freshly created session lands in the cwd-filtered tree without a manual page reload.
- **Project picker auto-opens the most recent session**: clicking a project in the left-sidebar dropdown now selects its most recently modified session (via the new `pickMostRecentSession` helper in `lib/session-projects.ts`) and the chat scrolls to the latest content (`useAgentSession` first-load `scrollToBottom("instant")`). `AppShell.handleCwdChange` short-circuits its reset-to-home step when a matching `selectedSession` is already in place, so the sidebar's auto-select is not undone. Projects with zero sessions still show `WorkbenchHome`, and the cold-start path (default cwd on first load) is unchanged. Spec: [docs/superpowers/specs/2026-06-08-pi-web-auto-open-recent-session-on-project-pick-design.md](docs/superpowers/specs/2026-06-08-pi-web-auto-open-recent-session-on-project-pick-design.md).
- **Redundant Settings entries between sidebar and Settings page**: the sidebar bottom had Models and Skills buttons that duplicated the WorkbenchSettings cards. Removed the bottom row; Models and Skills are now reachable only through the Settings tab (which also includes Customize scenes, usage, and automation).
- **AppShell honored stale scenes after customization**: `handleSelectSession`, `handleOpenSceneById`, `handleOpenHistoryItem`, the initial `?scene=` URL restore effect, and the render-time `activeChatScene` all looked up scenes via the static `getSceneById`, so when a user customized a scene through SceneConfigEditor the chat opened from the sidebar / history / URL still showed the old static starters and output style. All five call sites now go through a new stable `findScene(id)` helper that first reads the shared `"workbench:scenes"` cache (`useCachedResource`, ref-pinned via `scenesRef` to keep the callback identity stable) and falls back to the static lookup only when the cache has no entry. The initial-restore effect now also re-runs when `scenes.data` changes so an override-only scene (visible only in the merged cache) can be restored on first mount.
- **Build error: `child_process` not resolvable in client bundle**: `lib/scenes.ts` previously had a runtime `import { readSceneOverride } from "./scene-overrides"`, which pulled `@earendil-works/pi-coding-agent` (and its `child_process` import) into the client bundle via `AppShell.tsx`. The runtime import is replaced with `import type { SceneOverrides, SceneOverridesMap }`; the override read is performed explicitly by the three server-side API routes that need merged scenes. Build now passes.
- **`normalizeActionId` not exported from `lib/scene-action-policy.ts`**: was a module-private helper, but `lib/next-step-suggestion.ts` imports it for the same alias-lookup logic. Now exported so both files share one source of truth instead of duplicating the id/kebab normalization.
