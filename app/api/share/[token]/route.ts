import { NextResponse } from "next/server";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { buildSessionContext, resolveSessionPath } from "@/lib/session-reader";
import { resolveSessionShare } from "@/lib/session-share";
import { readProductSessionMetadataMap } from "@/lib/scene-metadata";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const share = resolveSessionShare(token);
  if (!share) {
    return NextResponse.json({ error: "Share link not found" }, { status: 404 });
  }

  const filePath = await resolveSessionPath(share.sessionId);
  if (!filePath) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  try {
    const sm = SessionManager.open(filePath);
    const entries = sm.getEntries() as never;
    const leafId = sm.getLeafId();
    const context = buildSessionContext(entries, leafId);
    const header = sm.getHeader();
    const productMetadata = readProductSessionMetadataMap()[share.sessionId];

    return NextResponse.json({
      sessionId: share.sessionId,
      title: productMetadata?.title ?? sm.getSessionName() ?? "Conversation",
      cwd: header?.cwd ?? "",
      createdAt: share.createdAt,
      messages: context.messages,
      entryIds: context.entryIds,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
