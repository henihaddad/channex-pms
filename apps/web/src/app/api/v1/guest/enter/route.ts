import { NextResponse } from "next/server";
import { enterGuestPortal } from "@/server/guest-session";
import { HttpProblem } from "@/server/errors";
import { publicRoute } from "@/server/public";

/** The confirmation mail's portal link lands here: cookie set, then the portal (spec 10 §10.6). */
export const GET = publicRoute("guest_portal", async (req) => {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  try {
    await enterGuestPortal(token);
  } catch (e) {
    if (e instanceof HttpProblem)
      return NextResponse.redirect(new URL("/guest?error=invalid", req.url));
    throw e;
  }
  return NextResponse.redirect(new URL("/guest", req.url));
});
