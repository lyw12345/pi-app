import { NextResponse } from "next/server";
import { readAllSceneOverrides } from "@/lib/scene-overrides";

export async function GET() {
  try {
    const overrides = readAllSceneOverrides();
    return NextResponse.json({ overrides });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to read scene overrides: ${String(error)}` },
      { status: 500 },
    );
  }
}
