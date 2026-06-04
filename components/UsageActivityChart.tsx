"use client";

import type { UsageDayBucket } from "@/lib/usage";

interface Props {
  days: UsageDayBucket[];
  labels: {
    started: string;
    completed: string;
    active: string;
    empty: string;
  };
}

export function UsageActivityChart({ days, labels }: Props) {
  if (days.length === 0) {
    return <p className="m-0 text-[12px] text-text-muted">{labels.empty}</p>;
  }

  const max = Math.max(1, ...days.flatMap((d) => [d.started, d.completed, d.active]));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 text-[11px] text-text-muted">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-accent" />{labels.started}</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-500/80" />{labels.completed}</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-500/80" />{labels.active}</span>
      </div>
      <div className="flex items-end gap-2" style={{ minHeight: 120 }}>
        {days.map((day) => (
          <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className="flex w-full items-end justify-center gap-0.5" style={{ height: 96 }}>
              <div
                className="w-2 rounded-t-sm bg-accent"
                style={{ height: `${(day.started / max) * 100}%`, minHeight: day.started > 0 ? 4 : 0 }}
                title={`${labels.started}: ${day.started}`}
              />
              <div
                className="w-2 rounded-t-sm bg-emerald-500/80"
                style={{ height: `${(day.completed / max) * 100}%`, minHeight: day.completed > 0 ? 4 : 0 }}
                title={`${labels.completed}: ${day.completed}`}
              />
              <div
                className="w-2 rounded-t-sm bg-amber-500/80"
                style={{ height: `${(day.active / max) * 100}%`, minHeight: day.active > 0 ? 4 : 0 }}
                title={`${labels.active}: ${day.active}`}
              />
            </div>
            <span className="text-[10px] text-text-dim">{day.date.slice(5)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
