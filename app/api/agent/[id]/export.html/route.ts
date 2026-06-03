import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { NextResponse } from "next/server";
import { getRpcSession, startRpcSession } from "@/lib/rpc-manager";
import { resolveSessionPath } from "@/lib/session-reader";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { requireApiAuth } from "@/lib/api-auth";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rejected = requireApiAuth(req);
  if (rejected) return rejected;

  const { id } = await params;

  try {
    let session = getRpcSession(id);
    if (!session?.isAlive()) {
      const filePath = await resolveSessionPath(id);
      if (!filePath) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }
      const cwd = SessionManager.open(filePath).getHeader()?.cwd ?? process.cwd();
      ({ session } = await startRpcSession(id, filePath, cwd));
    }

    const result = await session.send({ type: "export_html" }) as { path?: string; filename?: string };
    const exportPath = result?.path;
    if (!exportPath) {
      return NextResponse.json({ error: "Export failed" }, { status: 500 });
    }

    const html = readFileSync(exportPath, "utf8");
    const filename = result.filename ?? basename(exportPath);
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
