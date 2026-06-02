# Workbench Smoke Test — CI Integration

The workbench smoke script `scripts/workbench-smoke.mjs` is the cheapest end-to-end check we have. It boots a headless Chromium against a running pi-web server, asserts that the home page lists the four launch scenes, that a scene launch inserts a starter prompt, and that `/api/usage` + `/api/automation` + `/api/automation/run` return the expected shapes.

This document is **not** a CI config. It tells the next person wiring CI exactly what the script needs so they don't have to spelunk through the code.

## Local run

```bash
# 1. Install dependencies (Playwright + Chromium)
npm install
npx playwright install chromium

# 2. Start the dev server on 30141
npm run dev

# 3. In another shell
npm run test:workbench
```

To smoke against a deployed instance:

```bash
PI_WEB_BASE_URL=https://staging.example.com npm run test:workbench
```

## CI steps (drop-in)

```yaml
- name: Install deps
  run: npm ci --ignore-scripts
- name: Install Playwright browsers
  run: npx playwright install --with-deps chromium
- name: Build pi-web
  run: npm run build
- name: Start pi-web
  run: npm run start &
  # wait for the server to be ready; in GitHub Actions use a small wait-on
- name: Workbench smoke
  run: npm run test:workbench
- name: Upload screenshot on failure
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: workbench-smoke-screenshot
    path: output/playwright/workbench-settings-smoke.png
```

Notes:

- The script's `screenshot` step saves a full-page PNG to `output/playwright/workbench-settings-smoke.png`. Wire that to an `actions/upload-artifact` step on failure so the failure is debuggable.
- The script collects `console` errors and `pageerror` events; any of those cause it to fail with a dump of all messages. Treat that as a hard signal — silent browser errors should not be tolerated.
- The script does **not** seed a fake agent session. A real `startRpcSession` will be triggered the first time the user clicks a scene. CI should run a build with stable dependencies and a known model key configured, or stub the launch step at the API level for the smoke run.

## When to skip

Skip the smoke job when the diff is:

- A doc-only change.
- A unit test-only change with no production code touched.
- A pure infra change (CI, release script).

Do not skip the smoke job when the diff touches:

- Anything under `app/`, `components/`, `lib/`, `hooks/`.
- The smoke script itself.
- `package.json` runtime dependencies.
