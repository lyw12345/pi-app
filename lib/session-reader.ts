import { isAbsolute, resolve } from "node:path";
import { SessionManager, buildSessionContext as piBuildSessionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir, getDefaultAgentDir } from "@/lib/agent-dir";
import type { SessionEntry, SessionInfo, SessionContext, SessionTreeNode, SessionMessageEntry, AssistantMessage } from "./types";
import type { SessionEntry as PiSessionEntry, SessionInfo as PiSessionInfo } from "@earendil-works/pi-coding-agent";
import { extractFileRefsFromText } from "./message-file-refs";
import { normalizeAgentMessage } from "./normalize";
import { loadPiWebPreferences } from "./pi-web-preferences";
import { readProductSessionMetadataMap } from "./scene-metadata";
import { getPickerCwds, isSystemTempCwd } from "./session-projects";

export { getAgentDir };

export function getSessionsDir(): string {
  return `${getAgentDir()}/sessions`;
}

async function listSessionsForAgentRoot(agentRoot: string): Promise<PiSessionInfo[]> {
  const envKey = "PI_CODING_AGENT_DIR";
  const prev = process.env[envKey];
  process.env[envKey] = agentRoot;
  try {
    return await SessionManager.listAll();
  } finally {
    if (prev === undefined) {
      delete process.env[envKey];
    } else {
      process.env[envKey] = prev;
    }
  }
}

/** Project picker cwds: active agent dir plus prod (~/.pi/agent) when dev is isolated. */
export async function listProjectCwdsForPicker(): Promise<string[]> {
  const merged: Array<{ cwd: string; modified: string }> = [];
  const appendSessions = (sessions: PiSessionInfo[]) => {
    for (const session of sessions) {
      if (!session.cwd) continue;
      merged.push({
        cwd: session.cwd,
        modified: session.modified instanceof Date ? session.modified.toISOString() : String(session.modified),
      });
    }
  };

  appendSessions(await SessionManager.listAll());

  const agentDir = getAgentDir();
  const defaultDir = getDefaultAgentDir();
  if (resolve(agentDir) !== resolve(defaultDir)) {
    try {
      appendSessions(await listSessionsForAgentRoot(defaultDir));
    } catch {
      // ignore unreadable prod sessions dir
    }
  }

  const cwds = getPickerCwds(merged);
  const prefs = loadPiWebPreferences();
  for (const raw of [prefs.defaultWorkspaceCwd, ...(prefs.recentWorkspaceCwds ?? [])]) {
    const cwd = raw?.trim();
    if (cwd && !cwds.includes(cwd) && !isSystemTempCwd(cwd)) {
      cwds.push(cwd);
    }
  }
  return cwds;
}

export async function listAllSessions(): Promise<SessionInfo[]> {
  const piSessions: PiSessionInfo[] = await SessionManager.listAll();
  const pathToId = new Map<string, string>();
  for (const s of piSessions) pathToId.set(s.path, s.id);
  const productMetadata = readProductSessionMetadataMap();

  const cache = getPathCache();
  return piSessions.map((s) => {
    const metadata = productMetadata[s.id];
    // Populate path cache so resolveSessionPath works without a full scan
    cache.set(s.id, s.path);
    return {
      path: s.path,
      id: s.id,
      cwd: s.cwd,
      name: s.name,
      created: s.created instanceof Date ? s.created.toISOString() : String(s.created),
      modified: s.modified instanceof Date ? s.modified.toISOString() : String(s.modified),
      messageCount: s.messageCount,
      firstMessage: s.firstMessage || "(no messages)",
      parentSessionId: s.parentSessionPath ? pathToId.get(s.parentSessionPath) : undefined,
      productTitle: metadata?.title,
      productStatus: metadata?.status,
      lastResultSummary: metadata?.lastResultSummary,
    };
  });
}

// ============================================================================
// Session path cache: sessionId → absolute file path
// Stored in globalThis for hot-reload safety
// ============================================================================
declare global {
  var __piSessionPathCache: Map<string, string> | undefined;
}

function getPathCache(): Map<string, string> {
  if (!globalThis.__piSessionPathCache) globalThis.__piSessionPathCache = new Map();
  return globalThis.__piSessionPathCache;
}

export async function resolveSessionPath(sessionId: string): Promise<string | null> {
  const cached = getPathCache().get(sessionId);
  if (cached) return cached;

  // Cache miss: scan all sessions to populate cache, then retry
  await listAllSessions();
  return getPathCache().get(sessionId) ?? null;
}

export function cacheSessionPath(sessionId: string, filePath: string): void {
  getPathCache().set(sessionId, filePath);
}

export function invalidateSessionPathCache(sessionId: string): void {
  getPathCache().delete(sessionId);
}

export function getSessionEntries(filePath: string): SessionEntry[] {
  const entries = SessionManager.open(filePath).getEntries();
  return entries as unknown as SessionEntry[];
}

// Short-TTL cache of files referenced per session, keyed by session id. Scanning
// a whole transcript on every preview request would be wasteful; 5s matches the
// allowed-roots cache and is short enough that newly-touched files appear fast.
declare global {
  var __piSessionRefFilesCache: Map<string, { files: Set<string>; expiresAt: number }> | undefined;
}

const SESSION_REF_FILES_TTL_MS = 5_000;
const TOOL_FILE_PATH_KEYS = ["path", "file_path", "filePath", "notebook_path", "notebookPath"];

function getRefFilesCache(): Map<string, { files: Set<string>; expiresAt: number }> {
  if (!globalThis.__piSessionRefFilesCache) globalThis.__piSessionRefFilesCache = new Map();
  return globalThis.__piSessionRefFilesCache;
}

/**
 * Collect absolute file paths the agent referenced in a session: file-reference
 * tags inside user/assistant text plus file-path arguments of tool calls.
 * Relative paths are resolved against the session cwd. Lets the file preview open
 * files the conversation actually touched even when they sit outside the
 * cwd-derived allowed roots. Cached briefly to avoid rescanning transcripts.
 */
export async function collectSessionReferencedFiles(sessionId: string): Promise<Set<string>> {
  const now = Date.now();
  const cache = getRefFilesCache();
  const cached = cache.get(sessionId);
  if (cached && cached.expiresAt > now) return cached.files;

  const files = new Set<string>();
  const store = (): Set<string> => {
    cache.set(sessionId, { files, expiresAt: now + SESSION_REF_FILES_TTL_MS });
    return files;
  };

  const filePath = await resolveSessionPath(sessionId);
  if (!filePath) return store();

  let cwd: string | undefined;
  try {
    const sessions = await listAllSessions();
    cwd = sessions.find((s) => s.id === sessionId)?.cwd;
  } catch {
    // Without a cwd we simply skip relative paths below.
  }

  let entries: SessionEntry[];
  try {
    entries = getSessionEntries(filePath);
  } catch {
    return store();
  }

  const addRaw = (raw: unknown): void => {
    if (typeof raw !== "string") return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (isAbsolute(trimmed)) files.add(resolve(trimmed));
    else if (cwd) files.add(resolve(cwd, trimmed));
  };
  const addFromText = (text: string): void => {
    for (const ref of extractFileRefsFromText(text)) addRaw(ref.path);
  };

  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const message = (entry as SessionMessageEntry).message;
    if (!message) continue;
    if (message.role === "user" || message.role === "custom") {
      const content = message.content;
      if (typeof content === "string") addFromText(content);
      else for (const block of content) if (block.type === "text") addFromText(block.text);
    } else if (message.role === "assistant") {
      for (const block of message.content) {
        if (block.type === "text") {
          addFromText(block.text);
        } else if (block.type === "toolCall") {
          const input = block.input ?? {};
          for (const key of TOOL_FILE_PATH_KEYS) {
            if (key in input) addRaw((input as Record<string, unknown>)[key]);
          }
        }
      }
    }
  }

  return store();
}

export function buildTree(entries: SessionEntry[]): SessionTreeNode[] {
  const nodeMap = new Map<string, SessionTreeNode>();
  const labelsById = new Map<string, string>();

  for (const entry of entries) {
    if (entry.type === "label") {
      const l = entry as { type: "label"; targetId: string; label?: string };
      if (l.label) labelsById.set(l.targetId, l.label);
      else labelsById.delete(l.targetId);
    }
  }

  const roots: SessionTreeNode[] = [];
  for (const entry of entries) {
    nodeMap.set(entry.id, { entry, children: [], label: labelsById.get(entry.id) });
  }
  for (const entry of entries) {
    const node = nodeMap.get(entry.id)!;
    if (!entry.parentId) {
      roots.push(node);
    } else {
      const parent = nodeMap.get(entry.parentId);
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
  }

  const stack = [...roots];
  while (stack.length > 0) {
    const node = stack.pop()!;
    node.children.sort((a, b) => new Date(a.entry.timestamp).getTime() - new Date(b.entry.timestamp).getTime());
    stack.push(...node.children);
  }
  return roots;
}

export function buildSessionContext(entries: SessionEntry[], leafId?: string | null): SessionContext {
  const byId = new Map<string, SessionEntry>();
  for (const e of entries) byId.set(e.id, e);

  const piEntries = entries as unknown as PiSessionEntry[];
  const piCtx = piBuildSessionContext(piEntries, leafId, byId as unknown as Map<string, PiSessionEntry>);

  // Build entryIds: parallel array to messages[], mapping each message back to its entry id.
  // Needed for fork and navigate_tree calls from the UI.
  let targetLeaf: SessionEntry | undefined;
  if (leafId === null) {
    return { messages: [], entryIds: [], thinkingLevel: piCtx.thinkingLevel, model: piCtx.model };
  }
  if (leafId) targetLeaf = byId.get(leafId);
  if (!targetLeaf) targetLeaf = entries[entries.length - 1];
  if (!targetLeaf) {
    return { messages: [], entryIds: [], thinkingLevel: piCtx.thinkingLevel, model: piCtx.model };
  }

  // Walk path from target leaf to root
  const path: SessionEntry[] = [];
  let cur: SessionEntry | undefined = targetLeaf;
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }

  // Find the last compaction on path (mirrors pi's buildSessionContext logic)
  let compactionId: string | undefined;
  let firstKeptEntryId: string | undefined;
  for (const e of path) {
    if (e.type === "compaction") {
      compactionId = e.id;
      firstKeptEntryId = (e as { firstKeptEntryId: string }).firstKeptEntryId;
    }
  }

  const entryIds: string[] = [];
  if (compactionId) {
    // The first message in piCtx.messages is the synthetic compaction summary — map to compaction entry id
    entryIds.push(compactionId);
    const compactionIdx = path.findIndex((e) => e.id === compactionId);
    const firstKeptIdx = firstKeptEntryId
      ? path.findIndex((e, i) => i < compactionIdx && e.id === firstKeptEntryId)
      : -1;
    const startIdx = firstKeptIdx >= 0 ? firstKeptIdx : compactionIdx;
    for (let i = startIdx; i < compactionIdx; i++) {
      if (path[i].type === "message") entryIds.push(path[i].id);
    }
    for (let i = compactionIdx + 1; i < path.length; i++) {
      if (path[i].type === "message") entryIds.push(path[i].id);
    }
  } else {
    for (const e of path) {
      if (e.type === "message") entryIds.push(e.id);
    }
  }

  const messages = (piCtx.messages as AssistantMessage[]).map((msg) =>
    normalizeAgentMessage(msg as never),
  );

  return {
    messages,
    entryIds,
    thinkingLevel: piCtx.thinkingLevel,
    model: piCtx.model,
  };
}

export function getLeafId(entries: SessionEntry[]): string | null {
  if (entries.length === 0) return null;
  return entries[entries.length - 1].id;
}


