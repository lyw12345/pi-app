import type { ProductHistoryItem } from "./scenes";

export interface SceneUsageSummary {
  sceneId: string;
  sceneName: string;
  runs: number;
  activeRuns: number;
  completedRuns: number;
  lastUsedAt: string;
  totalMessages: number;
}

export interface UsageSummary {
  totalRuns: number;
  sceneRuns: number;
  generalRuns: number;
  activeRuns: number;
  completedRuns: number;
  sceneAdoptionRate: number;
  generatedAt: string;
  byScene: SceneUsageSummary[];
}

export function buildUsageSummary(
  history: ProductHistoryItem[],
  generatedAt = new Date().toISOString(),
): UsageSummary {
  const sceneItems = history.filter((item) => Boolean(item.sceneId));
  const sceneMap = new Map<string, SceneUsageSummary>();

  for (const item of sceneItems) {
    const sceneId = item.sceneId!;
    const existing = sceneMap.get(sceneId) ?? {
      sceneId,
      sceneName: item.sceneName,
      runs: 0,
      activeRuns: 0,
      completedRuns: 0,
      lastUsedAt: item.updatedAt,
      totalMessages: 0,
    };

    existing.runs += 1;
    existing.totalMessages += item.messageCount;
    if (item.status === "completed") existing.completedRuns += 1;
    if (item.status === "active") existing.activeRuns += 1;
    if (item.updatedAt > existing.lastUsedAt) existing.lastUsedAt = item.updatedAt;
    sceneMap.set(sceneId, existing);
  }

  const totalRuns = history.length;
  const sceneRuns = sceneItems.length;
  const completedRuns = history.filter((item) => item.status === "completed").length;
  const activeRuns = history.filter((item) => item.status === "active").length;

  return {
    totalRuns,
    sceneRuns,
    generalRuns: totalRuns - sceneRuns,
    activeRuns,
    completedRuns,
    sceneAdoptionRate: totalRuns === 0 ? 0 : sceneRuns / totalRuns,
    generatedAt,
    byScene: [...sceneMap.values()].sort((a, b) => {
      if (b.runs !== a.runs) return b.runs - a.runs;
      return b.lastUsedAt.localeCompare(a.lastUsedAt);
    }),
  };
}
