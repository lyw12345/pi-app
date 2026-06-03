import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { isLoopbackRequest } from "@/lib/local-request-guard";

export const dynamic = "force-dynamic";

function readPackageVersion(): string {
  try {
    const raw = readFileSync(join(process.cwd(), "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export async function GET(req: Request) {
  if (!isLoopbackRequest(req)) {
    return NextResponse.json({ error: "Health check is loopback-only" }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    version: readPackageVersion(),
  });
}
