import type { ProductHistoryItem } from "./product-history";

export interface UsageSummary {
  totalRuns: number;
  activeRuns: number;
  completedRuns: number;
  generatedAt: string;
}

export interface UsageDayBucket {
  date: string;
  started: number;
  completed: number;
  active: number;
}

export interface UsageTimeline {
  days: UsageDayBucket[];
  generatedAt: string;
}

export function buildUsageSummary(
  history: ProductHistoryItem[],
  generatedAt = new Date().toISOString(),
): UsageSummary {
  const totalRuns = history.length;
  const completedRuns = history.filter((item) => item.status === "completed").length;
  const activeRuns = history.filter((item) => item.status === "active").length;

  return {
    totalRuns,
    activeRuns,
    completedRuns,
    generatedAt,
  };
}

function utcDateKey(iso: string): string {
  return iso.slice(0, 10);
}

function lastUtcDayKeys(endIso: string, count: number): string[] {
  const end = new Date(endIso);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

export function buildUsageTimeline(
  history: ProductHistoryItem[],
  days: number,
  generatedAt = new Date().toISOString(),
): UsageTimeline {
  const dayKeys = lastUtcDayKeys(generatedAt, days);
  const buckets = dayKeys.map((date) => ({ date, started: 0, completed: 0, active: 0 }));
  const byDate = new Map(buckets.map((b) => [b.date, b]));

  for (const item of history) {
    const startDate = utcDateKey(item.startedAt);
    const startBucket = byDate.get(startDate);
    if (startBucket) startBucket.started += 1;

    const updateDate = utcDateKey(item.updatedAt);
    const updateBucket = byDate.get(updateDate);
    if (!updateBucket) continue;
    if (item.status === "completed") updateBucket.completed += 1;
    else if (item.status === "active") updateBucket.active += 1;
  }

  return { days: buckets, generatedAt };
}
