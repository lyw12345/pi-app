"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SessionSidebar } from "./SessionSidebar";
import { ChatWindow } from "./ChatWindow";
import { FileViewer } from "./FileViewer";
import { TabBar, type Tab } from "./TabBar";
import { ModelsConfig } from "./ModelsConfig";
import { SkillsConfig } from "./SkillsConfig";
import { BranchNavigator } from "./BranchNavigator";
import { WorkbenchHome } from "./WorkbenchHome";
import { TerminalPanel } from "./TerminalPanel";
import { WorkbenchSettings } from "./WorkbenchSettings";
import { RemotePairingHandler } from "./RemotePairingHandler";
import { RemoteAccessBanner } from "./RemoteAccessBanner";
import { ServerConnectionBanner } from "./ServerConnectionBanner";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/lib/i18n/provider";
import type { SessionInfo, SessionTreeNode } from "@/lib/types";
import { SessionReportButton } from "./SessionReportButton";
import type { ChatInputHandle } from "./ChatInput";
import type { ProductHistoryItem } from "@/lib/product-history";
import type { ToolMode } from "@/lib/pi-web-preferences";
import { fetchSessionInfo } from "@/lib/fetch-session-info";
import { hasFork } from "@/lib/branch-tree";
import {
  canOpenWithSystemApp,
  canPreviewInApp,
  openFileWithSystemApp,
  resolveFilePreviewKind,
} from "@/lib/file-preview";
import { cachePiWebPreferences } from "@/lib/pi-web-preferences-cache";

export function AppShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isDark, toggleTheme } = useTheme();
  const { t: i18nT } = useI18n();
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null);
  // Mirror selectedSession into a ref so handleCwdChange can see the
  // latest value without depending on it (re-creating the callback would
  // cascade into the sidebar).
  const selectedSessionRef = useRef<SessionInfo | null>(selectedSession);
  selectedSessionRef.current = selectedSession;
  // When user clicks +, we only store the cwd — no fake session id
  const [newSessionCwd, setNewSessionCwd] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sessionKey, setSessionKey] = useState(0);
  const [explorerRefreshKey, setExplorerRefreshKey] = useState(0);
  const [modelsConfigOpen, setModelsConfigOpen] = useState(false);
  const [modelsRefreshKey, setModelsRefreshKey] = useState(0);
  const [skillsConfigOpen, setSkillsConfigOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(0.4);
  const terminalCwd = useMemo(() => selectedSession?.cwd ?? null, [selectedSession]);
  const chatInputRef = useRef<ChatInputHandle | null>(null);
  const topBarRef = useRef<HTMLDivElement>(null);
  const [workbenchView, setWorkbenchView] = useState<"home" | "settings" | "chat">("home");
  const [preferredCwd, setPreferredCwd] = useState<string | null>(null);
  const [toolMode, setToolMode] = useState<ToolMode>("full");
  const [startingChat, setStartingChat] = useState(false);
  const [startChatError, setStartChatError] = useState<string | null>(null);
  const [sessionRestoreNotice, setSessionRestoreNotice] = useState<string | null>(null);

  // Branch navigator state — populated by ChatWindow via onBranchDataChange
  const [branchTree, setBranchTree] = useState<SessionTreeNode[]>([]);
  const [branchActiveLeafId, setBranchActiveLeafId] = useState<string | null>(null);
  const branchLeafChangeFnRef = useRef<((leafId: string | null) => void) | null>(null);
  const [branchNavigating, setBranchNavigating] = useState(false);

  const handleBranchDataChange = useCallback((tree: SessionTreeNode[], activeLeafId: string | null, onLeafChange: (leafId: string | null) => void) => {
    setBranchTree(tree);
    setBranchActiveLeafId(activeLeafId);
    branchLeafChangeFnRef.current = onLeafChange;
  }, []);

  const handleBranchLeafChange = useCallback((leafId: string | null) => {
    branchLeafChangeFnRef.current?.(leafId);
  }, []);

  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const systemBtnRef = useRef<HTMLButtonElement>(null);

  const handleSystemPromptChange = useCallback((prompt: string | null) => {
    setSystemPrompt(prompt);
  }, []);

  // Session stats (tokens + cost) — populated by ChatWindow, displayed in top bar
  const [sessionStats, setSessionStats] = useState<{ tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }; cost?: number } | null>(null);
  const handleSessionStatsChange = useCallback((stats: { tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }; cost?: number } | null) => {
    setSessionStats(stats);
  }, []);

  // Context usage — populated by ChatWindow, displayed in top bar
  const [contextUsage, setContextUsage] = useState<{ percent: number | null; contextWindow: number; tokens: number | null } | null>(null);
  const handleContextUsageChange = useCallback((usage: { percent: number | null; contextWindow: number; tokens: number | null } | null) => {
    setContextUsage(usage);
  }, []);

  // Single active panel — only one dropdown open at a time
  const [activeTopPanel, setActiveTopPanel] = useState<"branches" | "system" | null>(null);
  const [topPanelPos, setTopPanelPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const toggleTopPanel = useCallback((panel: "branches" | "system") => {
    setActiveTopPanel((cur) => cur === panel ? null : panel);
  }, []);

  useEffect(() => {
    if (!activeTopPanel || !topBarRef.current) return;
    const update = () => {
      const rect = topBarRef.current!.getBoundingClientRect();
      setTopPanelPos({ top: rect.bottom, left: rect.left, width: rect.width });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(topBarRef.current);
    return () => ro.disconnect();
  }, [activeTopPanel]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth <= 640) setSidebarOpen(false);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onPaired = () => setRefreshKey((key) => key + 1);
    window.addEventListener("pi-web-pairing-success", onPaired);
    return () => window.removeEventListener("pi-web-pairing-success", onPaired);
  }, []);

  // Right panel — file tabs only
  const [fileTabs, setFileTabs] = useState<Tab[]>([]);
  const [activeFileTabId, setActiveFileTabId] = useState<string | null>(null);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);

  const handleAtMention = useCallback((relativePath: string) => {
    chatInputRef.current?.insertText("`" + relativePath + "`");
  }, []);

  const [initialSessionId] = useState<string | null>(() => searchParams.get("session"));
  const [activeCwd, setActiveCwd] = useState<string | null>(null);
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  // True once the initial ?session= URL param has been resolved (or confirmed absent)
  const [initialSessionRestored, setInitialSessionRestored] = useState<boolean>(() => !searchParams.get("session"));
  // Suppresses sessionKey bump in handleCwdChange during the initial URL restore
  const suppressCwdBumpRef = useRef(false);

  useEffect(() => {
    void fetch("/api/preferences")
      .then((res) => res.json())
      .then((data: { preferences?: { defaultWorkspaceCwd?: string; toolMode?: ToolMode } }) => {
        if (data.preferences) {
          cachePiWebPreferences(data.preferences);
        }
        if (data.preferences?.defaultWorkspaceCwd) {
          setPreferredCwd(data.preferences.defaultWorkspaceCwd);
          setActiveCwd(data.preferences.defaultWorkspaceCwd);
        }
        if (data.preferences?.toolMode) {
          setToolMode(data.preferences.toolMode);
        }
      })
      .catch(() => {});
  }, []);

  const ensureWorkbenchCwd = useCallback(async () => {
    const existing = activeCwd ?? selectedSession?.cwd ?? newSessionCwd ?? preferredCwd;
    if (existing) return existing;
    const res = await fetch("/api/default-cwd", { method: "POST" });
    const data = await res.json() as { cwd?: string; error?: string };
    if (!res.ok || !data.cwd) {
      throw new Error(data.error ?? "Unable to create default workspace");
    }
    setActiveCwd(data.cwd);
    return data.cwd;
  }, [activeCwd, newSessionCwd, preferredCwd, selectedSession?.cwd]);

  const resetChatChrome = useCallback(() => {
    setBranchTree([]);
    setBranchActiveLeafId(null);
    setSystemPrompt(null);
    setActiveTopPanel(null);
  }, []);

  // Fetch git branch name for the current cwd
  useEffect(() => {
    const cwd = activeCwd ?? selectedSession?.cwd;
    if (!cwd) { setGitBranch(null); return; }
    fetch(`/api/git-branch?cwd=${encodeURIComponent(cwd)}`)
      .then((res) => res.json())
      .then((data: { branch: string | null }) => setGitBranch(data.branch))
      .catch(() => setGitBranch(null));
  }, [activeCwd, selectedSession?.cwd]);

  useEffect(() => {
    if (!gitBranch && !hasFork(branchTree)) {
      setActiveTopPanel((cur) => (cur === "branches" ? null : cur));
    }
  }, [gitBranch, branchTree]);

  const handleCwdChange = useCallback((cwd: string | null) => {
    setActiveCwd(cwd);
    // Skip if cwd is null (initial mount) or during the initial URL restore.
    if (!cwd || suppressCwdBumpRef.current) return;
    // Close any session that belongs to a different cwd — it no longer
    // matches the selected project directory.
    setSelectedSession((prev) => {
      if (prev && prev.cwd !== cwd) return null;
      return prev;
    });
    setNewSessionCwd((prev) => {
      if (prev && prev !== cwd) return null;
      return prev;
    });
    // If a session is already selected for the new cwd (e.g. the sidebar
    // dropdown just auto-opened the most recent session for this project),
    // keep the chat view — handleSelectSession already did the work of
    // setting workbenchView, sessionKey, and the ?session= URL.
    if (selectedSessionRef.current && selectedSessionRef.current.cwd === cwd) {
      // Still refresh the sidebar list so a brand-new cwd / custom path
      // reflects pre-existing sessions immediately.
      setRefreshKey((k) => k + 1);
      return;
    }
    setWorkbenchView("home");
    setSessionKey((k) => k + 1);
    // Re-fetch the session list so a brand-new cwd (default dir / custom path
    // / new folder) shows its pre-existing sessions, and so the next
    // handleSessionCreated reflects the correct cwd-filtered tree.
    setRefreshKey((k) => k + 1);
    resetChatChrome();
    router.replace("/", { scroll: false });
  }, [resetChatChrome, router]);

  const handleSelectSession = useCallback((session: SessionInfo, isRestore = false) => {
    setNewSessionCwd(null);
    setSelectedSession(session);
    setWorkbenchView("chat");
    setSessionKey((k) => k + 1);
    setSystemPrompt(null);
    setInitialSessionRestored(true);
    if (isRestore) {
      // Suppress the redundant sessionKey bump that would come from the
      // onCwdChange effect firing after setSelectedCwd in the sidebar
      suppressCwdBumpRef.current = true;
      setTimeout(() => { suppressCwdBumpRef.current = false; }, 0);
    }
    // Skip router.replace when restoring from URL — the param is already correct
    // and calling replace in production Next.js triggers a Suspense remount loop
    if (!isRestore) {
      router.replace(`?session=${encodeURIComponent(session.id)}`, { scroll: false });
    }
  }, [router]);

  const handleNewSession = useCallback((_sessionId: string, cwd: string) => {
    setSelectedSession(null);
    setNewSessionCwd(cwd);
    setWorkbenchView("chat");
    setSessionKey((k) => k + 1);
    resetChatChrome();
    router.replace("/", { scroll: false });
  }, [resetChatChrome, router]);

  const handleStartChat = useCallback(async () => {
    setStartingChat(true);
    setStartChatError(null);
    try {
      const cwd = await ensureWorkbenchCwd();
      setSelectedSession(null);
      setNewSessionCwd(cwd);
      setWorkbenchView("chat");
      setSessionKey((k) => k + 1);
      resetChatChrome();
      router.replace("/", { scroll: false });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setStartChatError(
        message === "Unable to create default workspace"
          ? i18nT("appShell.createDefaultWorkspaceError")
          : message,
      );
    } finally {
      setStartingChat(false);
    }
  }, [ensureWorkbenchCwd, i18nT, resetChatChrome, router]);

  // Called by ChatWindow when a new session gets its real id from pi
  const handleSessionCreated = useCallback((session: SessionInfo) => {
    setNewSessionCwd(null);
    setSelectedSession(session);
    setRefreshKey((k) => k + 1);
    router.replace(`?session=${encodeURIComponent(session.id)}`, { scroll: false });
  }, [router]);

  const handleAgentEnd = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setExplorerRefreshKey((k) => k + 1);
  }, []);

  const handleSessionRenamed = useCallback((sessionId: string, name: string) => {
    setRefreshKey((k) => k + 1);
    setSelectedSession((prev) => (prev?.id === sessionId ? { ...prev, name } : prev));
  }, []);

  const handleSessionForked = useCallback(async (newSessionId: string) => {
    setRefreshKey((k) => k + 1);
    setSessionKey((k) => k + 1);
    setNewSessionCwd(null);
    setWorkbenchView("chat");
    const info = await fetchSessionInfo(newSessionId);
    if (info) {
      setSelectedSession(info);
    } else {
      setSelectedSession((prev) => ({
        ...(prev ?? { path: "", cwd: "", created: "", modified: "", messageCount: 0, firstMessage: "" }),
        id: newSessionId,
      }));
    }
    router.replace(`?session=${encodeURIComponent(newSessionId)}`, { scroll: false });
  }, [router]);

  const handleInitialRestoreDone = useCallback((found: boolean) => {
    setInitialSessionRestored(true);
    if (!found) {
      router.replace("/", { scroll: false });
      setSessionRestoreNotice(i18nT("appShell.sessionNotFound"));
    }
  }, [router, i18nT]);

  const handleSessionDeleted = useCallback((sessionId: string) => {
    setRefreshKey((k) => k + 1);
    if (selectedSession?.id === sessionId) {
      const cwd = selectedSession.cwd;
      setSelectedSession(null);
      setNewSessionCwd(cwd ?? null);
      setWorkbenchView("chat");
      setSessionKey((k) => k + 1);
      resetChatChrome();
      router.replace("/", { scroll: false });
    }
  }, [resetChatChrome, selectedSession, router]);

  const handleOpenHome = useCallback(() => {
    setStartChatError(null);
    setSessionRestoreNotice(null);
    setSelectedSession(null);
    setNewSessionCwd(null);
    setWorkbenchView("home");
    setSessionKey((k) => k + 1);
    resetChatChrome();
    router.replace("/", { scroll: false });
  }, [resetChatChrome, router]);

  const handleOpenSettingsView = useCallback(() => {
    setSelectedSession(null);
    setNewSessionCwd(null);
    setWorkbenchView("settings");
    setSessionKey((k) => k + 1);
    resetChatChrome();
    router.replace("/", { scroll: false });
  }, [resetChatChrome, router]);

  const handleOpenModelsConfig = useCallback(() => {
    setModelsConfigOpen(true);
  }, []);

  const handleOpenHistoryItem = useCallback((item: ProductHistoryItem) => {
    setNewSessionCwd(null);
    setSelectedSession({
      id: item.sessionId,
      path: item.path,
      cwd: item.cwd,
      created: item.startedAt,
      modified: item.updatedAt,
      messageCount: item.messageCount,
      firstMessage: item.firstMessage,
      productTitle: item.title,
      productStatus: item.status,
      lastResultSummary: item.summary,
    });
    setWorkbenchView("chat");
    setSessionKey((k) => k + 1);
    resetChatChrome();
    router.replace(`?session=${encodeURIComponent(item.sessionId)}`, { scroll: false });
  }, [resetChatChrome, router]);

  const handleOpenFile = useCallback((filePath: string, fileName: string) => {
    const kind = resolveFilePreviewKind(filePath, fileName);
    if (!canPreviewInApp(kind) && canOpenWithSystemApp()) {
      void openFileWithSystemApp(filePath);
    }
    const tabId = `file:${filePath}`;
    setFileTabs((prev) => {
      if (prev.find((t) => t.id === tabId)) return prev;
      return [...prev, { id: tabId, label: fileName, filePath }];
    });
    setActiveFileTabId(tabId);
    setRightPanelOpen(true);
  }, []);

  const handleCloseFileTab = useCallback((tabId: string) => {
    setFileTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId);
      if (next.length === 0) setRightPanelOpen(false);
      return next;
    });
    setActiveFileTabId((cur) => {
      if (cur !== tabId) return cur;
      const remaining = fileTabs.filter((t) => t.id !== tabId);
      return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
    });
  }, [fileTabs]);

  // Show chat area if a session is selected, or if we have a cwd to start a new session in
  const effectiveNewSessionCwd = newSessionCwd ?? (workbenchView === "chat" && selectedSession === null && activeCwd ? activeCwd : null);
  const showChat = selectedSession !== null || effectiveNewSessionCwd !== null;
  const restoringInitialSession = Boolean(initialSessionId) && !initialSessionRestored;
  const showPlaceholder = initialSessionRestored && !showChat;
  const settingsSkillsDisabled = !activeCwd && !selectedSession?.cwd && !newSessionCwd;

  const activeFileTab = fileTabs.find((t) => t.id === activeFileTabId) ?? null;
  const topBarBackground = "var(--bg-elevated)";
  const showBranchNavigator = Boolean(gitBranch) || hasFork(branchTree);
  const showHomeTabActive = workbenchView === "home" && !showChat;

  useEffect(() => {
    const view = searchParams.get("view");
    if (view === "accounts") {
      setSelectedSession(null);
      setNewSessionCwd(null);
      setWorkbenchView("settings");
      setSessionKey((k) => k + 1);
      resetChatChrome();
      setModelsConfigOpen(true);
      router.replace("/?view=settings", { scroll: false });
    }
  }, [resetChatChrome, router, searchParams]);

  const sidebarContent = (
    <>
      <SessionSidebar
        selectedSessionId={selectedSession?.id ?? null}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onOpenSettings={handleOpenSettingsView}
        isSettingsView={workbenchView === "settings"}
        initialSessionId={initialSessionId}
        onInitialRestoreDone={handleInitialRestoreDone}
        refreshKey={refreshKey}
        onSessionDeleted={handleSessionDeleted}
        onSessionRenamed={handleSessionRenamed}
        pinnedSession={selectedSession}
        selectedCwd={selectedSession?.cwd ?? newSessionCwd ?? activeCwd ?? null}
        onCwdChange={handleCwdChange}
        onOpenFile={handleOpenFile}
        explorerRefreshKey={explorerRefreshKey}
        onAtMention={handleAtMention}
      />
    </>
  );

  return (
    <>
    <RemotePairingHandler />
    <RemoteAccessBanner />
    <ServerConnectionBanner />
    <div style={{ display: "flex", height: "100dvh", overflow: "hidden", background: "linear-gradient(180deg, var(--bg) 0%, color-mix(in srgb, var(--bg) 88%, var(--bg-elevated)) 100%)" }}>
      {/* Mobile overlay backdrop */}
      <div
        className="sidebar-overlay-backdrop"
        onClick={() => setSidebarOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 199,
          background: "rgba(0,0,0,0.4)",
          opacity: sidebarOpen ? 1 : 0,
          pointerEvents: sidebarOpen ? "auto" : "none",
          transition: "opacity 0.25s ease",
        }}
      />

      {/* Left sidebar */}
      <div
        className={`sidebar-container${sidebarOpen ? " sidebar-open" : " sidebar-closed"}`}
        style={{
          background: "var(--bg-panel)",
          borderRight: "1px solid var(--border)",
          backdropFilter: "var(--chrome-blur)",
          WebkitBackdropFilter: "var(--chrome-blur)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          zIndex: 200,
        }}
      >
        {sidebarContent}
      </div>

      {/* Center: chat */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Top bar with sidebar toggle */}
        <div ref={topBarRef} style={{ display: "flex", alignItems: "center", flexShrink: 0, borderBottom: "1px solid var(--border-strong)", height: 38, background: topBarBackground }}>
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? i18nT("appShell.hideSidebar") : i18nT("appShell.showSidebar")}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 38, height: 38, padding: 0,
              background: "none", border: "none", borderRight: "1px solid var(--border)",
              color: "var(--text-muted)", cursor: "pointer", flexShrink: 0, transition: "color 0.12s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            {sidebarOpen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
          <button
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              toggleTheme({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
            }}
            title={isDark ? i18nT("appShell.switchToLightMode") : i18nT("appShell.switchToDarkMode")}
            aria-label={isDark ? i18nT("appShell.switchToLightMode") : i18nT("appShell.switchToDarkMode")}
            aria-pressed={isDark}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 38, height: 38, padding: 0,
              background: "none", border: "none", borderRight: "1px solid var(--border)",
              color: "var(--text-muted)", cursor: "pointer", flexShrink: 0, transition: "color 0.12s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            {isDark ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          <div style={{ display: "flex", alignItems: "center", height: "100%", borderRight: "1px solid var(--border)" }}>
            <button
              type="button"
              onClick={handleOpenHome}
              style={{
                height: "100%",
                padding: "0 12px",
                border: "none",
                borderTop: showHomeTabActive ? "2px solid var(--accent)" : "2px solid transparent",
                background: showHomeTabActive ? "var(--bg-popover)" : topBarBackground,
                color: showHomeTabActive ? "var(--text)" : "var(--text-muted)",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {i18nT("appShell.home")}
            </button>
          </div>
          {showChat && (
            <div className="chat-branch-tools" style={{ display: "flex", alignItems: "stretch", height: "100%" }}>
              {showBranchNavigator ? (
                <BranchNavigator
                  tree={branchTree}
                  activeLeafId={branchActiveLeafId}
                  onLeafChange={handleBranchLeafChange}
                  gitBranch={gitBranch}
                  branchNavigating={branchNavigating}
                  inline
                  containerRef={topBarRef}
                  open={activeTopPanel === "branches"}
                  onToggle={() => toggleTopPanel("branches")}
                  hasSession
                />
              ) : null}
              <button
                ref={systemBtnRef}
                onClick={() => toggleTopPanel("system")}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  height: "100%", boxSizing: "border-box", padding: "0 12px",
                  background: activeTopPanel === "system" ? "var(--bg-popover)" : topBarBackground,
                  border: "none",
                  borderTop: activeTopPanel === "system" ? "2px solid var(--accent)" : "2px solid transparent",
                  borderRight: "1px solid var(--border)",
                  cursor: "pointer",
                  color: activeTopPanel === "system" ? "var(--text)" : "var(--text-muted)",
                  fontSize: 11, whiteSpace: "nowrap", transition: "color 0.1s, background 0.1s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = activeTopPanel === "system" ? "var(--text)" : "var(--text-muted)"; }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: systemPrompt ? "var(--accent)" : "var(--text-dim)", flexShrink: 0 }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="8" y1="13" x2="16" y2="13" />
                  <line x1="8" y1="17" x2="13" y2="17" />
                </svg>
                <span>{i18nT("appShell.system")}</span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--text-dim)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 2, transform: activeTopPanel === "system" ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
                  <polyline points="2 3.5 5 6.5 8 3.5" />
                </svg>
              </button>
            </div>
          )}
          {/* Terminal toggle — inside top bar, to the left of usage report */}
          <button
            onClick={() => setTerminalOpen((v) => !v)}
            disabled={!terminalCwd}
            title={terminalCwd ? (terminalOpen ? "Close terminal" : "Open terminal") : "Open a session first"}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              height: 38, padding: "0 10px", flexShrink: 0, marginLeft: "auto",
              background: "none", border: "none", borderLeft: "1px solid var(--border)",
              color: terminalOpen ? "var(--text)" : "#000",
              cursor: terminalCwd ? "pointer" : "not-allowed",
              font: "inherit", fontSize: 13, fontWeight: 700,
              opacity: terminalCwd ? 1 : 0.4, transition: "color 0.12s, opacity 0.12s",
            }}
            onMouseEnter={(e) => { if (terminalCwd) e.currentTarget.style.color = "#000"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = terminalOpen ? "var(--text)" : "#000"; }}
          >
            {"\u003E_"}
          </button>
          {showChat && (
            <SessionReportButton
              sessionStats={sessionStats}
              contextUsage={contextUsage}
              paddingRight={rightPanelOpen ? 12 : 48}
            />
          )}
          {/* Top panel dropdown — shared, only one active at a time */}
          {activeTopPanel && topPanelPos && (
            <div style={{
              position: "fixed",
              top: topPanelPos.top,
              left: topPanelPos.left,
              width: topPanelPos.width,
              zIndex: 500,
            }}>
              {activeTopPanel === "system" && (
                <div style={{
                  background: "var(--bg-popover)",
                  borderTop: "1px solid var(--border)",
                  borderBottom: "1px solid var(--border)",
                  boxShadow: "var(--shadow-popover)",
                }}>
                  {systemPrompt ? (
                    <div style={{
                      maxHeight: "min(600px, 75vh)",
                      overflowY: "auto",
                      padding: "12px 16px",
                      color: "var(--text-muted)",
                      fontSize: 12,
                      lineHeight: 1.6,
                      whiteSpace: "pre-wrap",
                      fontFamily: "var(--font-mono)",
                    }}>
                      {systemPrompt}
                    </div>
                  ) : systemPrompt === "" ? (
                    <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                      {i18nT("appShell.systemPromptEmpty")}
                    </div>
                  ) : (
                    <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                      {i18nT("appShell.systemPromptLoadHint")}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Chat content */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          {showChat ? (
            <ChatWindow
              key={sessionKey}
              session={selectedSession}
              newSessionCwd={effectiveNewSessionCwd}
              onAgentEnd={handleAgentEnd}
              onSessionCreated={handleSessionCreated}
              onSessionForked={handleSessionForked}
              modelsRefreshKey={modelsRefreshKey}
              chatInputRef={chatInputRef}
              onBranchDataChange={handleBranchDataChange}
              onBranchNavigatingChange={setBranchNavigating}
              onSystemPromptChange={handleSystemPromptChange}
              onSessionStatsChange={handleSessionStatsChange}
              onContextUsageChange={handleContextUsageChange}
              toolMode={toolMode}
              onOpenModels={handleOpenModelsConfig}
              onOpenSettings={handleOpenSettingsView}
              onOpenFile={handleOpenFile}
            />
          ) : showPlaceholder ? (
            workbenchView === "settings" ? (
              <WorkbenchSettings
                onOpenModels={handleOpenModelsConfig}
                onOpenSkills={() => setSkillsConfigOpen(true)}
                skillsDisabled={settingsSkillsDisabled}
              />
            ) : (
              <WorkbenchHome
                onStartChat={() => { void handleStartChat(); }}
                onOpenHistory={handleOpenHistoryItem}
                startingChat={startingChat}
                startChatError={startChatError}
                sessionRestoreNotice={sessionRestoreNotice}
              />
            )
          ) : restoringInitialSession ? (
            <div
              style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-muted)",
                fontSize: 13,
              }}
            >
              {i18nT("appShell.restoringSession")}
            </div>
          ) : null}
        </div>

        {/* Terminal drawer at the bottom of the center column */}
        {terminalCwd && (
          <TerminalPanel
            key={terminalCwd}
            cwd={terminalCwd}
            open={terminalOpen}
            height={terminalHeight}
            onClose={() => setTerminalOpen(false)}
            onHeightChange={setTerminalHeight}
          />
        )}
      </div>

      {/* Right panel: file viewer — always mounted, width animated via CSS */}
      <div
        className={`right-panel-container${rightPanelOpen ? " right-panel-open" : " right-panel-closed"}`}
        style={{
          display: "flex",
          flexDirection: "column",
          borderLeft: "1px solid var(--border)",
          background: "var(--bg-elevated)",
        }}
      >
        {/* Right panel tab bar */}
        <div style={{ display: "flex", alignItems: "center", flexShrink: 0, background: topBarBackground, borderBottom: "1px solid var(--border-strong)", height: 38 }}>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <TabBar
              tabs={fileTabs}
              activeTabId={activeFileTabId ?? ""}
              onSelectTab={setActiveFileTabId}
              onCloseTab={handleCloseFileTab}
            />
          </div>

        </div>

        {/* File content */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {activeFileTab?.filePath ? (
            <FileViewer
              filePath={activeFileTab.filePath}
              displayLabel={activeFileTab.label}
              cwd={activeCwd ?? undefined}
            />
          ) : (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontSize: 12 }}>
              {i18nT("appShell.noFileOpen")}
            </div>
          )}
        </div>
      </div>
    </div>
    {/* File panel toggle — always visible at top-right */}
    <button
      onClick={() => setRightPanelOpen((v) => !v)}
      title={rightPanelOpen ? i18nT("appShell.hideFilePanel") : i18nT("appShell.showFilePanel")}
      style={{
        position: "fixed", top: 0, right: 0, zIndex: 300,
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 36, height: 36, padding: 0,
        background: topBarBackground, border: "none", borderLeft: "1px solid var(--border-strong)", borderBottom: "1px solid var(--border-strong)",
        color: rightPanelOpen ? "var(--text)" : "var(--text-muted)",
        cursor: "pointer", transition: "color 0.12s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = rightPanelOpen ? "var(--text)" : "var(--text-muted)"; }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="15" y1="3" x2="15" y2="21" />
      </svg>
    </button>
    {modelsConfigOpen && (
      <ModelsConfig
        onClose={() => { setModelsConfigOpen(false); setModelsRefreshKey((k) => k + 1); }}
        onModelsChanged={() => setModelsRefreshKey((k) => k + 1)}
      />
    )}
    {skillsConfigOpen && (activeCwd ?? selectedSession?.cwd ?? newSessionCwd) && (
      <SkillsConfig cwd={(activeCwd ?? selectedSession?.cwd ?? newSessionCwd)!} onClose={() => setSkillsConfigOpen(false)} />
    )}
    </>
  );
}
