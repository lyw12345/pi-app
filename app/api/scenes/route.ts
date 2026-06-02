import { NextResponse } from "next/server";
import { readAllSceneOverrides } from "@/lib/scene-overrides";
import { getScenesWithOverrides } from "@/lib/scenes";

export async function GET() {
  return NextResponse.json({ scenes: getScenesWithOverrides(readAllSceneOverrides()) });
}
