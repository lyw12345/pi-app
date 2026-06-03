"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type EntryStatus = "idle" | "loading" | "success" | "error";

type EntryState<T> = {
  status: EntryStatus;
  data: T | null;
  error: string | null;
  fetchedAt: number;
};

type Entry<T> = {
  state: EntryState<T>;
  inflight: Promise<T> | null;
  listeners: Set<(state: EntryState<T>) => void>;
};

type FetchOptions = {
  staleMs?: number;
  // Force a network round-trip even if the cached value is fresh.
  force?: boolean;
  // On error, retry up to N times with linear backoff.
  retries?: number;
};

declare global {
  var __piControlCache: Map<string, Entry<unknown>> | undefined;
}

function getCache(): Map<string, Entry<unknown>> {
  if (!globalThis.__piControlCache) globalThis.__piControlCache = new Map();
  return globalThis.__piControlCache;
}

function notify<T>(entry: Entry<T>): void {
  for (const listener of entry.listeners) {
    listener(entry.state);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function ensureEntry<T>(key: string): Entry<T> {
  const cache = getCache();
  const existing = cache.get(key) as Entry<T> | undefined;
  if (existing) return existing;
  const created: Entry<T> = {
    state: { status: "idle", data: null, error: null, fetchedAt: 0 },
    inflight: null,
    listeners: new Set(),
  };
  cache.set(key, created as Entry<unknown>);
  return created;
}

async function attemptFetch<T>(
  entry: Entry<T>,
  fetcher: () => Promise<T>,
  retries: number,
): Promise<T> {
  const tryOnce = async (remaining: number): Promise<T> => {
    try {
      const data = await fetcher();
      entry.state = { status: "success", data, error: null, fetchedAt: Date.now() };
      entry.inflight = null;
      notify(entry);
      return data;
    } catch (err) {
      if (remaining > 0) {
        await sleep(250 * (retries - remaining + 1));
        return tryOnce(remaining - 1);
      }
      entry.state = { ...entry.state, status: "error", error: describeError(err) };
      entry.inflight = null;
      notify(entry);
      throw err;
    }
  };
  return tryOnce(retries);
}

export function fetchControlResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: FetchOptions = {},
): Promise<T> {
  const entry = ensureEntry<T>(key);
  const staleMs = options.staleMs ?? 15_000;
  const retries = options.retries ?? 0;
  const now = Date.now();
  const fresh = entry.state.status === "success" && now - entry.state.fetchedAt < staleMs;
  if (fresh && !options.force) {
    return Promise.resolve(entry.state.data as T);
  }
  if (entry.inflight) return entry.inflight;
  entry.state = { ...entry.state, status: "loading", error: null };
  notify(entry);
  entry.inflight = attemptFetch(entry, fetcher, retries);
  return entry.inflight;
}

export function invalidateControlResource(key: string): void {
  getCache().delete(key);
}

export function invalidateControlResourcesMatching(
  predicate: (key: string) => boolean,
): void {
  const cache = getCache();
  for (const key of Array.from(cache.keys())) {
    if (predicate(key)) cache.delete(key);
  }
}

export function useCachedResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: { staleMs?: number; retries?: number; enabled?: boolean } = {},
) {
  const entryRef = useRef<Entry<T> | null>(null);
  if (!entryRef.current) entryRef.current = ensureEntry<T>(key);
  const [state, setState] = useState<EntryState<T>>(entryRef.current.state);

  const trigger = useCallback(
    (force = false) => {
      if (options.enabled === false) return Promise.resolve(null as T | null);
      return fetchControlResource<T>(key, fetcher, {
        staleMs: options.staleMs,
        retries: options.retries,
        force,
      }).catch((err: unknown) => {
        if (typeof console !== "undefined") {
          console.warn(`[useCachedResource:${key}]`, describeError(err));
        }
        return null;
      });
    },
    [key, fetcher, options.enabled, options.staleMs, options.retries],
  );

  useEffect(() => {
    const entry = entryRef.current!;
    const listener = (next: EntryState<T>) => setState(next);
    entry.listeners.add(listener);
    setState(entry.state);
    if (entry.state.status === "idle" || entry.state.status === "error") {
      void trigger();
    }
    return () => {
      entry.listeners.delete(listener);
    };
  }, [key, trigger]);

  const refresh = useCallback(() => trigger(true), [trigger]);

  return { ...state, refresh };
}
