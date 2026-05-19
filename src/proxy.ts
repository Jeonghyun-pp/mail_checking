import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session-token";

const AUTH_PAGES = ["/login", "/signup"];

/** Paths reachable without a session. */
function isPublicPath(pathname: string): boolean {
  if (AUTH_PAGES.includes(pathname)) return true;
  if (pathname.startsWith("/api/auth/")) return true;
  if (pathname.startsWith("/api/v1/")) return true; // public API — API-key auth
  if (pathname.startsWith("/api/mcp")) return true; // MCP server — API-key auth
  if (pathname.startsWith("/api/track/")) return true; // tracking pixels/links
  return false;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const userId = token ? await verifySessionToken(token) : null;

  // Signed-in users shouldn't see the login/signup pages.
  if (userId && AUTH_PAGES.includes(pathname)) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (isPublicPath(pathname) || userId) {
    return NextResponse.next();
  }

  // Unauthenticated request to a protected path.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next.js internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
