// Short-TTL cache for the file API's allowed-roots set. Without it every file
// list/read request re-scans every pi session on disk just to check access. The
// value lives on globalThis so it survives Next.js hot-reload.
//
// Any mutation that changes which directories are authorized (e.g. opening a new
// workspace via /api/cwd/validate) MUST call invalidateAllowedRootsCache(),
// otherwise the next file request serves a stale set and 403s a just-opened cwd
// until the TTL lapses.
declare global {
  var __piAllowedRootsCache: { roots: Set<string>; expiresAt: number } | undefined;
}

export const ALLOWED_ROOTS_TTL_MS = 5_000;

export function getCachedAllowedRoots(now: number): Set<string> | null {
  const cached = globalThis.__piAllowedRootsCache;
  if (cached && cached.expiresAt > now) return cached.roots;
  return null;
}

export function setCachedAllowedRoots(roots: Set<string>, now: number): void {
  globalThis.__piAllowedRootsCache = { roots, expiresAt: now + ALLOWED_ROOTS_TTL_MS };
}

export function invalidateAllowedRootsCache(): void {
  globalThis.__piAllowedRootsCache = undefined;
}
