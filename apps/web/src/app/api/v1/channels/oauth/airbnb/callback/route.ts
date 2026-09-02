import { cookies } from "next/headers";
import { Id } from "@pms/core";
import { DrizzleChannelRepository } from "@pms/db";
import { withPermission } from "@/server/with-permission";
import { container } from "@/server/container";
import { HttpProblem } from "@/server/errors";
import { airbnbOAuthConfig, exchangeCode, type OAuthTokens } from "@/server/oauth";

/**
 * OAuth callback (CH-2, CH-5): verify state and exchange the code in the input
 * phase, outside the tenant transaction (an outbound call must never hold the
 * database), then seal the tokens into a ChannelAccount.
 */
export const GET = withPermission.route<OAuthTokens>(
  "channel_account:manage",
  {
    scope: "organization",
    input: async (req) => {
      const code = req.nextUrl.searchParams.get("code") ?? "";
      const state = req.nextUrl.searchParams.get("state") ?? "";
      const jar = await cookies();
      if (!state || jar.get("pms_oauth_state")?.value !== state)
        throw new HttpProblem(400, "oauth_state", "OAuth state mismatch");
      jar.delete("pms_oauth_state");
      const c = await container();
      return exchangeCode(airbnbOAuthConfig(c.config, req.nextUrl.origin), code);
    },
    subject: () => ({ kind: "channel_account", id: "airbnb:callback" }),
    redact: ["accessToken", "refreshToken"],
  },
  async (ctx, tokens, req) => {
    const c = await container();
    await new DrizzleChannelRepository(ctx.tx, ctx.orgId).insertAccount({
      id: Id.next(),
      adapterCode: "AirBNB",
      label: tokens.accountLabel ?? "Airbnb host account",
      oauthTokensEnc: await c.crypto.seal(
        JSON.stringify({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }),
      ),
      oauthExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
    });
    return Response.redirect(new URL("/channels", req.nextUrl.origin).toString(), 302);
  },
);
