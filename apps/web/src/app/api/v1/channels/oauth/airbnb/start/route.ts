import { cookies } from "next/headers";
import { withPermission } from "@/server/with-permission";
import { container } from "@/server/container";
import { airbnbOAuthConfig } from "@/server/oauth";

/** CH-5: OAuth authorise once at org level. State is bound to the session via a short-lived cookie. */
export const GET = withPermission.route(
  "channel_account:manage",
  {
    scope: "organization",
    input: () => ({}),
    subject: () => ({ kind: "channel_account", id: "airbnb:start" }),
  },
  async (ctx, _input, req) => {
    const c = await container();
    const cfg = airbnbOAuthConfig(c.config, req.nextUrl.origin);
    const state = c.crypto.randomToken(16);
    (await cookies()).set("pms_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    const url = new URL(cfg.authorizeUrl);
    url.searchParams.set("client_id", cfg.clientId);
    url.searchParams.set("redirect_uri", cfg.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    url.searchParams.set("scope", "listings:read");
    ctx.log.info({ orgId: ctx.orgId }, "airbnb.oauth.start");
    return Response.redirect(url.toString(), 302);
  },
);
