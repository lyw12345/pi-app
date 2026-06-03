import { NextResponse } from "next/server";
import { rejectUnsafeMutation } from "@/lib/local-request-guard";
import { mergePiWebPreferences } from "@/lib/pi-web-preferences";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rejected = rejectUnsafeMutation(req);
  if (rejected) return rejected;

  try {
    const body = await req.json().catch(() => ({})) as {
      notificationsEnabled?: boolean;
      defaultWorkspaceCwd?: string;
      toolMode?: "simple" | "default" | "full";
    };

    const preferences = mergePiWebPreferences({
      onboardingCompletedAt: new Date().toISOString(),
      ...(typeof body.notificationsEnabled === "boolean"
        ? { notificationsEnabled: body.notificationsEnabled }
        : {}),
      ...(typeof body.defaultWorkspaceCwd === "string" && body.defaultWorkspaceCwd.trim()
        ? { defaultWorkspaceCwd: body.defaultWorkspaceCwd.trim() }
        : {}),
      ...(body.toolMode ? { toolMode: body.toolMode } : {}),
    });

    return NextResponse.json({ ok: true, preferences });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
