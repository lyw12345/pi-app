import { NextResponse } from "next/server";
import { buildAutomationRunPrompt, getAutomationById } from "@/lib/automation";
import { getSceneById } from "@/lib/scenes";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      automationId?: unknown;
      input?: unknown;
      requestedBy?: unknown;
    };
    const automationId = typeof body.automationId === "string" ? body.automationId.trim() : "";

    if (!automationId) {
      return NextResponse.json({ error: "automationId is required" }, { status: 400 });
    }

    const automation = getAutomationById(automationId);
    if (!automation) {
      return NextResponse.json({ error: "Automation not found" }, { status: 404 });
    }
    if (!automation.enabled) {
      return NextResponse.json({ error: "Automation is disabled" }, { status: 409 });
    }

    const scene = getSceneById(automation.sceneId);
    return NextResponse.json({
      automation,
      scene,
      prompt: buildAutomationRunPrompt(automation, {
        input: typeof body.input === "string" ? body.input : undefined,
        requestedBy: typeof body.requestedBy === "string" ? body.requestedBy : undefined,
      }),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
