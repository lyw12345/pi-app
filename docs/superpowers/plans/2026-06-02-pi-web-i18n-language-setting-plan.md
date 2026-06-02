# pi-web — UI i18n And Language Setting (Implementation Plan)

Date: 2026-06-02
Project: `pi-web`
Status: Draft
Slice spec: `docs/superpowers/specs/2026-06-02-pi-web-i18n-language-setting-design.md`

## 1. Objective

Implement the approved i18n slice: add a global language setting for English and Simplified Chinese, persist the selected locale locally, and migrate all product-owned UI copy onto a centralized translation layer without changing backend contracts.

## 2. Delivery Principles

- Build bottom-up: locale primitives first, then root provider wiring, then product surfaces in bounded passes.
- Keep the app usable after every step; missing keys must fall back to English rather than break rendering.
- Do not introduce new external i18n dependencies.
- Match existing codebase conventions: top-level imports only, no `any`, no runtime API contract changes.
- Treat accessibility copy (`aria-label`, empty states, loading text, button labels) as first-class translation targets.

## 3. Step Plan

### Step 1 — Create the i18n core + tests

Tasks:

- Add a new lightweight i18n module under `lib/i18n/`.
- Define `AppLocale = "en" | "zh-CN"` and `LOCALE_STORAGE_KEY = "pi-web.locale"`.
- Implement `resolveInitialLocale()` using this precedence:
  1. valid `localStorage` locale
  2. browser language (`navigator.language` / `navigator.languages[0]`)
  3. `zh* -> zh-CN`, otherwise `en`
- Implement dictionary lookup + English fallback + key fallback.
- Add dev-only `console.warn` for missing keys (warn once per key/locale pair).
- Add `lib/i18n/*.test.ts` covering locale resolution and translation fallback.

Validation:

- `node_modules/.bin/vitest run lib/i18n`
- `node_modules/.bin/tsc --noEmit`

### Step 2 — Add `LocaleProvider` at the app root

Tasks:

- Add a client-side provider and `useI18n()` hook exposing `locale`, `setLocale`, and `t()`.
- Wrap the app root (`app/layout.tsx` or the existing root provider entry) with `LocaleProvider`.
- Ensure initial locale is resolved synchronously during state initialization to avoid English->Chinese flash.
- Persist locale changes to `localStorage`.

Validation:

- `node_modules/.bin/tsc --noEmit`
- Relevant `vitest` tests for provider/hook behavior

### Step 3 — Add the Settings language control

Tasks:

- Update `components/WorkbenchSettings.tsx` to add a new language setting surface.
- Use an inline segmented control / pill toggle with two values:
  - `English`
  - `简体中文`
- Make switching immediate and global.
- Translate the Settings page title, descriptions, and the new language selector UI.

Validation:

- Targeted component test for language switching and persistence
- `node_modules/.bin/tsc --noEmit`

### Step 4 — Migrate root shell and navigation copy

Tasks:

- Update `components/AppShell.tsx`
- Update `components/SessionSidebar.tsx`
- Update `components/BranchNavigator.tsx`
- Update `components/TabBar.tsx`
- Replace all product-owned visible strings, titles, aria labels, and empty/loading text with `t()` keys.

Validation:

- `node_modules/.bin/tsc --noEmit`
- `npm run lint`

### Step 5 — Migrate workbench page copy

Tasks:

- Update `components/WorkbenchHome.tsx`
- Update `components/WorkbenchHistory.tsx`
- Update `components/WorkbenchHistoryDetail.tsx`
- Update `components/WorkbenchSettings.tsx` remaining text
- Translate page headings, descriptions, cards, empty states, actions, and accessibility labels.

Validation:

- Relevant targeted component tests
- `node_modules/.bin/tsc --noEmit`

### Step 6 — Migrate configuration surfaces

Tasks:

- Update `components/ModelsConfig.tsx`
- Update `components/SkillsConfig.tsx`
- Update `components/SceneConfigEditor.tsx`
- Centralize all product-owned labels, helper text, success/error notices, buttons, and aria labels.
- Keep external identifiers (model IDs, provider IDs, skill IDs, scene IDs) untranslated.

Validation:

- Relevant targeted component tests
- `node_modules/.bin/tsc --noEmit`
- `npm run lint`

### Step 7 — Migrate chat/file chrome

Tasks:

- Update `components/ChatInput.tsx`
- Update `components/MessageView.tsx` (product chrome only, not transcript/tool payload bodies)
- Update `components/FileViewer.tsx`
- Update `components/FileExplorer.tsx`
- Translate action buttons, tabs, placeholders, loading labels, empty states, and accessibility copy.

Validation:

- `node_modules/.bin/tsc --noEmit`
- Relevant targeted component tests

### Step 8 — Hardcoded-string audit and final pass

Tasks:

- Grep the codebase for remaining hardcoded UI strings in product components.
- Confirm any remaining literals are either:
  - non-user-facing identifiers, or
  - intentionally untranslated external values.
- Fill gaps in `messages/en.ts` and `messages/zh-CN.ts`.
- Run final validation.

Validation:

- `node_modules/.bin/tsc --noEmit`
- `npm run lint`
- Relevant `vitest` runs for i18n core + touched component tests

## 4. Suggested File Layout

New:

- `lib/i18n/index.ts`
- `lib/i18n/messages/en.ts`
- `lib/i18n/messages/zh-CN.ts`
- `lib/i18n/*.test.ts`

Modified (expected, non-exhaustive):

- `app/layout.tsx`
- `components/AppShell.tsx`
- `components/SessionSidebar.tsx`
- `components/BranchNavigator.tsx`
- `components/TabBar.tsx`
- `components/WorkbenchHome.tsx`
- `components/WorkbenchHistory.tsx`
- `components/WorkbenchHistoryDetail.tsx`
- `components/WorkbenchSettings.tsx`
- `components/ModelsConfig.tsx`
- `components/SkillsConfig.tsx`
- `components/SceneConfigEditor.tsx`
- `components/ChatInput.tsx`
- `components/MessageView.tsx`
- `components/FileViewer.tsx`
- `components/FileExplorer.tsx`

## 5. Validation

Run from `/Users/mk/codespace/pi-web`:

- `node_modules/.bin/tsc --noEmit`
- `npm run lint`
- Relevant targeted `vitest` runs for new/modified i18n and component tests

Do not run `next build` unless explicitly requested.

## 6. Commit Grouping

```text
feat(i18n): add locale provider and translation dictionaries
feat(settings): add global language switcher
feat(workbench): localize shell and workbench surfaces
feat(config): localize models skills and scene settings surfaces
feat(chrome): localize chat and file chrome plus accessibility labels
```

Each commit should keep `tsc --noEmit` and the relevant targeted tests green.

## 7. Out Of Scope (Reminder)

- Route-based locale prefixes
- Backend-persisted user language profiles
- Additional locales beyond English and Simplified Chinese
- Translating session content, tool payloads, file bodies, and agent/system prompt bodies
- Adopting `next-intl` / `i18next` in this slice
