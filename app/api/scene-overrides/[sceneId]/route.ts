import { NextResponse } from "next/server";
import { getSceneById } from "@/lib/scenes";
import { clearSceneOverride, upsertSceneOverride, type SceneOverrides } from "@/lib/scene-overrides";
import { sanitizePromptInput } from "@/lib/prompt-guard";
import { rejectUnsafeMutation } from "@/lib/local-request-guard";

const DEFAULT_PROMPT_MAX_CHARS = 16_000;
const OUTPUT_STYLE_MAX_CHARS = 500;
const STARTERS_MAX_ITEMS = 8;
const STARTER_ITEM_MAX_CHARS = 200;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isStringArrayOrNull(value: unknown): value is string[] | null {
  if (value === null) return true;
  if (!Array.isArray(value)) return false;
  return value.every((item) => typeof item === "string");
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ sceneId: string }> },
) {
  const rejected = rejectUnsafeMutation(req);
  if (rejected) return rejected;

  const { sceneId } = await params;
  if (!getSceneById(sceneId)) {
    return NextResponse.json({ error: `Unknown sceneId: ${sceneId}` }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isObject(body)) {
    return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 });
  }

  const updates: SceneOverrides = {};
  let hasKnownField = false;

  if ("defaultPrompt" in body) {
    hasKnownField = true;
    if (!isStringOrNull(body.defaultPrompt)) {
      return NextResponse.json(
        { error: "defaultPrompt must be a string or null" },
        { status: 400 },
      );
    }
    if (body.defaultPrompt !== null) {
      if (body.defaultPrompt.length > DEFAULT_PROMPT_MAX_CHARS) {
        return NextResponse.json(
          { error: `defaultPrompt must be at most ${DEFAULT_PROMPT_MAX_CHARS} characters` },
          { status: 400 },
        );
      }
      updates.defaultPrompt = sanitizePromptInput(body.defaultPrompt, {
        maxChars: DEFAULT_PROMPT_MAX_CHARS,
        onTruncate: "none",
      });
    } else {
      updates.defaultPrompt = null;
    }
  }

  if ("outputStyle" in body) {
    hasKnownField = true;
    if (!isStringOrNull(body.outputStyle)) {
      return NextResponse.json(
        { error: "outputStyle must be a string or null" },
        { status: 400 },
      );
    }
    if (body.outputStyle !== null) {
      if (body.outputStyle.length > OUTPUT_STYLE_MAX_CHARS) {
        return NextResponse.json(
          { error: `outputStyle must be at most ${OUTPUT_STYLE_MAX_CHARS} characters` },
          { status: 400 },
        );
      }
      updates.outputStyle = sanitizePromptInput(body.outputStyle, {
        maxChars: OUTPUT_STYLE_MAX_CHARS,
        onTruncate: "none",
      });
    } else {
      updates.outputStyle = null;
    }
  }

  if ("suggestedStarters" in body) {
    hasKnownField = true;
    if (!isStringArrayOrNull(body.suggestedStarters)) {
      return NextResponse.json(
        { error: "suggestedStarters must be a string array or null" },
        { status: 400 },
      );
    }
    if (body.suggestedStarters !== null) {
      if (body.suggestedStarters.length > STARTERS_MAX_ITEMS) {
        return NextResponse.json(
          { error: `suggestedStarters must have at most ${STARTERS_MAX_ITEMS} items` },
          { status: 400 },
        );
      }
      for (let i = 0; i < body.suggestedStarters.length; i++) {
        const item = body.suggestedStarters[i];
        if (item.length > STARTER_ITEM_MAX_CHARS) {
          return NextResponse.json(
            {
              error: `suggestedStarters[${i}] must be at most ${STARTER_ITEM_MAX_CHARS} characters`,
            },
            { status: 400 },
          );
        }
      }
      updates.suggestedStarters = body.suggestedStarters.map((item) =>
        sanitizePromptInput(item, {
          maxChars: STARTER_ITEM_MAX_CHARS,
          onTruncate: "none",
        }),
      );
    } else {
      updates.suggestedStarters = null;
    }
  }

  if (!hasKnownField) {
    return NextResponse.json(
      { error: "At least one of defaultPrompt, outputStyle, or suggestedStarters must be provided" },
      { status: 400 },
    );
  }

  try {
    const override = await upsertSceneOverride(sceneId, updates);
    return NextResponse.json({ override });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to upsert scene override: ${String(error)}` },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ sceneId: string }> },
) {
  const rejected = rejectUnsafeMutation(req);
  if (rejected) return rejected;

  const { sceneId } = await params;
  if (!getSceneById(sceneId)) {
    return NextResponse.json({ error: `Unknown sceneId: ${sceneId}` }, { status: 404 });
  }

  try {
    const cleared = await clearSceneOverride(sceneId);
    return NextResponse.json({ ok: true, cleared });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to clear scene override: ${String(error)}` },
      { status: 500 },
    );
  }
}
