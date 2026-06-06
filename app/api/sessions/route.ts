import { NextResponse } from "next/server";
import { listAllSessions, listProjectCwdsForPicker } from "@/lib/session-reader";
import { requireApiAuth } from "@/lib/api-auth";

export async function GET(req: Request) {
  const rejected = requireApiAuth(req);
  if (rejected) return rejected;

  try {
    const [sessions, projectCwds] = await Promise.all([
      listAllSessions(),
      listProjectCwdsForPicker(),
    ]);
    return NextResponse.json({ sessions, projectCwds });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
