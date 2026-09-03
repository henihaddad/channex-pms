import { cookies } from "next/headers";
import { DrizzlePropertyRepository } from "@pms/db";
import { withPermission } from "@/server/with-permission";
import { container } from "@/server/container";
import { HttpProblem } from "@/server/errors";

/**
 * CH-5: Airbnb is authorised once for the portfolio, through Channex, which is
 * the approved Airbnb partner: Channex issues the OAuth link, the host consents
 * on airbnb.com, and Airbnb returns them to our callback with the new channel.
 * Our token, bound to the session by a short-lived cookie, travels with it.
 */
export const GET = withPermission.route(
  "channel_account:manage",
  {
    scope: "organization",
    input: (req) => ({ propertyId: req.nextUrl.searchParams.get("propertyId") }),
    subject: () => ({ kind: "channel_account", id: "airbnb:start" }),
  },
  async (ctx, input, req) => {
    const c = await container();
    const repo = new DrizzlePropertyRepository(ctx.tx, ctx.orgId);
    const all = await repo.list();
    const chosen = all.filter(
      (p) => p.state === "live" && (!input.propertyId || p.id === input.propertyId),
    );
    if (chosen.length === 0)
      throw new HttpProblem(
        409,
        "no_live_property",
        "Take a property live before connecting Airbnb",
      );
    const maps = await Promise.all(chosen.map((p) => repo.idMap(p.id)));
    const token = c.crypto.randomToken(16);
    (await cookies()).set(
      "pms_airbnb_link",
      JSON.stringify({ token, propertyIds: chosen.map((p) => p.id) }),
      { httpOnly: true, sameSite: "lax", path: "/", maxAge: 2 * 3600 },
    );
    const origin = req.nextUrl.origin;
    const callback = `${origin}/api/v1/channels/oauth/airbnb/callback`;
    const { url } = await c.provider.createAirbnbConnectionLink(
      {
        propertyIds: maps.map((m) => m.property.remote),
        redirectUri: callback,
        failureRedirectUri: `${callback}?success=false`,
        token,
        title: `Airbnb · ${chosen.length === 1 ? chosen[0]!.title : `${chosen.length} properties`}`,
      },
      { dedupeKey: `airbnb:link:${token}`, requestId: ctx.requestId },
    );
    ctx.log.info({ orgId: ctx.orgId, properties: chosen.length }, "airbnb.link.start");
    return Response.redirect(url, 302);
  },
);
