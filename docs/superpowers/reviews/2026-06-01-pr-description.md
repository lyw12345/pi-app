# pi-web Enterprise Workbench — Phase 1

> **Branch:** `codex/enterprise-workbench-implementation` → `main`
> **Scope:** This PR closes the first two slices of the Enterprise Workbench implementation plan and lands the review fixes that came out of the workbench review session.

## What this PR delivers

### Product

`pi-web` no longer opens to "new chat." It opens to a **scene portal** that exposes four business tasks, each with its own context, output style, and allowed actions:

- **Enterprise Knowledge Assistant** — Q&A against curated sources.
- **Report Generation Assistant** — structured reports, summaries, exports.
- **Customer Communication Assistant** — reply drafting, follow-ups, translations.
- **Flow Execution Assistant** — repeated automations, prompt templates.

Each scene is a first-class product object. Sessions, sources, and actions hang off scenes; the underlying agent runtime is unchanged.

### Architecture

- **Scene domain model** in `lib/scenes.ts` with sources, actions, output style, suggested starters, and product session metadata.
- **Control APIs** layered on top of the existing session API:
  - `GET /api/scenes` and `GET /api/scenes/[id]`
  - `POST /api/scenes/[id]/launch`
  - `GET /api/history` and `GET /api/history/[id]`
  - `GET /api/usage` and `GET /api/automation` and `POST /api/automation/run`
- **Workbench UI** in `components/WorkbenchHome.tsx`, `WorkbenchHistory.tsx`, `WorkbenchSettings.tsx`. `AppShell` now hosts the scene portal as the default route and exposes `History` / `Settings` as secondary tabs.
- **Per-scene launcher** that pipes the scene's purpose, sources, and actions into the prompt at launch time.

## Why this PR is bigger than "add a home page"

This is the first slice that reframes `pi-web` from "agent session UI" to "enterprise AI workbench." The product must keep working as a chat app — non-developer users are the audience — so every change is designed to layer on top of the existing session runtime, not replace it. None of the agent-side APIs in `pi-coding-agent` were modified.

## Review fixes included in this PR

The four review waves (see [merge-checklist.md](file:///Users/mk/codespace/pi-web/docs/superpowers/reviews/2026-06-01-merge-checklist.md)) collapsed as follows:

| Wave | Files | Why |
| --- | --- | --- |
| `fix(runtime)` | `app/api/scenes/[id]/launch/route.ts`, `components/ChatWindow.tsx` | UUID `tempKey` + per-scene launch mutex; kill inline `import()` type expressions |
| `feat(workbench)` | `hooks/useControlCollection.ts`, `components/WorkbenchHome.tsx`, `components/WorkbenchSettings.tsx` | Stale-while-revalidate cache layer; explicit loading / error / retry; `invalidateControlResource` on actions that should refresh views |
| `refactor(runtime)` | `lib/rpc-manager.ts`, `app/api/files/[...path]/route.ts`, `hooks/useAgentSession.ts` | Top-level static imports across production code; test files keep `vi.mock`-needed `await import()` |
| `feat(prompt)` | `lib/prompt-guard.ts`, `lib/scenes.ts`, `lib/automation.ts` | 16 KB clamp + control-char strip + truncation marker on every user-supplied field that reaches a model prompt |
| `fix(metadata)` | `lib/scene-metadata.ts`, callers | Process-level write queue; atomic temp+rename; back-compat alias preserves the old call sites |
| `feat(scene-ui)` | `lib/scene-action-policy.ts`, `components/ChatWindow.tsx`, `lib/scenes.ts` | Action policy is no longer a hand-rolled `Use the latest result and ${action.description}`; `outputStyle` is now `summarizeOutputStyle()` for compact subtitles |
| `docs(test)` | `docs/superpowers/ci/smoke.md`, test files | 30+ new unit tests; smoke CI playbook |

## Test plan

```bash
node_modules/.bin/tsc --noEmit   # 0 errors
node_modules/.bin/vitest run     # 11 files, 57 tests, all pass
npm run test:workbench           # Playwright smoke (dev server required)
```

Coverage additions:

- `hooks/useControlCollection.test.ts` — cache, dedupe, stale, force, retry, invalidate
- `lib/prompt-guard.test.ts` — clamp, control chars, ellipsis, marker, blank-line collapse, long-line fold
- `lib/scene-action-policy.test.ts` — enabled, disabled, alias, label-fallback, generic fallback, null `latestText`
- `lib/scenes.test.ts` — order assertion, `titleFromMessage`, `summarizeOutputStyle`, sanitization
- `lib/automation.test.ts` — sanitization of `input` and `requestedBy`

Manual smoke checklist:

- [ ] Open the home page; all four scenes render as cards.
- [ ] Click each scene; starter prompts insert into the input without forcing submit.
- [ ] Submit a starter; assistant responds; `outputStyle` subtitle is short and readable.
- [ ] Hit a known scene action (`Refine`, `Summarize`); the prompt is replaced with a properly templated instruction.
- [ ] Open Settings; usage and automation panels render; prepare run shows the templated prompt.
- [ ] Refresh mid-stream on a launched scene; SSE reconnects.

## Risk

- `scene-action-policy` is currently a **prompt policy**, not a full **execution policy**. Actions still route through the chat input. The contract for non-`prompt` actions (export, send, modal trigger) is left for the next slice. See the merge checklist for the follow-up issue.
- `product-sessions.json` is still a single JSON file. The mutex + atomic write is enough for current scale; SQLite is a future concern.

## Out of scope (intentionally)

- Provider / accounts / OAuth UI (next slice)
- Full channel system (no)
- Per-user permissions / RBAC (no)
- Localization (no)
- Smoke job running in CI (documented, not wired — separate ticket)

## Checklist

- [x] `tsc --noEmit` clean
- [x] `vitest run` clean
- [x] No new `await import()` in production code
- [x] No new `any`
- [x] Spec / PRD / plan alignment verified (see merge checklist)
- [x] Follow-up issues filed or noted in checklist

## Related

- Spec: [2026-06-01-pi-web-enterprise-workbench-design.md](file:///Users/mk/codespace/pi-web/docs/superpowers/specs/2026-06-01-pi-web-enterprise-workbench-design.md)
- PRD: [2026-06-01-pi-web-enterprise-workbench-prd.md](file:///Users/mk/codespace/pi-web/docs/superpowers/prd/2026-06-01-pi-web-enterprise-workbench-prd.md)
- Plan: [2026-06-01-pi-web-enterprise-workbench-implementation-plan.md](file:///Users/mk/codespace/pi-web/docs/superpowers/plans/2026-06-01-pi-web-enterprise-workbench-implementation-plan.md)
- Merge checklist: [2026-06-01-merge-checklist.md](file:///Users/mk/codespace/pi-web/docs/superpowers/reviews/2026-06-01-merge-checklist.md)
- Smoke CI doc: [smoke.md](file:///Users/mk/codespace/pi-web/docs/superpowers/ci/smoke.md)
