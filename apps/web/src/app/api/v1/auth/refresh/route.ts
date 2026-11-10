import { NextResponse, type NextRequest } from "next/server";
import { publicRoute } from "@/server/public";
import { refreshFlow } from "@/server/auth-flows";
import { unauthorized } from "@/server/errors";

/** The client's background renewal (the console shell calls it while a tab is open). */
export const POST = publicRoute("auth", async () => {
  if (!(await refreshFlow())) throw unauthorized();
  return Response.json({ ok: true });
});

/**
 * A page load whose access token has lapsed: the proxy sends it here with the page it asked
 * for, the refresh token buys a new access token, and the browser goes back where it was.
 * Only same-site paths are followed, so this cannot be used as an open redirect.
 */
export const GET = publicRoute("auth", async (req: NextRequest) => {
  const asked = req.nextUrl.searchParams.get("next") ?? "/";
  const next =
    asked.startsWith("/") && !asked.startsWith("//") && !asked.startsWith("/\\") ? asked : "/";
  const ok = await refreshFlow();
  const to = new URL(ok ? next : "/login", req.nextUrl.origin);
  if (!ok && next !== "/") to.searchParams.set("next", next);
  return NextResponse.redirect(to, 303);
});
