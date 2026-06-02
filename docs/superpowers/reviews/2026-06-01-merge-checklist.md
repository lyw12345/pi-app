# Workbench — Merge Checklist (2026-06-01)

Pre-merge checklist for the four review waves applied to `codex/enterprise-workbench-implementation`. This is a single-page, single-purpose artifact. Do not extend it; cut a new one for the next slice.

## Status

- Branch: `codex/enterprise-workbench-implementation`
- Target: `main`
- Working tree: 19 modified, 7 added (4 lib/hook files, 3 test files, 1 doc)
- Upstream codex commits: 3 (scenes / usage+automation / smoke)
- Local review commits: 0 — all changes are in working tree, not yet committed

---

## 1. Mechanical gates

Run from repo root. Tick each before requesting review.

- [ ] `node_modules/.bin/tsc --noEmit` exits 0 with no errors
- [ ] `node_modules/.bin/vitest run` exits 0, 57+ tests pass
- [ ] `git status` shows only files in §3 (no surprise deletes, no third-party files)
- [ ] `git diff --stat` is roughly the size listed in §3
- [ ] No `console.log` left in production code (only `console.warn` allowed, see [WorkbenchSettings.tsx](file:///Users/mk/codespace/pi-web/components/WorkbenchSettings.tsx))
- [ ] No new `await import()` in production code (test files may keep them for `vi.mock`)
- [ ] No `any` introduced; existing `as ToolResultMessage` casts untouched

## 2. Spec alignment

- [ ] `Scene` is still the primary product object, not `Session`
- [ ] Home page is still a scene portal, not a "new chat" page
- [ ] All four launch scenes render in `WorkbenchHome` (knowledge / report / customer / flow)
- [ ] `ChatWindow.SceneHeader` is rendered only when `scene` is non-null
- [ ] `useAgentSession` still routes through `startRpcSession` (no second runtime)
- [ ] No new heavyweight admin pages slipped in (no RBAC, no full channel stack, no Settings > Provider)

## 3. Files in this batch

### Modified (19)

| File | What changed |
| --- | --- |
| `app/api/files/[...path]/route.ts` | Replaced `await import("os"/"fs")` with top-level static imports |
| `app/api/history/route.ts` | Renamed import to `readProductSessionMetadataMap` |
| `app/api/history/[id]/route.ts` | Renamed import to `readProductSessionMetadataMap` |
| `app/api/scenes/[id]/launch/route.ts` | UUID temp key + per-scene launch mutex + `await upsertProductSessionMetadata` |
| `app/api/sessions/[id]/route.ts` | Renamed import to `readProductSessionMetadataMap` |
| `app/api/usage/route.ts` | Renamed import to `readProductSessionMetadataMap` |
| `components/ChatWindow.tsx` | Top-level type imports; `runSceneAction` → `buildActionPrompt`; SceneHeader `outputStyle` → `summarizeOutputStyle` |
| `components/WorkbenchHome.tsx` | `useCachedResource` for scenes + recent history; explicit loading/error; `summarizeOutputStyle` |
| `components/WorkbenchSettings.tsx` | `useCachedResource` for usage + automation; `prepareError` separate from main error |
| `hooks/useAgentSession.ts` | Static `import { PRESET_NONE, ... }` from `@/components/ToolPanel` |
| `lib/automation.test.ts` | 1 sanitization assertion added |
| `lib/automation.ts` | `requestedBy` and `input` go through `sanitizePromptInput` |
| `lib/rpc-manager.ts` | Static imports for `findCutPoint` / `DEFAULT_COMPACTION_SETTINGS` / `getAgentDir` / `SessionManager` |
| `lib/scene-metadata.ts` | Mutex on writes; atomic write via temp + rename; back-compat alias |
| `lib/scenes.test.ts` | Order assertion + `titleFromMessage` + `summarizeOutputStyle` + sanitization assertions |
| `lib/scenes.ts` | `sanitizePromptInput` for `buildSceneLaunchMessage` and `titleFromMessage`; new `summarizeOutputStyle` |
| `lib/session-reader.ts` | Renamed import to `readProductSessionMetadataMap` |
| `scripts/workbench-smoke.mjs` | Documented header; no behavior change |
| `vitest.config.ts` | `resolve.alias` for `@/` |

### Added (7)

| File | Purpose |
| --- | --- |
| `hooks/useControlCollection.ts` | SWR-style cache + dedupe + retry; `globalThis.__piControlCache` |
| `hooks/useControlCollection.test.ts` | 7 unit tests (cache, dedupe, stale, force, retry, invalidate) |
| `lib/prompt-guard.ts` | `sanitizePromptInput` + `joinPromptSections` |
| `lib/prompt-guard.test.ts` | 17 unit tests |
| `lib/scene-action-policy.ts` | Centralizes action → prompt rendering |
| `lib/scene-action-policy.test.ts` | 6 unit tests |
| `docs/superpowers/ci/smoke.md` | CI playbook for `workbench-smoke.mjs` |

## 4. Risk register (post-fix)

| Risk | Status | Notes |
| --- | --- | --- |
| `tempKey` collision on concurrent launch | Mitigated | UUID + per-(scene,cwd) mutex |
| `readProductSessionMetadata` rename broke callers | Mitigated | 5 callers migrated; back-compat alias kept |
| Product metadata lost-write on concurrent upsert | Mitigated | Process-level queue + atomic temp/rename |
| Stale `scenes` / `usage` data after user action | Mitigated | `invalidateControlResource` on launch and on automation prepare |
| Silent error in `WorkbenchHome.history` | Mitigated | UI now shows the error + Retry |
| XSS / oversized input in scene/automation prompts | Mitigated | `sanitizePromptInput` (16 KB clamp, control char strip, marker) |
| Untracked third-party file changes | Verified clean | `git status` matches the 19+7 list above |
| `vi.mock` accidentally broken by static import | Verified | All 4 test-file `await import()` retained |
| Scene header still shows raw `outputStyle` | Mitigated | Switched to `summarizeOutputStyle` in `ChatWindow` and `WorkbenchHome` |

## 5. Known follow-ups (not in this batch)

| Item | Reason deferred |
| --- | --- |
| L4 visual icon consistency for `Models` / `Skills` sidebar | Visual polish; regression risk outweighs value |
| Wire `scene-action-policy` to non-`prompt` actions (export, send, open modal) | Requires product decisions on action contract |
| Smoke job actually running in CI | Requires GitHub Actions wiring; doc-only ready |
| Move `product-sessions.json` to SQLite or per-cwd file | Single-file JSON is fine at current scale |
| Localization (i18n) for workbench strings | Out of scope for first merge |

## 6. Suggested commit grouping

```
fix(runtime): serialize scene launch and clean inline imports
feat(workbench): add cached control resource layer for home/settings
refactor(runtime): replace production await import() with static imports
feat(prompt): add prompt guard and sanitize scene/automation input
fix(metadata): serialize product metadata writes and write atomically
feat(scene-ui): centralize scene action prompt policy and wire ChatWindow to it
docs(test): add smoke CI playbook and extend unit coverage
```

Each group is independently reviewable and `tsc --noEmit` + `vitest run` pass after each.

## 7. Pre-merge actions for the human

- [ ] Run `git add` per-group, **not** `git add -A` (per AGENTS.md)
- [ ] Verify `git status` shows only files in §3
- [ ] Run `npm run check` if the repo's `check` script is wired (AGENTS.md says full output, no tail)
- [ ] Push branch, open PR
- [ ] Drop the PR description from [pr-description.md](file:///Users/mk/codespace/pi-web/docs/superpowers/reviews/2026-06-01-pr-description.md) into the PR body
- [ ] Request review

## 8. After merge

- [ ] Open follow-up issue: "wire smoke job to CI"
- [ ] Open follow-up issue: "scene action execution policy" (action → behavior, not just prompt)
- [ ] Open follow-up issue: "i18n for workbench strings"
