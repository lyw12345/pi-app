import { NextResponse } from "next/server";
import { listAllSessions } from "@/lib/session-reader";
import { readProductSessionMetadataMap } from "@/lib/scene-metadata";
import { buildHistoryItems } from "@/lib/product-history";
import { buildUsageSummary, buildUsageTimeline } from "@/lib/usage";
import { requireApiAuth } from "@/lib/api-auth";

export async function GET(req: Request) {
  const rejected = requireApiAuth(req);
  if (rejected) return rejected;

  try {
    const { searchParams } = new URL(req.url);
    const daysParam = searchParams.get("days");
    const days = daysParam ? Math.min(30, Math.max(1, Number.parseInt(daysParam, 10) || 7)) : null;

    const sessions = await listAllSessions();
    const metadata = readProductSessionMetadataMap();
    const history = buildHistoryItems(sessions, metadata);
    const usage = buildUsageSummary(history);
    if (days === null) {
      return NextResponse.json({ usage });
    }
    return NextResponse.json({
      usage,
      timeline: buildUsageTimeline(history, days),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
