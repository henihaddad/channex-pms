import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = [
  "/login",
  "/owner-login",
  "/book",
  "/guest",
  "/widget.js",
  "/signup",
  "/totp",
  "/invite",
  "/api/",
  "/webhooks/",
  "/_next/",
  "/favicon",
  "/icon",
  // OAuth discovery and the endpoints MCP clients call without a session (spec 04 §4.7b);
  // /oauth/authorize is a console page and goes through the session logic below
  "/.well-known/",
  "/oauth/metadata",
  "/oauth/register",
  "/oauth/token",
  "/oauth/revoke",
];

/**
 * Routing only; the server verifies every token. With no session at all a console page goes
 * to the login page. With the short-lived access token lapsed but the 30-day refresh token
 * still there, a page load goes through the refresh route and comes straight back, so a
 * signed-in person is not asked for their password every fifteen minutes (spec 02 §2.6).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();
  const access = request.cookies.get("pms_at");
  const refresh = request.cookies.get("pms_rt");
  if (!access && !refresh) {
    // a page load comes back here after signing in (the login page follows same-site paths only)
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search =
      request.method === "GET" && pathname !== "/"
        ? `?next=${encodeURIComponent(pathname + search)}`
        : "";
    return NextResponse.redirect(url);
  }
  // prefetches and form posts are left alone: the first would rotate the token behind the
  // user's back, the second cannot survive a redirect; the shell renews those sessions itself
  const prefetch =
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.has("next-router-segment-prefetch") ||
    request.headers.get("purpose") === "prefetch" ||
    request.headers.get("sec-purpose")?.includes("prefetch") === true;
  if (!access && refresh && request.method === "GET" && !prefetch) {
    const url = request.nextUrl.clone();
    url.pathname = "/api/v1/auth/refresh";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
