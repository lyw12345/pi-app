import { NextResponse } from "next/server";
import { rejectUnsafeMutation } from "@/lib/local-request-guard";
import { requireApiAuth } from "@/lib/api-auth";
import {
  loadPiWebPreferences,
  mergePiWebPreferences,
  type PiWebPreferences,
  type ToolMode,
} from "@/lib/pi-web-preferences";

export const dynamic = "force-dynamic";

const TOOL_MODES = new Set<ToolMode>(["simple", "default", "full"]);

function sanitizePatch(body: unknown): Partial<PiWebPreferences> {
  if (!body || typeof body !== "object") return {};
  const input = body as Record<string, unknown>;
  const patch: Partial<PiWebPreferences> = {};

  if (typeof input.defaultWorkspaceCwd === "string" && input.defaultWorkspaceCwd.trim()) {
    patch.defaultWorkspaceCwd = input.defaultWorkspaceCwd.trim();
  }
  if (typeof input.toolMode === "string" && TOOL_MODES.has(input.toolMode as ToolMode)) {
    patch.toolMode = input.toolMode as ToolMode;
  }
  if (typeof input.notificationsEnabled === "boolean") {
    patch.notificationsEnabled = input.notificationsEnabled;
  }
  if (typeof input.autoCompactionEnabled === "boolean") {
    patch.autoCompactionEnabled = input.autoCompactionEnabled;
  }
  if (typeof input.autoRetryEnabled === "boolean") {
    patch.autoRetryEnabled = input.autoRetryEnabled;
  }
  if (typeof input.branchSummarizeBeforeSwitch === "boolean") {
    patch.branchSummarizeBeforeSwitch = input.branchSummarizeBeforeSwitch;
  }
  if (typeof input.showSlashCommands === "boolean") {
    patch.showSlashCommands = input.showSlashCommands;
  }

  return patch;
}

export async function GET(req: Request) {
  const rejected = requireApiAuth(req);
  if (rejected) return rejected;
  return NextResponse.json({ preferences: loadPiWebPreferences() });
}

export async function PUT(req: Request) {
  const rejected = rejectUnsafeMutation(req);
  if (rejected) return rejected;

  try {
    const body = await req.json();
    const preferences = mergePiWebPreferences(sanitizePatch(body));
    return NextResponse.json({ ok: true, preferences });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
