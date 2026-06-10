import { NextResponse } from "next/server";

// pi-web (通用 Web 层) 的本地鉴权基线：只放行同源 loopback 请求，拒绝跨源。
// pi-app (桌面层) 会用接入远程访问/中继配对子系统的增强版覆盖本文件。

function hostnameFromHost(host: string | null | undefined): string {
  if (!host) return "";
  const trimmed = host.trim().toLowerCase();
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    return end === -1 ? trimmed : trimmed.slice(1, end);
  }
  return trimmed.split(":")[0] ?? "";
}

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "0:0:0:0:0:0:0:1" ||
    hostname.startsWith("127.")
  );
}

function hostnameFromOrigin(origin: string | null | undefined): string {
  if (!origin) return "";
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isSameOriginLoopbackRequest(req: Request): boolean {
  const hostName = hostnameFromHost(req.headers.get("host"));
  if (!isLoopbackHostname(hostName)) return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  return hostnameFromOrigin(origin) === hostName;
}

export function requireApiAuth(req: Request): NextResponse | null {
  if (isSameOriginLoopbackRequest(req)) return null;
  return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 401 });
}
