import { NextResponse } from "next/server";
import { listAllSessions } from "@/lib/session-reader";
import { readProductSessionMetadataMap } from "@/lib/scene-metadata";
import { buildHistoryItems } from "@/lib/scenes";
import { buildUsageSummary } from "@/lib/usage";

export async function GET() {
  try {
    const sessions = await listAllSessions();
    const metadata = readProductSessionMetadataMap();
    const history = buildHistoryItems(sessions, metadata);
    return NextResponse.json({ usage: buildUsageSummary(history) });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
