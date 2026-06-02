// scripts/workbench-smoke.mjs
//
// End-to-end smoke test for the enterprise workbench slices. Exercises:
//   1. Workbench home: scene cards render.
//   2. Scene launch: starter prompt is inserted into the chat input.
//   3. Settings: usage + automation panels render and prepare a run.
//   4. API: /api/usage, /api/automation, /api/automation/run shape.
//
// Run locally (with `npm run dev` on port 30141 first):
//   npm run test:workbench
// Or against a deployed URL:
//   PI_WEB_BASE_URL=https://staging.example.com npm run test:workbench
//
// CI integration notes (see docs/superpowers/ci/smoke.md):
//   - Requires Playwright browsers: `npx playwright install chromium`
//   - Requires the dev server: `npm run dev` or a started build
//   - The script fails fast on any browser console error or page error.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseURL = process.env.PI_WEB_BASE_URL ?? "http://localhost:30141";
const screenshotPath = "output/playwright/workbench-settings-smoke.png";

await mkdir("output/playwright", { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const browserMessages = [];

page.on("console", (msg) => {
  if (["error", "warning"].includes(msg.type())) {
    browserMessages.push(`${msg.type()}: ${msg.text()}`);
  }
});
page.on("pageerror", (err) => {
  browserMessages.push(`pageerror: ${err.message}`);
});

async function expectVisible(locator, label) {
  const target = locator.first();
  await target.waitFor({ state: "visible", timeout: 15000 });
  assert.equal(await target.isVisible(), true, label);
}

try {
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await expectVisible(page.getByText("Enterprise Workbench"), "home workbench label visible");
  await expectVisible(page.getByRole("heading", { name: "Scenes" }), "scene heading visible");
  await expectVisible(page.getByText("Enterprise Knowledge Assistant"), "knowledge scene visible");
  await expectVisible(page.getByText("Report Generation Assistant"), "report scene visible");
  await expectVisible(page.getByText("Customer Communication Assistant"), "customer scene visible");
  await expectVisible(page.getByText("Process Execution Assistant"), "process scene visible");

  await page.getByRole("button", { name: /Enterprise Knowledge Assistant/ }).first().click();
  await expectVisible(page.getByText("Enterprise Knowledge Assistant"), "scene shell visible");
  await expectVisible(page.getByText("Answer internal questions"), "scene description visible");
  await page.getByRole("button", { name: "Answer a policy question" }).click();
  assert.match(
    await page.locator("textarea").inputValue(),
    /Answer this internal policy question/,
    "starter prompt inserted",
  );

  await page.getByRole("button", { name: "Settings" }).click();
  await expectVisible(page.getByRole("heading", { name: "Settings" }), "settings heading visible");
  await expectVisible(page.getByText("Scene visibility"), "usage section visible");
  await expectVisible(page.getByText("Manual operational hooks"), "automation section visible");
  await expectVisible(page.getByText("Weekly report digest"), "weekly automation visible");
  await page.getByRole("button", { name: "Prepare run" }).first().click();
  await expectVisible(page.getByText("Prompt is ready for scene execution."), "prepared run visible");
  await expectVisible(page.getByText("Automation: Weekly report digest"), "prepared automation prompt visible");
  await expectVisible(page.getByText("Scene: Report Generation Assistant"), "prepared scene prompt visible");

  const usageRes = await page.request.get(`${baseURL}/api/usage`);
  assert.equal(usageRes.ok(), true, "usage API ok");
  const usage = await usageRes.json();
  assert.deepEqual(Object.keys(usage.usage).sort(), [
    "activeRuns",
    "byScene",
    "completedRuns",
    "generalRuns",
    "generatedAt",
    "sceneAdoptionRate",
    "sceneRuns",
    "totalRuns",
  ].sort(), "usage API shape");

  const automationRes = await page.request.get(`${baseURL}/api/automation`);
  assert.equal(automationRes.ok(), true, "automation API ok");
  const automation = await automationRes.json();
  assert.deepEqual(automation.automation.map((entry) => entry.id), [
    "weekly-report-digest",
    "customer-follow-up-draft",
    "process-review-checklist",
  ], "automation IDs");

  const runRes = await page.request.post(`${baseURL}/api/automation/run`, {
    data: { automationId: "weekly-report-digest", input: "Smoke test input" },
  });
  assert.equal(runRes.ok(), true, "automation run API ok");
  const run = await runRes.json();
  assert.match(run.prompt, /Automation: Weekly report digest/, "run prompt includes automation");
  assert.match(run.prompt, /Smoke test input/, "run prompt includes input");

  await page.screenshot({ path: screenshotPath, fullPage: true });

  if (browserMessages.length > 0) {
    throw new Error(`Browser console/page messages:\n${browserMessages.join("\n")}`);
  }

  console.log(JSON.stringify({
    baseURL,
    slices: [
      "scene homepage + scene launch",
      "usage visibility + automation hooks",
    ],
    screenshot: screenshotPath,
    api: {
      usage: usageRes.status(),
      automation: automationRes.status(),
      automationRun: runRes.status(),
    },
  }, null, 2));
} finally {
  await browser.close();
}
