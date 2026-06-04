import { NextResponse } from "next/server";
import { rejectUnsafeMutation } from "@/lib/local-request-guard";
import { requireApiAuth } from "@/lib/api-auth";
import { mergeSceneOverrides, readSceneOverrides } from "@/lib/scene-overrides";
import { previewScenePackImport, validateScenePack } from "@/lib/scene-pack";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rejected = rejectUnsafeMutation(req);
  if (rejected) return rejected;

  const authRejected = requireApiAuth(req);
  if (authRejected) return authRejected;

  try {
    const body = await req.json() as {
      pack?: unknown;
      preview?: boolean;
      apply?: boolean;
    };

    const validated = validateScenePack(body.pack);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const current = readSceneOverrides();
    const { unknownSceneIds, changes } = previewScenePackImport(current, validated.pack);

    if (unknownSceneIds.length > 0) {
      return NextResponse.json(
        {
          error: `Unknown scene ids: ${unknownSceneIds.join(", ")}`,
          unknownSceneIds,
        },
        { status: 400 },
      );
    }

    if (body.preview === true || body.apply !== true) {
      return NextResponse.json({
        preview: true,
        unknownSceneIds,
        changes,
      });
    }

    const applicable = Object.fromEntries(
      changes
        .filter((change) => change.action !== "unchanged")
        .map((change) => [change.sceneId, validated.pack.scenes[change.sceneId]]),
    );

    const result = await mergeSceneOverrides(applicable);
    return NextResponse.json({
      preview: false,
      applied: result.applied,
      skipped: result.skipped,
      changes,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
