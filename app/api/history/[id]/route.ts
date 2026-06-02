import { NextResponse } from "next/server";
import { listAllSessions } from "@/lib/session-reader";
import { readProductSessionMetadataMap } from "@/lib/scene-metadata";
import { buildHistoryItems } from "@/lib/scenes";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const sessions = await listAllSessions();
    const item = buildHistoryItems(sessions, readProductSessionMetadataMap())
      .find((historyItem) => historyItem.sessionId === id);

    if (!item) {
      return NextResponse.json({ error: "History item not found" }, { status: 404 });
    }
    return NextResponse.json({ item });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
