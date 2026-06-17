import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clamp,
  getMaxPanelWidth,
  persistPanelWidth,
  readStoredPanelWidth,
  resizeKeyIntent,
} from "./usePanelResize";

describe("clamp", () => {
  it("returns the value when within range", () => {
    expect(clamp(50, 0, 100)).toBe(50);
  });

  it("clamps below min and above max", () => {
    expect(clamp(-10, 0, 100)).toBe(0);
    expect(clamp(150, 0, 100)).toBe(100);
  });
});

describe("getMaxPanelWidth", () => {
  it("reserves room for the opposite panel and the center column", () => {
    // 1400 - 300 (opposite) - 360 (center) = 740
    expect(getMaxPanelWidth(220, 300, 1400)).toBe(740);
  });

  it("never drops below the panel's own min on a narrow viewport", () => {
    // 800 - 300 - 360 = 140, floored to the 220 min
    expect(getMaxPanelWidth(220, 300, 800)).toBe(220);
  });

  it("uses the full remainder when the opposite panel is closed", () => {
    expect(getMaxPanelWidth(300, 0, 1200)).toBe(840);
  });
});

describe("resizeKeyIntent", () => {
  const STEP = 16;

  it("widens the sidebar on ArrowRight and shrinks it on ArrowLeft", () => {
    expect(resizeKeyIntent("left", "ArrowRight", STEP)).toEqual({ type: "delta", delta: 16 });
    expect(resizeKeyIntent("left", "ArrowLeft", STEP)).toEqual({ type: "delta", delta: -16 });
  });

  it("widens the file panel on ArrowLeft and shrinks it on ArrowRight", () => {
    expect(resizeKeyIntent("right", "ArrowLeft", STEP)).toEqual({ type: "delta", delta: 16 });
    expect(resizeKeyIntent("right", "ArrowRight", STEP)).toEqual({ type: "delta", delta: -16 });
  });

  it("maps Home to min and End to max for both panels", () => {
    expect(resizeKeyIntent("left", "Home", STEP)).toEqual({ type: "min" });
    expect(resizeKeyIntent("left", "End", STEP)).toEqual({ type: "max" });
    expect(resizeKeyIntent("right", "Home", STEP)).toEqual({ type: "min" });
    expect(resizeKeyIntent("right", "End", STEP)).toEqual({ type: "max" });
  });

  it("ignores unrelated keys", () => {
    expect(resizeKeyIntent("left", "Enter", STEP)).toBeNull();
    expect(resizeKeyIntent("left", "a", STEP)).toBeNull();
    expect(resizeKeyIntent("right", "ArrowUp", STEP)).toBeNull();
  });

  it("honors the provided step size", () => {
    expect(resizeKeyIntent("left", "ArrowRight", 48)).toEqual({ type: "delta", delta: 48 });
  });
});

describe("readStoredPanelWidth", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the fallback during SSR (no window)", () => {
    expect(readStoredPanelWidth("k", 260, 220)).toBe(260);
  });

  it("returns the fallback when nothing is stored", () => {
    vi.stubGlobal("window", { innerWidth: 1400, localStorage: { getItem: () => null } });
    expect(readStoredPanelWidth("k", 260, 220)).toBe(260);
  });

  it("returns a stored value that is within range", () => {
    vi.stubGlobal("window", { innerWidth: 1400, localStorage: { getItem: () => "320" } });
    expect(readStoredPanelWidth("k", 260, 220)).toBe(320);
  });

  it("clamps a stored value above the viewport-derived max", () => {
    // max = 1400 - 360 = 1040
    vi.stubGlobal("window", { innerWidth: 1400, localStorage: { getItem: () => "5000" } });
    expect(readStoredPanelWidth("k", 260, 220)).toBe(1040);
  });

  it("falls back on a non-numeric stored value", () => {
    vi.stubGlobal("window", { innerWidth: 1400, localStorage: { getItem: () => "abc" } });
    expect(readStoredPanelWidth("k", 260, 220)).toBe(260);
  });

  it("falls back when getItem throws (storage disabled)", () => {
    vi.stubGlobal("window", {
      innerWidth: 1400,
      localStorage: { getItem: () => { throw new Error("SecurityError"); } },
    });
    expect(readStoredPanelWidth("k", 260, 220)).toBe(260);
  });
});

describe("persistPanelWidth", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("writes the stringified value to localStorage", () => {
    const setItem = vi.fn();
    vi.stubGlobal("window", { localStorage: { setItem } });
    persistPanelWidth("k", 320);
    expect(setItem).toHaveBeenCalledWith("k", "320");
  });

  it("swallows errors when setItem throws (private mode / quota)", () => {
    const setItem = vi.fn(() => { throw new Error("QuotaExceededError"); });
    vi.stubGlobal("window", { localStorage: { setItem } });
    expect(() => persistPanelWidth("k", 320)).not.toThrow();
  });
});
