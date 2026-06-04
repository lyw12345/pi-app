import type { SessionInfo } from "./types";

/** Load session list metadata for sidebar / AppShell after fork or clone. */
export async function fetchSessionInfo(sessionId: string): Promise<SessionInfo | null> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`);
  if (!res.ok) return null;
  const data = await res.json() as { info?: SessionInfo | null };
  return data.info ?? null;
}
