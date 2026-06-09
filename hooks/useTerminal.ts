// hooks/useTerminal.ts
//
// React hook for one terminal session (one cwd). Owns the EventSource
// connection to /api/terminal/stream/[...cwd], hydrates from a parallel
// /state fetch, and exposes { lines, history, running, submit, stop, clear }
// to the components that render the panel.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TerminalLine, RunningProcessSummary } from "@/lib/terminal/types";

export type UseTerminalResult = {
  lines: TerminalLine[];
  history: string[];
  running: RunningProcessSummary | null;
  prompt: string;
  isLoading: boolean;
  error: string | null;
  submit(command: string, keepRunning: boolean): Promise<void>;
  stop(): Promise<void>;
  clear(): Promise<void>;
};

type ServerEvent =
  | { type: "replay"; lines: TerminalLine[] }
  | { type: "line";   line: TerminalLine }
  | { type: "state";  running: RunningProcessSummary | null }
  | { type: "prompt"; text: string };

function encodeCwd(cwd: string): string {
  return encodeURIComponent(cwd);
}

export function useTerminal(cwd: string | null, enabled: boolean): UseTerminalResult {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [running, setRunning] = useState<RunningProcessSummary | null>(null);
  const [prompt, setPrompt] = useState(() => fallbackPrompt(cwd));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;

  useEffect(() => {
    if (!enabled || !cwd) {
      esRef.current?.close();
      esRef.current = null;
      setLines([]);
      setHistory([]);
      setRunning(null);
      setPrompt(fallbackPrompt(cwd));
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    // 1) Hydrate from /state
    fetch(`/api/terminal/state/${encodeCwd(cwd)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`state ${r.status}`);
        return r.json();
      })
      .then((body: { prompt?: string; buffer: TerminalLine[]; history: string[]; running: RunningProcessSummary | null }) => {
        if (cwdRef.current !== cwd) return; // cwd changed during fetch
        setPrompt(body.prompt ?? fallbackPrompt(cwd));
        setLines(body.buffer);
        setHistory(body.history);
        setRunning(body.running);
      })
      .catch((e: Error) => {
        if (cwdRef.current !== cwd) return;
        setError(e.message);
      })
      .finally(() => {
        if (cwdRef.current === cwd) setIsLoading(false);
      });

    // 2) Open SSE
    const es = new EventSource(`/api/terminal/stream/${encodeCwd(cwd)}`);
    esRef.current = es;
    es.onmessage = (e) => {
      if (cwdRef.current !== cwd) return;
      let evt: ServerEvent;
      try { evt = JSON.parse(e.data); } catch { return; }
      if (evt.type === "replay") {
        setLines(evt.lines);
      } else if (evt.type === "line") {
        setLines((prev) => [...prev, evt.line]);
      } else if (evt.type === "state") {
        setRunning(evt.running);
      } else if (evt.type === "prompt") {
        setPrompt(evt.text);
      }
    };
    es.onerror = () => {
      if (cwdRef.current !== cwd) return;
      // browser will auto-reconnect; surface a transient error
      setError("stream disconnected (reconnecting…)");
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [cwd, enabled]);

  const submit = useCallback(
    async (command: string, keepRunning: boolean) => {
      if (!cwd) return;
      const res = await fetch(`/api/terminal/run/${encodeCwd(cwd)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command, keepRunning }),
      });
      if (!res.ok && res.status !== 202) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `run ${res.status}`);
      }
    },
    [cwd],
  );

  const stop = useCallback(async () => {
    if (!cwd) return;
    const res = await fetch(`/api/terminal/stop/${encodeCwd(cwd)}`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `stop ${res.status}`);
    }
  }, [cwd]);

  const clear = useCallback(async () => {
    // The server doesn't expose a clear endpoint in v1; clients clear
    // their own view by re-hydrating from /state. For now, no-op.
    setLines([]);
  }, []);

  return { lines, history, running, prompt, isLoading, error, submit, stop, clear };
}

function fallbackPrompt(cwd: string | null): string {
  if (!cwd) return "terminal %";
  const parts = cwd.split("/").filter(Boolean);
  const dir = parts.at(-1) ?? cwd;
  const user = parts[0] === "Users" && parts[1] ? parts[1] : "user";
  return `${user}@localhost ${dir} %`;
}
