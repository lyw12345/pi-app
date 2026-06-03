interface PiNativeBridge {
  version?: string;
  pickWorkspaceDirectory?: () => Promise<string | null>;
  showNotification?: (input: {
    title?: string;
    body?: string;
    sessionId: string;
    sessionName?: string;
  }) => void;
  openPath?: (path: string) => Promise<void>;
  restartServer?: () => Promise<void>;
}

interface Window {
  piNative?: PiNativeBridge;
}
