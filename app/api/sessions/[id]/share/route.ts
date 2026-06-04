import { NextResponse } from "next/server";
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
  const origin = new URL(req.url).origin;
  return NextResponse.json({
    token,
    url: `${origin}/share/${token}`,
  });
}
