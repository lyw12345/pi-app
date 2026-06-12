import { networkInterfaces } from "node:os";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

/** Pick a LAN-reachable IPv4 so generated links work for others on the same network. */
export function getLanIPv4(): string | null {
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
 * Resolve a LAN-reachable origin for a request. When the app is opened via localhost
 * the request origin is not reachable by other devices, so the loopback host is
 * swapped for the machine's LAN IPv4 (protocol and port preserved). Non-loopback
 * hosts are kept as-is. `PI_SHARE_HOST` (host or host:port) overrides detection.
 */
export function resolveLanOrigin(reqUrl: string): string {
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
