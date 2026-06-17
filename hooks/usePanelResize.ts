"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

export const LEFT_SIDEBAR_WIDTH_STORAGE_KEY = "pi-web:left-sidebar-width";
export const RIGHT_PANEL_WIDTH_STORAGE_KEY = "pi-web:right-panel-width";
export const DEFAULT_LEFT_SIDEBAR_WIDTH = 260;
export const DEFAULT_RIGHT_PANEL_WIDTH = 520;
export const MIN_LEFT_SIDEBAR_WIDTH = 220;
export const MIN_RIGHT_PANEL_WIDTH = 300;
/** Smallest width the center (chat) column is allowed to keep. */
export const MIN_CENTER_WIDTH = 360;

const ARROW_STEP = 16;
const ARROW_STEP_LARGE = 48;

export type ResizePanel = "left" | "right";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Largest width a panel may take while still leaving room for the opposite
 * panel and a MIN_CENTER_WIDTH-wide center column. Pure — the viewport width is
 * passed in so it can be unit-tested without a DOM.
 */
export function getMaxPanelWidth(minWidth: number, oppositePanelWidth: number, viewportWidth: number): number {
  return Math.max(minWidth, viewportWidth - oppositePanelWidth - MIN_CENTER_WIDTH);
}

export function readStoredPanelWidth(key: string, fallback: number, min: number): number {
  if (typeof window === "undefined") return fallback;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return fallback;
  }
  if (!raw) return fallback;
  const stored = Number(raw);
  const max = Math.max(min, window.innerWidth - MIN_CENTER_WIDTH);
  return Number.isFinite(stored) ? clamp(stored, min, max) : fallback;
}

export function persistPanelWidth(key: string, value: number): void {
  // setItem throws in private mode / when storage is disabled or full; a failed
  // persist must never abort the resize teardown (which would leave the
  // full-screen drag overlay mounted and lock the UI).
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    /* best-effort persistence only */
  }
}

export type ResizeKeyIntent =
  | { type: "delta"; delta: number }
  | { type: "min" }
  | { type: "max" };

/**
 * Maps a keydown on a resize handle to a width intent, or null to ignore the
 * key. Arrow keys move the splitter spatially, so the sign flips per side (the
 * sidebar widens as its right-edge handle moves right; the file panel widens as
 * its left-edge handle moves left). Home/End jump to the panel's min/max width.
 */
export function resizeKeyIntent(panel: ResizePanel, key: string, step: number): ResizeKeyIntent | null {
  switch (key) {
    case "ArrowLeft":
      return { type: "delta", delta: panel === "left" ? -step : step };
    case "ArrowRight":
      return { type: "delta", delta: panel === "left" ? step : -step };
    case "Home":
      return { type: "min" };
    case "End":
      return { type: "max" };
    default:
      return null;
  }
}

interface UsePanelResizeOptions {
  sidebarOpen: boolean;
  rightPanelOpen: boolean;
}

export interface PanelResizeApi {
  sidebarWidth: number;
  rightPanelWidth: number;
  resizingPanel: ResizePanel | null;
  /** Undefined until mounted so the attribute is omitted during SSR/hydration. */
  sidebarMaxWidth: number | undefined;
  rightPanelMaxWidth: number | undefined;
  beginPanelResize: (panel: ResizePanel, event: ReactPointerEvent<HTMLDivElement>) => void;
  handlePanelResizeKeyDown: (panel: ResizePanel, event: ReactKeyboardEvent<HTMLDivElement>) => void;
}

/**
 * Drag- and keyboard-resizable side panel widths, persisted to localStorage and
 * kept within the viewport. The opposite panel's open state is supplied by the
 * caller so the maximum width always reserves space for it plus the center.
 */
export function usePanelResize({ sidebarOpen, rightPanelOpen }: UsePanelResizeOptions): PanelResizeApi {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_LEFT_SIDEBAR_WIDTH);
  const [rightPanelWidth, setRightPanelWidth] = useState(DEFAULT_RIGHT_PANEL_WIDTH);
  const [resizingPanel, setResizingPanel] = useState<ResizePanel | null>(null);
  const [viewportWidth, setViewportWidth] = useState<number | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  // Mirror the latest open state + widths so the mount-stable resize listener can
  // read them without re-subscribing on every width change (which would thrash
  // during a drag).
  const latestRef = useRef({ sidebarWidth, rightPanelWidth, sidebarOpen, rightPanelOpen });
  latestRef.current = { sidebarWidth, rightPanelWidth, sidebarOpen, rightPanelOpen };

  // Restore persisted widths after mount (localStorage is client-only).
  useEffect(() => {
    setSidebarWidth(readStoredPanelWidth(LEFT_SIDEBAR_WIDTH_STORAGE_KEY, DEFAULT_LEFT_SIDEBAR_WIDTH, MIN_LEFT_SIDEBAR_WIDTH));
    setRightPanelWidth(readStoredPanelWidth(RIGHT_PANEL_WIDTH_STORAGE_KEY, DEFAULT_RIGHT_PANEL_WIDTH, MIN_RIGHT_PANEL_WIDTH));
  }, []);

  // Track the viewport width (for aria-valuemax) and re-clamp widths so the
  // center column never collapses below MIN_CENTER_WIDTH when the window shrinks.
  // Each panel's max reserves room for the opposite (open) panel, matching the
  // drag/keyboard paths; the self width uses a functional update so a persisted
  // width restored on mount is clamped rather than overwritten.
  useEffect(() => {
    const onResize = () => {
      const vw = window.innerWidth;
      setViewportWidth(vw);
      const { sidebarWidth: sw, rightPanelWidth: rw, sidebarOpen: so, rightPanelOpen: ro } = latestRef.current;
      setSidebarWidth((w) => clamp(w, MIN_LEFT_SIDEBAR_WIDTH, getMaxPanelWidth(MIN_LEFT_SIDEBAR_WIDTH, ro ? rw : 0, vw)));
      setRightPanelWidth((w) => clamp(w, MIN_RIGHT_PANEL_WIDTH, getMaxPanelWidth(MIN_RIGHT_PANEL_WIDTH, so ? sw : 0, vw)));
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Tear down a drag in progress if the consumer unmounts mid-resize.
  useEffect(() => {
    return () => {
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = null;
    };
  }, []);

  const oppositeWidth = (panel: ResizePanel): number =>
    panel === "left" ? (rightPanelOpen ? rightPanelWidth : 0) : (sidebarOpen ? sidebarWidth : 0);

  const beginPanelResize = (panel: ResizePanel, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();

    const minWidth = panel === "left" ? MIN_LEFT_SIDEBAR_WIDTH : MIN_RIGHT_PANEL_WIDTH;
    const storageKey = panel === "left" ? LEFT_SIDEBAR_WIDTH_STORAGE_KEY : RIGHT_PANEL_WIDTH_STORAGE_KEY;
    let latestWidth = panel === "left" ? sidebarWidth : rightPanelWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    const controller = new AbortController();

    setResizingPanel(panel);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      // Recompute the bound on each move so a window resize mid-drag is respected.
      const maxWidth = getMaxPanelWidth(minWidth, oppositeWidth(panel), window.innerWidth);
      const rawWidth = panel === "left" ? moveEvent.clientX : window.innerWidth - moveEvent.clientX;
      const nextWidth = clamp(Math.round(rawWidth), minWidth, maxWidth);
      latestWidth = nextWidth;
      if (panel === "left") setSidebarWidth(nextWidth);
      else setRightPanelWidth(nextWidth);
    };

    // Side-effect-only teardown (no setState) so it is safe to run from the
    // unmount cleanup as well as from finishResize.
    const releaseResize = () => {
      controller.abort();
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      persistPanelWidth(storageKey, latestWidth);
      resizeCleanupRef.current = null;
    };

    const finishResize = () => {
      releaseResize();
      setResizingPanel(null);
    };

    resizeCleanupRef.current = releaseResize;
    window.addEventListener("pointermove", handlePointerMove, { signal: controller.signal });
    window.addEventListener("pointerup", finishResize, { signal: controller.signal });
    window.addEventListener("pointercancel", finishResize, { signal: controller.signal });
  };

  const commitPanelWidth = (panel: ResizePanel, compute: (current: number, min: number, max: number) => number) => {
    const minWidth = panel === "left" ? MIN_LEFT_SIDEBAR_WIDTH : MIN_RIGHT_PANEL_WIDTH;
    const maxWidth = getMaxPanelWidth(minWidth, oppositeWidth(panel), window.innerWidth);
    const storageKey = panel === "left" ? LEFT_SIDEBAR_WIDTH_STORAGE_KEY : RIGHT_PANEL_WIDTH_STORAGE_KEY;
    const current = panel === "left" ? sidebarWidth : rightPanelWidth;
    const next = clamp(compute(current, minWidth, maxWidth), minWidth, maxWidth);
    if (next === current) return;
    if (panel === "left") setSidebarWidth(next);
    else setRightPanelWidth(next);
    persistPanelWidth(storageKey, next);
  };

  const handlePanelResizeKeyDown = (panel: ResizePanel, event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? ARROW_STEP_LARGE : ARROW_STEP;
    const intent = resizeKeyIntent(panel, event.key, step);
    if (!intent) return;
    event.preventDefault();
    if (intent.type === "delta") commitPanelWidth(panel, (current) => current + intent.delta);
    else if (intent.type === "min") commitPanelWidth(panel, (_current, min) => min);
    else commitPanelWidth(panel, (_current, _min, max) => max);
  };

  const sidebarMaxWidth = viewportWidth == null
    ? undefined
    : getMaxPanelWidth(MIN_LEFT_SIDEBAR_WIDTH, rightPanelOpen ? rightPanelWidth : 0, viewportWidth);
  const rightPanelMaxWidth = viewportWidth == null
    ? undefined
    : getMaxPanelWidth(MIN_RIGHT_PANEL_WIDTH, sidebarOpen ? sidebarWidth : 0, viewportWidth);

  return {
    sidebarWidth,
    rightPanelWidth,
    resizingPanel,
    sidebarMaxWidth,
    rightPanelMaxWidth,
    beginPanelResize,
    handlePanelResizeKeyDown,
  };
}
