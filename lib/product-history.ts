import { basename } from "node:path";
import type { SessionInfo } from "./types";
import type { ProductSessionMetadataMap } from "./scene-metadata";

export type ProductSessionStatus = "active" | "completed" | "draft";

/**
 * 项目简称：从 cwd 派生，路径末段目录名。空 cwd 时回落到
 * 本地化的 "(未设置)" 占位，避免列表里出现空列或显示整条绝对路径。
 */
export const PROJECT_NAME_FALLBACK = "（未设置）";

export function deriveProjectName(cwd: string | null | undefined): string {
  if (!cwd) return PROJECT_NAME_FALLBACK;
  const trimmed = cwd.trim();
  if (!trimmed) return PROJECT_NAME_FALLBACK;
  const name = basename(trimmed);
  return name && name !== "/" && name !== "." ? name : PROJECT_NAME_FALLBACK;
}

export interface ProductHistoryItem {
  sessionId: string;
  path: string;
  cwd: string;
  projectName: string;
  title: string;
  status: ProductSessionStatus;
  summary: string;
  startedAt: string;
  updatedAt: string;
  messageCount: number;
  firstMessage: string;
}

export function buildHistoryItems(
  sessions: SessionInfo[],
  metadata: ProductSessionMetadataMap,
): ProductHistoryItem[] {
  return sessions
    .map((session) => {
      const item = metadata[session.id];
      const title = item?.title || session.name || session.firstMessage || "(untitled)";
      return {
        sessionId: session.id,
        path: session.path,
        cwd: session.cwd,
        projectName: deriveProjectName(session.cwd),
        title,
        status: item?.status ?? "active",
        summary: item?.lastResultSummary ?? session.firstMessage ?? "",
        startedAt: item?.startedAt ?? session.created,
        updatedAt: item?.updatedAt ?? session.modified,
        messageCount: session.messageCount,
        firstMessage: session.firstMessage,
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
