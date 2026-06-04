// M2 pre-flight smoke (API + optional branch summarize).
// Requires pi-web on PI_WEB_BASE_URL (default http://127.0.0.1:30142).
//
//   npm run test:m2
//   PI_M2_TEST_SUMMARIZE=1 npm run test:m2   # calls model; slow, needs auth
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

function hasFork(nodes) {
  for (const n of nodes) {
    if (n.children?.length > 1) return true;
    if (n.children?.length && hasFork(n.children)) return true;
  }
  return false;
}

function collectLeaves(nodes, out = []) {
  for (const n of nodes) {
    if (!n.children?.length) out.push(n.entry.id);
    else collectLeaves(n.children, out);
  }
  return out;
}

function pickSmallSession(sessions) {
  const sorted = [...sessions].sort((a, b) => a.messageCount - b.messageCount);
  return sorted.find((s) => s.messageCount >= 2 && !s.orphaned) ?? sorted[0];
}

function pickForkSession(sessions) {
  return (
    sessions.find((s) => s.messageCount >= 4 && !s.orphaned)
    ?? sessions.find((s) => s.messageCount >= 2 && !s.orphaned)
    ?? sessions[0]
  );
}

// --- health ---
const health = await getJson("/api/health");
assert.equal(health.ok, true);
assert.ok(health.version, "pi-web version");
assert.ok(health.piVersion, "pi-coding-agent version");

// --- preferences ---
const prefPut = await getJson("/api/preferences", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ branchSummarizeBeforeSwitch: true }),
});
assert.equal(prefPut.preferences?.branchSummarizeBeforeSwitch, true);
await getJson("/api/preferences", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ branchSummarizeBeforeSwitch: false }),
});

// --- sessions list ---
const { sessions } = await getJson("/api/sessions");
assert.ok(sessions.length > 0, "at least one session");

const source = pickSmallSession(sessions);
const beforeIds = new Set(sessions.map((s) => s.id));

// --- clone ---
const sourceDetail = await getJson(`/api/sessions/${source.id}`);
const cloneData = await agentCommand(source.id, {
  type: "clone",
  leafId: sourceDetail.leafId ?? undefined,
});
assert.ok(cloneData.newSessionId, "clone returns newSessionId");
assert.equal(cloneData.cancelled, false);

const clonedDetail = await getJson(`/api/sessions/${cloneData.newSessionId}`);
assert.ok(clonedDetail.info, "clone target has info");
assert.equal(clonedDetail.info.id, cloneData.newSessionId);
assert.equal(clonedDetail.info.cwd, sourceDetail.info?.cwd ?? source.cwd);

const afterClone = await getJson("/api/sessions");
assert.ok(afterClone.sessions.some((s) => s.id === cloneData.newSessionId), "clone visible in list");

await getJson(`/api/sessions/${cloneData.newSessionId}`, { method: "DELETE" });

// --- fork (first non-root user message) ---
const forkSource = pickForkSession(sessions);
const forkSourceDetail = await getJson(`/api/sessions/${forkSource.id}`);
const entryIds = forkSourceDetail.context?.entryIds ?? [];
const messages = forkSourceDetail.context?.messages ?? [];
let forkEntryId = null;
for (let i = 0; i < messages.length; i++) {
  if (i > 0 && messages[i]?.role === "user" && entryIds[i]) {
    forkEntryId = entryIds[i];
    break;
  }
}
if (forkEntryId) {
  const forkData = await agentCommand(forkSource.id, {
    type: "fork",
    entryId: forkEntryId,
  });
  assert.ok(forkData.newSessionId, "fork returns newSessionId");
  assert.equal(forkData.cancelled, false);
  const forkDetail = await getJson(`/api/sessions/${forkData.newSessionId}`);
  assert.ok(forkDetail.info?.path, "fork session file exists");
  let inList = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const forkList = await getJson("/api/sessions");
    inList = forkList.sessions.some((s) => s.id === forkData.newSessionId);
    if (inList) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(inList, "fork visible in session list");
  await getJson(`/api/sessions/${forkData.newSessionId}`, { method: "DELETE" });
}

// --- branch navigate (no summarize) ---
let branchedSession = null;
for (const s of sessions) {
  const detail = await getJson(`/api/sessions/${s.id}`);
  if (hasFork(detail.tree ?? [])) {
    branchedSession = detail;
    break;
  }
}
assert.ok(branchedSession, "need a session with in-file branches");
const leaves = collectLeaves(branchedSession.tree ?? []);
const altLeaf = leaves.find((id) => id !== branchedSession.leafId) ?? leaves[0];
assert.ok(altLeaf, "alternate leaf for navigate");
const nav = await agentCommand(branchedSession.sessionId, {
  type: "navigate_tree",
  targetId: altLeaf,
  summarize: false,
});
assert.equal(nav.cancelled, false);

if (process.env.PI_M2_TEST_SUMMARIZE === "1") {
  const backLeaf = branchedSession.leafId;
  if (backLeaf && backLeaf !== altLeaf) {
    const sum = await agentCommand(branchedSession.sessionId, {
      type: "navigate_tree",
      targetId: backLeaf,
      summarize: true,
    });
    assert.equal(sum.cancelled, false);
    const reloaded = await getJson(`/api/sessions/${branchedSession.sessionId}`);
    const hasBranchSummary = (reloaded.context?.messages ?? []).some(
      (m) => m.role === "timelineSummary" && m.kind === "branch",
    );
    assert.ok(hasBranchSummary, "branch summary visible after summarize navigate");
  }
}

console.log(JSON.stringify({
  baseURL,
  health: { version: health.version, piVersion: health.piVersion },
  clone: { sourceId: source.id, ok: true },
  fork: { attempted: Boolean(forkEntryId) },
  navigate: { sessionId: branchedSession.sessionId, altLeaf },
  summarizeTest: process.env.PI_M2_TEST_SUMMARIZE === "1",
  sessionCountBefore: beforeIds.size,
}, null, 2));
