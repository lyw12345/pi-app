import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { readSceneOverrides } from "@/lib/scene-overrides";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const rejected = requireApiAuth(req);
  if (rejected) return rejected;

  return NextResponse.json({ overrides: readSceneOverrides() });
}
