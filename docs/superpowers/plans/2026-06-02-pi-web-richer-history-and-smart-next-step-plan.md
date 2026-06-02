# pi-web — Richer History & Smart Next Step (Implementation Plan)

Date: 2026-06-02
Project: `pi-web`
Status: Draft
Slice spec: `docs/superpowers/specs/2026-06-02-pi-web-richer-history-and-smart-next-step-design.md`

## 1. Objective

Execute the slice defined in the design spec. The slice wires the assistant-message lifecycle to `ProductSessionMetadata` and adds a conservative "smart next step" highlight in `SceneHeader`.

## 2. Delivery Principles

- Build bottom-up: pure library modules first, then the API route, then the React wiring.
- Validate each layer with tests before moving to the next.
- Never break `tsc --noEmit` between steps.
- Match the existing module patterns: top-level static imports, `globalThis`-keyed caches when needed, no inline `await import()` in production code, no new `any`.

## 3. Step Plan

### Step 1 — `lib/history-summary.ts` + tests

Tasks:

- Create `lib/history-summary.ts` exporting `summarizeForHistory(text, maxLength = 120)`.
- Reuse `sanitizePromptInput` from `@/lib/prompt-guard` for control-char and oversized-input defense.
- Create `lib/history-summary.test.ts` with the 8 cases listed in the spec §9.

Validation:

- `node_modules/.bin/vitest run lib/history-summary.test.ts` passes.
- `node_modules/.bin/tsc --noEmit` passes.

### Step 2 — `lib/next-step-suggestion.ts` + tests

Tasks:

- Create `lib/next-step-suggestion.ts` exporting `suggestNextStep(latestText, scene, lastActionId)`.
- Import `normalizeActionId` from `@/lib/scene-action-policy`.
- Implement the 4 rules from spec §7 in priority order.
- Create `lib/next-step-suggestion.test.ts` with the 12 cases listed in spec §9.

Validation:

- `node_modules/.bin/vitest run lib/next-step-suggestion.test.ts` passes.
- `node_modules/.bin/tsc --noEmit` passes.

### Step 3 — `app/api/product-sessions/[id]/route.ts` + tests

Tasks:

- Create the route handler for `PATCH /api/product-sessions/[id]`.
- Parse and validate the body (hand-written validator; no new schema dependency).
- Call `readProductSessionMetadata` then `upsertProductSessionMetadata` from `@/lib/scene-metadata`.
- Return 200 on success, 400 on invalid body, 404 when no existing record, 500 on filesystem failure.
- Create the route test file with 5 cases using `vi.mock` to stub `scene-metadata`.

Validation:

- `node_modules/.bin/vitest run app/api/product-sessions` passes.
- `node_modules/.bin/tsc --noEmit` passes.

### Step 4 — Wire `components/ChatWindow.tsx`

Tasks:

- Add a `lastActionIdRef` and update it inside `runSceneAction` for `prompt`-type actions.
- Add `suggestedActionId = useMemo(() => suggestNextStep(latestAssistantText, scene, lastActionIdRef.current), [...])`.
- Add a `scheduleMetadataUpdate` helper that does the PATCH call, fire-and-forget, with try/catch and `console.warn`.
- Invoke the helper from the existing `onAgentEnd` callback.
- Pass `suggestedActionId` and the new `lastResultSummary` to `SceneHeader`.
- Update `SceneHeader` to:
  - Highlight the action whose id matches `suggestedActionId` with `border-accent` and a small `Suggested` text label.
  - Render `lastResultSummary` as a single-line subtitle (CSS `line-clamp`).
- Call `invalidateControlResource("workbench:history:recent")` after a successful PATCH.

Validation:

- `node_modules/.bin/tsc --noEmit` passes.
- `npm run lint` does not introduce new warnings.
- No new `any`. No new `await import()` in production code.

### Step 5 — Full test pass

Tasks:

- Run the full vitest suite: `node_modules/.bin/vitest run`.
- Confirm existing 57+ tests still pass plus the new ~25 cases.
- Run `node_modules/.bin/tsc --noEmit`.
- Run `npm run lint`.

## 4. Commit Grouping

```
feat(history): add summarizeForHistory helper for runtime-derived summaries
feat(scenes): add conservative next-step suggestion rule
feat(metadata): add PATCH endpoint for product session metadata
feat(chat): wire assistant message lifecycle to metadata updates and next-step highlight
```

Each commit is independently reviewable and keeps `tsc --noEmit` + the full vitest suite green at every step.

## 5. Files Touched

New (6):

- `lib/history-summary.ts`
- `lib/history-summary.test.ts`
- `lib/next-step-suggestion.ts`
- `lib/next-step-suggestion.test.ts`
- `app/api/product-sessions/[id]/route.ts`
- `app/api/product-sessions/[id]/route.test.ts`

Modified (1):

- `components/ChatWindow.tsx`

No new dependencies, no docs added.

## 6. Validation

Run from the repo root:

- `node_modules/.bin/tsc --noEmit` — zero errors
- `node_modules/.bin/vitest run` — all tests green
- `npm run lint` — no new warnings

Per [AGENTS.md](file:///Users/mk/codespace/pi-web/AGENTS.md), do not run `next build` or the full vitest suite in a way that triggers e2e tests.

## 7. Out Of Scope (Reminder)

- Backend agent-side metadata writes.
- History detail page.
- Scene configuration editing (PRD §14 MVP-3).
- i18n.
- `automation/run` metadata writes.
- Wiring the smoke script into CI.
