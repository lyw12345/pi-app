import { NextResponse } from "next/server";
import { isLoopbackRequest } from "@/lib/local-request-guard";
import { getOnboardingStatus } from "@/lib/onboarding-status";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isLoopbackRequest(req)) {
    return NextResponse.json({ error: "Onboarding status is loopback-only" }, { status: 403 });
  }
  return NextResponse.json(getOnboardingStatus());
}
