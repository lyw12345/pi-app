import { NextResponse } from "next/server";
import { readSceneOverride } from "@/lib/scene-overrides";
import { getActionsForScene, getSceneByIdWithOverride, getSourcesForScene } from "@/lib/scenes";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const scene = getSceneByIdWithOverride(id, readSceneOverride(id));
  if (!scene) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  return NextResponse.json({
    scene,
    actions: getActionsForScene(scene),
    sources: getSourcesForScene(scene),
  });
}
