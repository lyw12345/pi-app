import { NextResponse } from "next/server";
import { readProductSessionMetadata, upsertProductSessionMetadata } from "@/lib/scene-metadata";
import { sanitizePromptInput } from "@/lib/prompt-guard";
import { rejectUnsafeMutation } from "@/lib/local-request-guard";
import type { ProductSessionMetadata, ProductSessionStatus } from "@/lib/scenes";

const SUMMARY_MAX_CHARS = 240;
const ALLOWED_STATUS: ReadonlySet<ProductSessionStatus> = new Set(["active", "completed", "draft"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProductSessionStatus(value: unknown): value is ProductSessionStatus {
  return typeof value === "string" && ALLOWED_STATUS.has(value as ProductSessionStatus);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rejected = rejectUnsafeMutation(req);
  if (rejected) return rejected;

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isObject(body)) {
    return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 });
  }

  const updates: Partial<Pick<ProductSessionMetadata, "lastResultSummary" | "status">> = {};
  let hasKnownField = false;

  if ("lastResultSummary" in body) {
    hasKnownField = true;
    if (typeof body.lastResultSummary !== "string") {
      return NextResponse.json(
        { error: "lastResultSummary must be a string" },
        { status: 400 },
      );
    }
    if (body.lastResultSummary.length > SUMMARY_MAX_CHARS) {
      return NextResponse.json(
        { error: `lastResultSummary must be at most ${SUMMARY_MAX_CHARS} characters` },
        { status: 400 },
      );
    }
    updates.lastResultSummary = sanitizePromptInput(body.lastResultSummary, {
      maxChars: SUMMARY_MAX_CHARS,
      onTruncate: "none",
    });
  }

  if ("status" in body) {
    hasKnownField = true;
    if (!isProductSessionStatus(body.status)) {
      return NextResponse.json(
        { error: "status must be one of active, completed, draft" },
        { status: 400 },
      );
    }
    updates.status = body.status;
  }

  if (!hasKnownField) {
    return NextResponse.json(
      { error: "At least one of lastResultSummary or status must be provided" },
      { status: 400 },
    );
  }

  try {
    const existing = readProductSessionMetadata(id);
    if (!existing) {
      return NextResponse.json({ error: "Session metadata not found" }, { status: 404 });
    }
    const merged: ProductSessionMetadata = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await upsertProductSessionMetadata(id, merged);
    return NextResponse.json({ ok: true, metadata: merged });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to update product session metadata: ${String(error)}` },
      { status: 500 },
    );
  }
}
