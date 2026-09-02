import { NextResponse } from "next/server";
import { magicLinkFlow } from "@/server/auth-flows";
import { HttpProblem } from "@/server/errors";
import { publicRoute } from "@/server/public";

/** Magic-link landing (spec 02 §2.6): consume the token, start the session, go to the owner portal. */
export const GET = publicRoute("auth", async (req) => {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  try {
    await magicLinkFlow(token);
  } catch (e) {
    if (e instanceof HttpProblem)
      return NextResponse.redirect(new URL("/owner-login?error=invalid", req.url));
    throw e;
  }
  return NextResponse.redirect(new URL("/owner", req.url));
});
