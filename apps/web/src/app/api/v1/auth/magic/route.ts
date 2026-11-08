import { NextResponse } from "next/server";
import { magicLinkFlow } from "@/server/auth-flows";
import { HttpProblem } from "@/server/errors";
import { publicRoute } from "@/server/public";

/** Sign-in link landing (spec 02 §2.6): consume the token, start the session, go where the link was for. */
export const GET = publicRoute("auth", async (req) => {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  let next: string;
  try {
    next = (await magicLinkFlow(token)).next;
  } catch (e) {
    if (e instanceof HttpProblem)
      return NextResponse.redirect(new URL("/owner-login?error=invalid", req.url));
    throw e;
  }
  return NextResponse.redirect(new URL(next, req.url));
});
