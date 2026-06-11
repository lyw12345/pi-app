interface PiNativeBridge {
  version?: string;
  pickWorkspaceDirectory?: () => Promise<string | null>;
  /** macOS NSOpenPanel — absolute paths, any location on disk. */
  pickFiles?: () => Promise<string[] | null>;
  showNotification?: (input: {
    title?: string;
    body?: string;
    sessionId: string;
    sessionName?: string;
  }) => void;
  openPath?: (path: string) => Promise<void>;
  restartServer?: () => Promise<void>;
  /**
   * macOS Pi.app only — acquire a system idle-sleep-preventing power
   * assertion while a task is in flight. Idempotent: multiple calls in a
   * row are coalesced. Pair each `preventSleep` with a later `allowSleep`
   * when the task is done; a debounce on the web side keeps the timing
   * sane across turn boundaries.
   */
  preventSleep?: () => Promise<void>;
  /**
   * macOS Pi.app only — release the auto-task power assertion. No-op if
   * the user has "always keep awake" enabled (the assertion stays held).
   */
  allowSleep?: () => Promise<void>;
  /**
   * macOS Pi.app only — toggle the "always keep awake while Pi is open"
   * mode. When enabled, the assertion is held for the whole app session
   * regardless of task state, until toggled off.
   */
  setKeepAwakeAlways?: (enabled: boolean) => Promise<void>;
  /**
   * macOS Pi.app only — current power assertion state. Useful for status
   * indicators in the settings panel.
   */
  getPowerState?: () => Promise<{ isHeld: boolean; mode: "none" | "autoTask" | "alwaysOn" }>;
}

interface Window {
  piNative?: PiNativeBridge;
}
