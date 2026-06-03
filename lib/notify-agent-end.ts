import { notifyAgentFinished } from "@/lib/push-notifications";

export interface NativeNotificationBridge {
  showNotification(input: { title?: string; body?: string; sessionId: string; sessionName?: string }): void;
}

export function getNativeBridge(): NativeNotificationBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as Window & { piNative?: NativeNotificationBridge }).piNative;
  return bridge?.showNotification ? bridge : null;
}

export async function notifyAgentEnd(input: {
  sessionId: string;
  sessionName?: string;
}): Promise<void> {
  const bridge = getNativeBridge();
  if (bridge) {
    bridge.showNotification({
      sessionId: input.sessionId,
      sessionName: input.sessionName,
      title: input.sessionName?.trim() || undefined,
      body: undefined,
    });
    return;
  }
  await notifyAgentFinished(input);
}
