// M4 pre-flight smoke (extensions + scene pack + export sanitize).
// Requires pi-web on PI_WEB_BASE_URL (default http://127.0.0.1:30142).
//
//   npm run test:m4
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const baseURL = process.env.PI_WEB_BASE_URL ?? "http://127.0.0.1:30142";

async function getJson(path, init) {
  const res = await fetch(`${baseURL}${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${path} HTTP ${res.status}: ${body.error ?? JSON.stringify(body)}`);
  }
  return body;
}

function pickSmallSession(sessions) {
  const sorted = [...sessions].sort((a, b) => a.messageCount - b.messageCount);
  return sorted.find((s) => s.messageCount >= 1 && !s.orphaned) ?? sorted[0];
}

const health = await getJson("/api/health");
assert.equal(health.ok, true);

const extensions = await getJson("/api/extensions");
assert.ok(Array.isArray(extensions.extensions), "extensions array");

const exportRes = await fetch(`${baseURL}/api/scene-overrides/export`);
assert.equal(exportRes.status, 200, "scene pack export status");
const pack = JSON.parse(await exportRes.text());
assert.equal(pack.schemaVersion, 1);

const fixturePath = join(process.cwd(), "docs/fixtures/m4-scene-pack-v1.example.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const preview = await getJson("/api/scene-overrides/import", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ pack: fixture, preview: true }),
});
assert.equal(preview.preview, true);
assert.ok(Array.isArray(preview.changes), "import preview changes");

const { sessions } = await getJson("/api/sessions");
if (sessions.length > 0) {
  const source = pickSmallSession(sessions);
  const htmlRes = await fetch(`${baseURL}/api/agent/${encodeURIComponent(source.id)}/export.html`);
  assert.equal(htmlRes.status, 200, "export html status");
  const html = await htmlRes.text();
  assert.ok(html.includes("<"), "html body");
  assert.ok(!/\bsk-[A-Za-z0-9_-]{8,}\b/.test(html), "html should not contain raw api keys");
}

console.log(JSON.stringify({
  baseURL,
  extensionCount: extensions.extensions.length,
  previewChanges: preview.changes.length,
}, null, 2));
