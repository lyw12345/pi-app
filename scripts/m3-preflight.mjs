// M3 pre-flight smoke (API + get_commands + usage timeline + export).
// Requires pi-web on PI_WEB_BASE_URL (default http://127.0.0.1:30142).
//
//   npm run test:m3
import assert from "node:assert/strict";

const baseURL = process.env.PI_WEB_BASE_URL ?? "http://127.0.0.1:30142";

async function getJson(path, init) {
  const res = await fetch(`${baseURL}${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${path} HTTP ${res.status}: ${body.error ?? JSON.stringify(body)}`);
  }
  return body;
}

async function agentCommand(sessionId, command) {
  const body = await getJson(`/api/agent/${encodeURIComponent(sessionId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  assert.equal(body.success, true, `agent ${command.type}`);
  return body.data;
}

function pickSmallSession(sessions) {
  const sorted = [...sessions].sort((a, b) => a.messageCount - b.messageCount);
  return sorted.find((s) => s.messageCount >= 1 && !s.orphaned) ?? sorted[0];
}

const health = await getJson("/api/health");
assert.equal(health.ok, true);
assert.ok(health.version, "pi-web version");
assert.ok(health.piVersion, "pi-coding-agent version");

const prefPut = await getJson("/api/preferences", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ showSlashCommands: true }),
});
assert.equal(prefPut.preferences?.showSlashCommands, true);
await getJson("/api/preferences", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ showSlashCommands: false }),
});

const usage = await getJson("/api/usage?days=7");
assert.ok(usage.usage, "usage summary");
assert.ok(usage.timeline?.days, "usage timeline");
assert.equal(usage.timeline.days.length, 7, "seven day buckets");

const { sessions } = await getJson("/api/sessions");
assert.ok(sessions.length > 0, "at least one session");
const source = pickSmallSession(sessions);

const commands = await agentCommand(source.id, { type: "get_commands" });
assert.ok(Array.isArray(commands.commands), "commands array");

const exportRes = await fetch(`${baseURL}/api/agent/${encodeURIComponent(source.id)}/export.html`);
assert.equal(exportRes.status, 200, "export html status");
const html = await exportRes.text();
assert.ok(html.includes("<"), "html body");

console.log(JSON.stringify({
  baseURL,
  health: { version: health.version, piVersion: health.piVersion },
  usageDays: usage.timeline.days.length,
  commandCount: commands.commands.length,
  exportBytes: html.length,
  sessionId: source.id,
}, null, 2));
