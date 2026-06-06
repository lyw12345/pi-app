"use client";

import { useState, useCallback, useRef, useEffect, useReducer } from "react";
import type { AgentMessage, SessionInfo, SessionTreeNode } from "@/lib/types";
import { branchNavigateErrorKey } from "@/lib/branch-navigate-error";
import { normalizeAgentMessage } from "@/lib/normalize";
import { sendAgentCommand } from "@/lib/agent-client";
import { getPresetFromTools, PRESET_DEFAULT, PRESET_FULL, PRESET_NONE, type ToolEntry } from "@/components/ToolPanel";
import type { ToolMode } from "@/lib/pi-web-preferences";
import { readCachedPiWebPreferences } from "@/lib/pi-web-preferences-cache";
import { toolModeToToolNames } from "@/lib/tool-presets";
import { appendFileRefsToMessage, type FilePathRef } from "@/lib/message-file-refs";

export interface SessionData {
  sessionId: string;
  filePath: string;
  tree: SessionTreeNode[];
  leafId: string | null;
  context: {
    messages: AgentMessage[];
    entryIds: string[];
    thinkingLevel: string;
    model: { provider: string; modelId: string } | null;
  };
}

interface StreamingState {
  isStreaming: boolean;
  streamingMessage: Partial<AgentMessage> | null;
}

type StreamAction =
  | { type: "start" }
  | { type: "update"; message: Partial<AgentMessage> }
  | { type: "end" }
  | { type: "reset" };

function streamReducer(state: StreamingState, action: StreamAction): StreamingState {
  switch (action.type) {
    case "start":
      return { isStreaming: true, streamingMessage: null };
    case "update":
      return { isStreaming: true, streamingMessage: action.message };
    case "end":
    case "reset":
      return { isStreaming: false, streamingMessage: null };
    default:
      return state;
  }
}

interface AgentEvent {
  type: string;
  [key: string]: unknown;
}

export type AgentPhase =
  | { kind: "waiting_model" }
  | { kind: "running_tools"; tools: { id: string; name: string }[] }
  | null;

export interface UseAgentSessionOptions {
  session: SessionInfo | null;
  newSessionCwd: string | null;
  onAgentEnd?: () => void;
  onSessionCreated?: (session: SessionInfo) => void;
  onSessionForked?: (newSessionId: string) => void;
  modelsRefreshKey?: number;
  chatInputRef?: React.RefObject<ChatInputHandle | null>;
  onBranchDataChange?: (tree: SessionTreeNode[], activeLeafId: string | null, onLeafChange: (leafId: string | null) => void) => void;
  onBranchNavigatingChange?: (navigating: boolean) => void;
  onSystemPromptChange?: (prompt: string | null) => void;
  setNewSessionModel?: (model: { provider: string; modelId: string } | null) => void;
  setToolPreset?: (preset: "none" | "default" | "full") => void;
  toolMode?: ToolMode;
}

export type ThinkingLevelOption = "auto" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface ChatInputHandle {
  insertText: (text: string) => void;
  insertIfEmpty: (content: string) => void;
  addImages: (files: File[]) => void;
  addFiles: (files: File[]) => void;
}

export interface AttachedImage {
  data: string;
  mimeType: string;
  previewUrl: string;
}

export function useAgentSession(opts: UseAgentSessionOptions) {
  const {
    session, newSessionCwd, onAgentEnd, onSessionCreated, onSessionForked,
    modelsRefreshKey, onBranchDataChange, onBranchNavigatingChange, onSystemPromptChange,
    toolMode = "full",
  } = opts;

  const isNew = session === null && newSessionCwd !== null;

  const [data, setData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [activeLeafId, setActiveLeafId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [entryIds, setEntryIds] = useState<string[]>([]);
  const [streamState, dispatch] = useReducer(streamReducer, { isStreaming: false, streamingMessage: null });
  const [agentRunning, setAgentRunning] = useState(false);
  const [modelNames, setModelNames] = useState<Record<string, string>>({});
  const [modelList, setModelList] = useState<{ id: string; name: string; provider: string; input?: ("text" | "image")[] }[]>([]);
  const [modelThinkingLevels, setModelThinkingLevels] = useState<Record<string, string[]>>({});
  const [modelThinkingLevelMaps, setModelThinkingLevelMaps] = useState<Record<string, Record<string, string | null>>>({});
  const [newSessionModel, setNewSessionModelState] = useState<{ provider: string; modelId: string } | null>(null);
  const [toolPreset, setToolPreset] = useState<"none" | "default" | "full">("default");
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevelOption>("auto");
  const [retryInfo, setRetryInfo] = useState<{ attempt: number; maxAttempts: number; errorMessage?: string } | null>(null);
  const [contextUsage, setContextUsage] = useState<{ percent: number | null; contextWindow: number; tokens: number | null } | null>(null);
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [forkingEntryId, setForkingEntryId] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);
  const [branchNavigating, setBranchNavigating] = useState(false);
  const [currentModelOverride, setCurrentModelOverride] = useState<{ provider: string; modelId: string } | null>(null);
  const [pendingModel, setPendingModel] = useState<{ provider: string; modelId: string } | null>(null);
  const [isCompacting, setIsCompacting] = useState(false);
  const [compactError, setCompactError] = useState<string | null>(null);
  const [agentPhase, setAgentPhase] = useState<AgentPhase>(null);

  const [remoteAuthError, setRemoteAuthError] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const sessionIdRef = useRef<string | null>(session?.id ?? null);
  const agentRunningRef = useRef(false);
  const handleAgentEventRef = useRef<((event: AgentEvent) => void) | null>(null);
  const initialScrollDoneRef = useRef(false);
  const lastUserMsgRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollToUserRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const previousSessionIdRef = useRef<string | null>(null);
  const pendingCreateSessionIdRef = useRef<string | null>(null);
  const idleSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setNewSessionModel = opts.setNewSessionModel ?? setNewSessionModelState;
  const setToolPresetState = opts.setToolPreset ?? setToolPreset;

  const currentModel = currentModelOverride ?? data?.context.model ?? pendingModel ?? null;
  const displayModel = isNew ? newSessionModel : currentModel;

  const sessionStats = (() => {
    const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    let cost = 0;
    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      const u = (msg as import("@/lib/types").AssistantMessage).usage;
      if (!u) continue;
      tokens.input += u.input ?? 0;
      tokens.output += u.output ?? 0;
      tokens.cacheRead += u.cacheRead ?? 0;
      tokens.cacheWrite += u.cacheWrite ?? 0;
      cost += u.cost?.total ?? 0;
    }
    const total = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite;
    return total > 0 ? { tokens, cost } : null;
  })();

  const loadSession = useCallback(async (
    sid: string,
    showLoading = false,
    includeState = false,
    options?: { preserveMessages?: boolean },
  ) => {
    try {
      if (showLoading) setLoading(true);
      const url = includeState
        ? `/api/sessions/${encodeURIComponent(sid)}?includeState`
        : `/api/sessions/${encodeURIComponent(sid)}`;
      const res = await fetch(url);
      if (res.status === 404) {
        if (showLoading) {
          setData(null);
          setActiveLeafId(null);
          setMessages([]);
          setError(null);
        }
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json() as SessionData & { agentState?: { running: boolean; state?: { isStreaming?: boolean; isCompacting?: boolean; contextUsage?: { percent: number | null; contextWindow: number; tokens: number | null } | null; systemPrompt?: string; thinkingLevel?: string } } };
      setData(d);
      setActiveLeafId(d.leafId);
      if (!options?.preserveMessages) {
        setMessages(d.context.messages);
        setEntryIds(d.context.entryIds ?? []);
      }
      setCurrentModelOverride(null);
      setError(null);
      // If no live agent state, fall back to thinking level from session file
      if (!d.agentState?.state?.thinkingLevel && d.context.thinkingLevel && d.context.thinkingLevel !== "off") {
        setThinkingLevel(d.context.thinkingLevel as ThinkingLevelOption);
      }
      return d.agentState ?? null;
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadContext = useCallback(async (sid: string, leafId: string | null) => {
    try {
      const url = leafId
        ? `/api/sessions/${encodeURIComponent(sid)}/context?leafId=${encodeURIComponent(leafId)}`
        : `/api/sessions/${encodeURIComponent(sid)}/context`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json() as { context: { messages: AgentMessage[]; entryIds: string[] } };
      setMessages(d.context.messages);
      setEntryIds(d.context.entryIds ?? []);
    } catch (e) {
      console.error("Failed to load context:", e);
    }
  }, []);

  const loadTools = useCallback(async (sid: string) => {
    try {
      const tools = await sendAgentCommand<ToolEntry[]>(sid, { type: "get_tools" });
      if (tools) {
        setToolPresetState(getPresetFromTools(tools));
      }
    } catch (e) {
      console.error("Failed to load tools:", e);
    }
  }, [setToolPresetState]);

  const connectEvents = useCallback((sid: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    const es = new EventSource(`/api/agent/${encodeURIComponent(sid)}/events`);
    eventSourceRef.current = es;
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as AgentEvent;
        handleAgentEventRef.current?.(event);
      } catch {
        // ignore
      }
    };
    es.onerror = () => {
      void fetch(`/api/agent/${encodeURIComponent(sid)}/events`, { method: "GET" }).then((res) => {
        if (res.status === 401) {
          setRemoteAuthError(true);
          setError("remote-auth-required");
          es.close();
          eventSourceRef.current = null;
          return;
        }
        if (eventSourceRef.current === es && agentRunningRef.current) {
          es.close();
          eventSourceRef.current = null;
          setTimeout(() => {
            if (agentRunningRef.current) connectEvents(sid);
          }, 1000);
        }
      }).catch(() => {
        if (eventSourceRef.current === es && agentRunningRef.current) {
          es.close();
          eventSourceRef.current = null;
          setTimeout(() => {
            if (agentRunningRef.current) connectEvents(sid);
          }, 1000);
        }
      });
    };
  }, []);

  useEffect(() => {
    agentRunningRef.current = agentRunning;
  }, [agentRunning]);

  const clearAgentRunningLocal = useCallback(() => {
    setAgentRunning(false);
    setAgentPhase(null);
    setRetryInfo(null);
    dispatch({ type: "end" });
  }, []);

  /** Wrapper may stay alive after a turn; use inner isStreaming, not registry "running". */
  const syncAgentRunningFromServer = useCallback(async (sid: string) => {
    if (!sid || !agentRunningRef.current) return;
    try {
      const res = await fetch(`/api/agent/${encodeURIComponent(sid)}`);
      if (!res.ok) {
        clearAgentRunningLocal();
        return;
      }
      const body = await res.json() as { running?: boolean; state?: { isStreaming?: boolean } };
      if (!body.running || body.state?.isStreaming === false) {
        clearAgentRunningLocal();
      }
    } catch {
      // ignore transient poll errors
    }
  }, [clearAgentRunningLocal]);

  const scheduleSyncAfterMessageEnd = useCallback((sid: string | null) => {
    if (!sid) return;
    if (idleSyncTimerRef.current) clearTimeout(idleSyncTimerRef.current);
    idleSyncTimerRef.current = setTimeout(() => {
      idleSyncTimerRef.current = null;
      void syncAgentRunningFromServer(sid);
    }, 400);
  }, [syncAgentRunningFromServer]);

  const handleAgentEvent = useCallback((event: AgentEvent) => {
    switch (event.type) {
      case "agent_start":
        setAgentRunning(true);
        setAgentPhase({ kind: "waiting_model" });
        dispatch({ type: "start" });
        break;
      case "agent_end":
        if (idleSyncTimerRef.current) {
          clearTimeout(idleSyncTimerRef.current);
          idleSyncTimerRef.current = null;
        }
        setAgentRunning(false);
        setAgentPhase(null);
        setRetryInfo(null);
        dispatch({ type: "end" });
        if (sessionIdRef.current) {
          loadSession(sessionIdRef.current);
          fetch(`/api/agent/${encodeURIComponent(sessionIdRef.current)}`)
            .then((r) => r.json())
            .then((d: { state?: { contextUsage?: { percent: number | null; contextWindow: number; tokens: number | null } | null; systemPrompt?: string } }) => {
              if (d.state?.contextUsage !== undefined) setContextUsage(d.state.contextUsage ?? null);
              if (d.state?.systemPrompt !== undefined) setSystemPrompt(d.state.systemPrompt ?? null);
            })
            .catch(() => {});
        }
        onAgentEnd?.();
        break;
      case "message_start":
      case "message_update": {
        const msg = event.message as Partial<AgentMessage> | undefined;
        if (msg?.role === "user") {
          break;
        }
        if (msg) {
          dispatch({ type: "update", message: normalizeAgentMessage(msg as AgentMessage) });
        }
        setAgentPhase(null);
        break;
      }
      case "message_end": {
        const completed = event.message as AgentMessage | undefined;
        if (completed && completed.role !== "user") {
          setMessages((prev) => [...prev, normalizeAgentMessage(completed)]);
        }
        dispatch({ type: "reset" });
        setAgentPhase({ kind: "waiting_model" });
        scheduleSyncAfterMessageEnd(sessionIdRef.current);
        break;
      }
      case "tool_execution_start": {
        const id = event.toolCallId as string;
        const name = event.toolName as string;
        setAgentPhase((prev) => {
          const tools = prev?.kind === "running_tools" ? [...prev.tools] : [];
          if (!tools.some((t) => t.id === id)) tools.push({ id, name });
          return { kind: "running_tools", tools };
        });
        break;
      }
      case "tool_execution_end": {
        const id = event.toolCallId as string;
        setAgentPhase((prev) => {
          if (prev?.kind !== "running_tools") return prev;
          const tools = prev.tools.filter((t) => t.id !== id);
          if (tools.length === 0) return { kind: "waiting_model" };
          return { kind: "running_tools", tools };
        });
        break;
      }
      case "auto_retry_start":
        setRetryInfo({ attempt: event.attempt as number, maxAttempts: event.maxAttempts as number, errorMessage: event.errorMessage as string | undefined });
        break;
      case "auto_retry_end":
        setRetryInfo(null);
        break;
      case "auto_compaction_start":
      case "compaction_start":
        setIsCompacting(true);
        setCompactError(null);
        break;
      case "auto_compaction_end":
      case "compaction_end":
        setIsCompacting(false);
        if (event.errorMessage) {
          setCompactError(event.errorMessage as string);
        } else if (!event.aborted) {
          if (sessionIdRef.current) loadSession(sessionIdRef.current);
        }
        break;
    }
  }, [loadSession, onAgentEnd, scheduleSyncAfterMessageEnd]);
  handleAgentEventRef.current = handleAgentEvent;

  const applyAgentRunningFromServer = useCallback((
    agentState: { running: boolean; state?: { isStreaming?: boolean } } | null | undefined,
    sid: string,
  ) => {
    const activelyStreaming = Boolean(agentState?.running && agentState.state?.isStreaming);
    if (activelyStreaming) {
      setAgentRunning(true);
      setAgentPhase((prev) => prev ?? { kind: "waiting_model" });
      connectEvents(sid);
      void loadTools(sid);
      return;
    }
    clearAgentRunningLocal();
  }, [connectEvents, loadTools, clearAgentRunningLocal]);

  const waitForAgentIdle = useCallback(async (sid: string) => {
    for (let attempt = 0; attempt < 120; attempt++) {
      try {
        const res = await fetch(`/api/agent/${encodeURIComponent(sid)}`);
        if (!res.ok) {
          clearAgentRunningLocal();
          return;
        }
        const body = await res.json() as { running?: boolean; state?: { isStreaming?: boolean } };
        if (!body.running || body.state?.isStreaming === false) {
          await loadSession(sid, false, true);
          clearAgentRunningLocal();
          return;
        }
      } catch {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }, [loadSession, clearAgentRunningLocal]);

  const handleSend = useCallback(async (message: string, images?: AttachedImage[], fileRefs?: FilePathRef[]) => {
    if (!message.trim() && !images?.length && !fileRefs?.length) return;
    if (agentRunning) return;

    const promptMessage = appendFileRefsToMessage(message, fileRefs ?? []);
    const imageBlocks = images?.map((img) => ({ type: "image" as const, data: img.data, mimeType: img.mimeType }));
    const userMsg: AgentMessage = {
      role: "user",
      content: imageBlocks?.length
        ? [...(promptMessage.trim() ? [{ type: "text" as const, text: promptMessage }] : []), ...imageBlocks]
        : promptMessage,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setAgentRunning(true);
    setAgentPhase({ kind: "waiting_model" });
    dispatch({ type: "start" });
    pendingScrollToUserRef.current = true;

    const piImages = images?.map((img) => ({ type: "image" as const, data: img.data, mimeType: img.mimeType }));

    try {
      if (isNew && newSessionCwd) {
        const selectedModel = newSessionModel;
        if (selectedModel) setPendingModel(selectedModel);
        const toolNames = toolModeToToolNames(toolMode);
        const res = await fetch("/api/agent/new", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cwd: newSessionCwd,
            type: "prompt",
            message: promptMessage,
            toolNames,
            ...(piImages?.length ? { images: piImages } : {}),
            ...(selectedModel ? { provider: selectedModel.provider, modelId: selectedModel.modelId } : {}),
            ...(thinkingLevel !== "auto" ? { thinkingLevel } : {}),
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json() as { sessionId: string };
        const realId = result.sessionId;
        sessionIdRef.current = realId;
        pendingCreateSessionIdRef.current = realId;
        connectEvents(realId);
        void waitForAgentIdle(realId);
        onSessionCreated?.({
          id: realId,
          path: "",
          cwd: newSessionCwd,
          name: undefined,
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          messageCount: 1,
          firstMessage: promptMessage,
        });
      } else if (session) {
        connectEvents(session.id);
        await sendAgentCommand(session.id, {
          type: "prompt",
          message: promptMessage,
          ...(piImages?.length ? { images: piImages } : {}),
        });
        void waitForAgentIdle(session.id);
      }
    } catch (e) {
      console.error("Failed to send message:", e);
      setAgentRunning(false);
      setAgentPhase(null);
      dispatch({ type: "end" });
    }
  }, [isNew, newSessionCwd, newSessionModel, toolMode, thinkingLevel, session, agentRunning, connectEvents, onSessionCreated, waitForAgentIdle]);

  const handleAbort = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await sendAgentCommand(sid, { type: "abort" });
      void waitForAgentIdle(sid);
    } catch (e) {
      console.error("Failed to abort:", e);
    }
  }, [waitForAgentIdle]);

  const handleFork = useCallback(async (entryId: string) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    setForkingEntryId(entryId);
    try {
      const result = await sendAgentCommand<{ cancelled?: boolean; newSessionId?: string }>(sid, {
        type: "fork",
        entryId,
      });
      const { cancelled, newSessionId } = result ?? {};
      if (!cancelled && newSessionId) {
        onSessionForked?.(newSessionId);
      }
    } catch (e) {
      console.error("Fork failed:", e);
    } finally {
      setForkingEntryId(null);
    }
  }, [onSessionForked]);

  const handleNavigate = useCallback(async (entryId: string) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    sendAgentCommand(sid, { type: "navigate_tree", targetId: entryId, summarize: false }).catch(() => {});
    setActiveLeafId(entryId);
    await loadContext(sid, entryId);
  }, [loadContext]);

  const handleLeafChange = useCallback(async (leafId: string | null) => {
    setActiveLeafId(leafId);
    const sid = sessionIdRef.current;
    if (!sid) return;
    if (!leafId) {
      await loadContext(sid, null);
      return;
    }
    const summarize = readCachedPiWebPreferences().branchSummarizeBeforeSwitch === true;
    setBranchNavigating(true);
    try {
      await sendAgentCommand(sid, { type: "navigate_tree", targetId: leafId, summarize });
      await loadSession(sid, true);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("Branch navigation failed:", e);
      setError(message);
      setCompactError(branchNavigateErrorKey(message));
      await loadContext(sid, leafId);
    } finally {
      setBranchNavigating(false);
    }
  }, [loadContext, loadSession]);

  const dataLeafId = data?.leafId ?? null;

  const handleClone = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    setCloning(true);
    try {
      const leafId = activeLeafId ?? dataLeafId;
      const result = await sendAgentCommand<{ cancelled?: boolean; newSessionId?: string }>(sid, {
        type: "clone",
        ...(leafId ? { leafId } : {}),
      });
      const { cancelled, newSessionId } = result ?? {};
      if (!cancelled && newSessionId) {
        onSessionForked?.(newSessionId);
      }
    } catch (e) {
      console.error("Clone failed:", e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCloning(false);
    }
  }, [activeLeafId, dataLeafId, onSessionForked]);

  const handleModelChange = useCallback(async (provider: string, modelId: string) => {
    if (isNew) {
      setNewSessionModel({ provider, modelId });
      return;
    }
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await sendAgentCommand(sid, { type: "set_model", provider, modelId });
      setCurrentModelOverride({ provider, modelId });
      setError(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("Failed to set model:", e);
      setError(message);
    }
  }, [isNew, setNewSessionModel]);

  const handleCompact = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid || isCompacting) return;
    setIsCompacting(true);
    setCompactError(null);
    try {
      await sendAgentCommand(sid, { type: "compact" });
      await loadSession(sid, true);
    } catch (e) {
      setCompactError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsCompacting(false);
    }
  }, [isCompacting, loadSession]);

  const handleSteer = useCallback(async (message: string, images?: AttachedImage[], fileRefs?: FilePathRef[]) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    const promptMessage = appendFileRefsToMessage(message, fileRefs ?? []);
    setMessages((prev) => [...prev, { role: "user", content: `[steer] ${promptMessage}`, timestamp: Date.now() } as AgentMessage]);
    const piImages = images?.map((img) => ({ type: "image" as const, data: img.data, mimeType: img.mimeType }));
    try {
      await sendAgentCommand(sid, {
        type: "steer",
        message: promptMessage,
        ...(piImages?.length ? { images: piImages } : {}),
      });
    } catch (e) {
      console.error("Failed to steer:", e);
    }
  }, []);

  const handleFollowUp = useCallback(async (message: string, images?: AttachedImage[], fileRefs?: FilePathRef[]) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    const promptMessage = appendFileRefsToMessage(message, fileRefs ?? []);
    setMessages((prev) => [...prev, { role: "user", content: promptMessage, timestamp: Date.now() } as AgentMessage]);
    const piImages = images?.map((img) => ({ type: "image" as const, data: img.data, mimeType: img.mimeType }));
    try {
      await sendAgentCommand(sid, {
        type: "follow_up",
        message: promptMessage,
        ...(piImages?.length ? { images: piImages } : {}),
      });
    } catch (e) {
      console.error("Failed to follow up:", e);
    }
  }, []);

  const handleAbortCompaction = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await sendAgentCommand(sid, { type: "abort_compaction" });
    } catch (e) {
      console.error("Failed to abort compaction:", e);
    }
  }, []);

  const handleThinkingLevelChange = useCallback(async (level: ThinkingLevelOption) => {
    setThinkingLevel(level);
    if (level === "auto") return; // "auto" leaves pi's current setting untouched
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await sendAgentCommand(sid, { type: "set_thinking_level", level });
    } catch (e) {
      console.error("Failed to set thinking level:", e);
    }
  }, []);

  const handleToolPresetChange = useCallback(async (preset: "none" | "default" | "full") => {
    const toolNames = preset === "none" ? PRESET_NONE : preset === "default" ? PRESET_DEFAULT : PRESET_FULL;
    setToolPresetState(preset);
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await sendAgentCommand(sid, { type: "set_tools", toolNames });
    } catch (e) {
      console.error("Failed to set tools:", e);
    }
  }, [setToolPresetState]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const scrollUserMsgToTop = useCallback(() => {
    const container = scrollContainerRef.current;
    const el = lastUserMsgRef.current;
    if (!container || !el) return;
    const elAbsTop = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    container.scrollTo({ top: elAbsTop - 16, behavior: "smooth" });
  }, []);

  // Load session when the active session id changes (including new → created transitions).
  useEffect(() => {
    if (!session?.id) {
      previousSessionIdRef.current = null;
      sessionIdRef.current = null;
      return () => {
        eventSourceRef.current?.close();
        eventSourceRef.current = null;
      };
    }

    const previousSessionId = previousSessionIdRef.current;
    const isSessionSwitch = previousSessionId !== null && previousSessionId !== session.id;
    const isInFlightCreate = pendingCreateSessionIdRef.current === session.id;
    if (isInFlightCreate) pendingCreateSessionIdRef.current = null;
    previousSessionIdRef.current = session.id;
    sessionIdRef.current = session.id;
    let cancelled = false;

    if (isSessionSwitch) {
      setMessages([]);
      setEntryIds([]);
      setAgentRunning(false);
      setAgentPhase(null);
      setRetryInfo(null);
      dispatch({ type: "end" });
    }

    const showLoading = isSessionSwitch || (previousSessionId === null && !isInFlightCreate);
    void loadSession(session.id, showLoading, true, { preserveMessages: isInFlightCreate }).then((agentState) => {
      if (cancelled) return;
      applyAgentRunningFromServer(agentState, session.id);
      if (agentState?.state) {
        if (agentState.state.isCompacting !== undefined) setIsCompacting(agentState.state.isCompacting);
        if (agentState.state.contextUsage !== undefined) setContextUsage(agentState.state.contextUsage ?? null);
        if (agentState.state.systemPrompt !== undefined) setSystemPrompt(agentState.state.systemPrompt ?? null);
        if (agentState.state.thinkingLevel !== undefined) setThinkingLevel((agentState.state.thinkingLevel as ThinkingLevelOption) ?? "auto");
      }
    });

    return () => {
      cancelled = true;
      if (idleSyncTimerRef.current) {
        clearTimeout(idleSyncTimerRef.current);
        idleSyncTimerRef.current = null;
      }
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [session?.id, loadSession, applyAgentRunningFromServer]);

  useEffect(() => {
    onSystemPromptChange?.(systemPrompt);
  }, [systemPrompt, onSystemPromptChange]);

  useEffect(() => {
    if (!onBranchDataChange) return;
    onBranchDataChange(data?.tree ?? [], activeLeafId, handleLeafChange);
  }, [data?.tree, activeLeafId, handleLeafChange, onBranchDataChange]);

  useEffect(() => {
    onBranchNavigatingChange?.(branchNavigating);
  }, [branchNavigating, onBranchNavigatingChange]);

  useEffect(() => {
    if (messages.length > 0) {
      if (pendingScrollToUserRef.current) {
        pendingScrollToUserRef.current = false;
        initialScrollDoneRef.current = true;
        scrollUserMsgToTop();
      } else if (!initialScrollDoneRef.current) {
        initialScrollDoneRef.current = true;
        if (agentRunningRef.current && messages.some((m) => m.role === "user")) {
          scrollUserMsgToTop();
        } else {
          scrollToBottom("instant");
        }
      } else if (!agentRunningRef.current) {
        scrollToBottom("smooth");
      }
    }
  }, [messages.length, agentRunning, scrollToBottom, scrollUserMsgToTop]);

  // Load model list
  useEffect(() => {
    fetch("/api/models").then((r) => r.json()).then((d: { models: Record<string, string>; modelList?: { id: string; name: string; provider: string; input?: ("text" | "image")[] }[]; defaultModel?: { provider: string; modelId: string } | null; thinkingLevels?: Record<string, string[]>; thinkingLevelMaps?: Record<string, Record<string, string | null>> }) => {
      setModelNames(d.models);
      if (d.thinkingLevels) setModelThinkingLevels(d.thinkingLevels);
      if (d.thinkingLevelMaps) setModelThinkingLevelMaps(d.thinkingLevelMaps);
      if (d.modelList) {
        setModelList(d.modelList);
        if (isNew && d.modelList.length > 0) {
          const def = d.defaultModel;
          const match = def && d.modelList.find((m) => m.id === def.modelId && m.provider === def.provider);
          const selected = match
            ? { provider: match.provider, modelId: match.id }
            : { provider: d.modelList[0].provider, modelId: d.modelList[0].id };
          setNewSessionModel(selected);
        }
      }
    }).catch(() => {});
  }, [isNew, modelsRefreshKey, setNewSessionModel]);

  // Compact error auto-dismiss
  useEffect(() => {
    if (!compactError) return;
    const t = setTimeout(() => setCompactError(null), 3000);
    return () => clearTimeout(t);
  }, [compactError]);

  return {
    // State
    data, loading, error, activeLeafId, messages, entryIds, streamState,
    agentRunning, modelNames, modelList, modelThinkingLevels, modelThinkingLevelMaps, newSessionModel, toolPreset, thinkingLevel,
    retryInfo, contextUsage, systemPrompt, forkingEntryId, cloning, branchNavigating,
    isCompacting, compactError, currentModel, displayModel, sessionStats,
    agentPhase,
    remoteAuthError,
    isNew,
    // Refs
    sessionIdRef, eventSourceRef, messagesEndRef, scrollContainerRef,
    lastUserMsgRef, pendingScrollToUserRef, initialScrollDoneRef,
    // Actions
    handleSend, handleAbort, handleFork, handleClone, handleNavigate, handleModelChange,
    handleCompact, handleSteer, handleFollowUp, handleAbortCompaction,
    handleToolPresetChange, handleThinkingLevelChange, loadTools, setActiveLeafId, setData, setMessages,
    dispatch, setAgentRunning, setForkingEntryId,
    // Subscriptions
    handleAgentEventRef,
  };
}
