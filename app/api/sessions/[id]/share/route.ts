import { NextResponse } from "next/server";
import { resolveLanOrigin } from "@/lib/lan-origin";
import { rejectUnsafeMutation } from "@/lib/local-request-guard";
import { createSessionShare } from "@/lib/session-share";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rejected = rejectUnsafeMutation(req);
  if (rejected) return rejected;

  const { id } = await params;
  const token = createSessionShare(id);
  const origin = resolveLanOrigin(req.url);
  return NextResponse.json({
    token,
    url: `${origin}/share/${token}`,
  });
}
