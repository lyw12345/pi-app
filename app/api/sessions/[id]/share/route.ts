import { networkInterfaces } from "node:os";
import { NextResponse } from "next/server";
import { rejectUnsafeMutation } from "@/lib/local-request-guard";
import { createSessionShare } from "@/lib/session-share";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

/** Pick a LAN-reachable IPv4 so shared links work for colleagues on the same network. */
function getLanIPv4(): string | null {
  const candidates: string[] = [];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const ni of addrs ?? []) {
      if (ni.family === "IPv4" && !ni.internal) candidates.push(ni.address);
    }
  }
  if (candidates.length === 0) return null;
  // Prefer common private ranges (192.168 > 10 > 172.16-31) over VPN/virtual adapters.
  const score = (ip: string): number => {
    if (ip.startsWith("192.168.")) return 3;
    if (ip.startsWith("10.")) return 2;
    const m = ip.match(/^172\.(\d+)\./);
    if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return 1;
    return 0;
  };
  return candidates.sort((a, b) => score(b) - score(a))[0];
}

/**
 * Build the base origin for a share link. When the app is opened via localhost the
 * request origin is not reachable by others, so we swap the loopback host for the
 * machine's LAN IPv4. `PI_SHARE_HOST` (host or host:port) overrides detection.
 */
function resolveShareOrigin(reqUrl: string): string {
  const u = new URL(reqUrl);
  const override = process.env.PI_SHARE_HOST?.trim();
  if (override) {
    u.host = override;
    return u.origin;
  }
  if (LOOPBACK_HOSTS.has(u.hostname)) {
    const ip = getLanIPv4();
    if (ip) u.hostname = ip;
  }
  return u.origin;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rejected = rejectUnsafeMutation(req);
  if (rejected) return rejected;

  const { id } = await params;
  const token = createSessionShare(id);
  const origin = resolveShareOrigin(req.url);
  return NextResponse.json({
    token,
    url: `${origin}/share/${token}`,
  });
}
