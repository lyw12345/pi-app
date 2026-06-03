export function isConnectionError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof DOMException && err.name === "TimeoutError") return true;
  if (err instanceof Error && /failed to fetch|networkerror|load failed/i.test(err.message)) return true;
  return false;
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 8000, ...rest } = init;
  return fetch(input, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
}

export async function probeServer(timeoutMs = 5000): Promise<boolean> {
  try {
    const res = await fetchWithTimeout("/api/health", { timeoutMs, cache: "no-store" });
    if (!res.ok) return false;
    const body = await res.json().catch(() => null) as { ok?: boolean } | null;
    return body?.ok === true;
  } catch {
    return false;
  }
}
