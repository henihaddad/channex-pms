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
  "/_next/",
  "/favicon",
  "/icon",
];

/** Redirect unauthenticated console requests to the login page. The server verifies the token; this only routes. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!request.cookies.get("pms_at") && !request.cookies.get("pms_rt")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
