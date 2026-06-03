import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authorizeMiddlewareRequest, getSessionCookie, isRemoteAccessEnabledEnv } from "./lib/middleware-auth";

const PUBLIC_API_PREFIXES = [
  "/api/remote/pair",
  "/api/remote/client",
  "/api/health",
  "/api/onboarding/status",
];

function isPublicApiPath(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function unauthorized(reason: string): NextResponse {
  return NextResponse.json({ error: reason }, { status: 401 });
}

function forbidden(reason: string): NextResponse {
  return NextResponse.json({ error: reason }, { status: 403 });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (isPublicApiPath(pathname) && (request.method === "POST" || pathname === "/api/remote/client")) {
    return NextResponse.next();
  }

  // Bearer tokens and session cookies are verified in route handlers (disk-backed auth).
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return NextResponse.next();
  }
  if (getSessionCookie(request)) {
    return NextResponse.next();
  }

  const auth = await authorizeMiddlewareRequest(request);
  if (!auth.authorized) {
    if (!isRemoteAccessEnabledEnv() && !auth.loopback) {
      return forbidden(auth.reason ?? "Remote access is disabled");
    }
    return unauthorized(auth.reason ?? "Authentication required");
  }

  if (auth.readOnly && request.method !== "GET" && request.method !== "HEAD" && request.method !== "OPTIONS") {
    return forbidden("Remote access is read-only");
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
