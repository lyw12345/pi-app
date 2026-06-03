import { execSync } from "child_process";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const rejected = requireApiAuth(request);
  if (rejected) return rejected;

  const cwd = request.nextUrl.searchParams.get("cwd");
  if (!cwd) return NextResponse.json({ branch: null }, { status: 400 });

  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf8", timeout: 3000 }).trim();
    return NextResponse.json({ branch });
  } catch {
    return NextResponse.json({ branch: null });
  }
}
