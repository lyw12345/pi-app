import { NextResponse } from "next/server";
import { getAutomationEntries } from "@/lib/automation";

export async function GET() {
  return NextResponse.json({ automation: getAutomationEntries() });
}
