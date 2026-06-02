import { NextResponse } from "next/server";
import { listAllSessions } from "@/lib/session-reader";
import { readProductSessionMetadataMap } from "@/lib/scene-metadata";
import { buildHistoryItems } from "@/lib/scenes";

export async function GET() {
  try {
    const sessions = await listAllSessions();
    const metadata = readProductSessionMetadataMap();
    return NextResponse.json({ history: buildHistoryItems(sessions, metadata) });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
