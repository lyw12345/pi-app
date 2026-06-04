import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { listExtensions, resolveExtensionsCwd } from "@/lib/extensions-reader";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const rejected = requireApiAuth(req);
  if (rejected) return rejected;

  const url = new URL(req.url);
  const cwd = resolveExtensionsCwd(url.searchParams.get("cwd"));

  try {
    const snapshot = await listExtensions(cwd);
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
