import { NextResponse, type NextRequest } from "next/server";

/**
 * Mirrors the original's redirect: hitting a protected route without a session
 * sends you to /{locale}/auth/sign-in?redirect_url=<original path>.
 * The cookie is a local dummy - see /api/auth/sign-in.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/ko/auth/")) return NextResponse.next();
  if (request.cookies.get("enterprise-token")) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/ko/auth/sign-in";
  url.search = `?redirect_url=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url, 307);
}

export const config = {
  // API routes stay open so the asset stream, the 3D viewer and curl checks work.
  matcher: ["/ko/:path*"],
};
