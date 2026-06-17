import { afterEach, describe, expect, it } from "vitest";
import {
  ALLOWED_ROOTS_TTL_MS,
  getCachedAllowedRoots,
  invalidateAllowedRootsCache,
  setCachedAllowedRoots,
} from "./allowed-roots-cache";

describe("allowed-roots-cache", () => {
  afterEach(() => invalidateAllowedRootsCache());

  it("returns cached roots until the TTL lapses", () => {
    const now = 1_000_000;
    setCachedAllowedRoots(new Set(["/a", "/b"]), now);

    expect(getCachedAllowedRoots(now + ALLOWED_ROOTS_TTL_MS - 1)).toEqual(new Set(["/a", "/b"]));
    expect(getCachedAllowedRoots(now + ALLOWED_ROOTS_TTL_MS + 1)).toBeNull();
  });

  it("invalidate clears the cache immediately", () => {
    const now = 2_000_000;
    setCachedAllowedRoots(new Set(["/x"]), now);
    expect(getCachedAllowedRoots(now)).not.toBeNull();

    invalidateAllowedRootsCache();
    expect(getCachedAllowedRoots(now)).toBeNull();
  });
});
