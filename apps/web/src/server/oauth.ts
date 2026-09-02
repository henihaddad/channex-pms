import type { Config } from "@pms/runtime";
import { HttpProblem } from "./errors";

export interface OAuthConfig {
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Airbnb OAuth endpoints; the test hooks point them at the in-app fake authorisation server. */
export function airbnbOAuthConfig(config: Config, origin?: string): OAuthConfig {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? origin ?? config.NEXT_PUBLIC_APP_URL;
  const fake = process.env.PMS_TEST_HOOKS === "1";
  return {
    authorizeUrl:
      process.env.AIRBNB_OAUTH_AUTHORIZE_URL ??
      (fake ? `${base}/api/v1/test/oauth/authorize` : "https://www.airbnb.com/oauth2/auth"),
    tokenUrl:
      process.env.AIRBNB_OAUTH_TOKEN_URL ??
      (fake
        ? `${base}/api/v1/test/oauth/token`
        : "https://api.airbnb.com/v2/oauth2/authorizations"),
    clientId: process.env.AIRBNB_CLIENT_ID ?? "pms-dev",
    clientSecret: process.env.AIRBNB_CLIENT_SECRET ?? "pms-dev-secret",
    redirectUri: `${base}/api/v1/channels/oauth/airbnb/callback`,
  };
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  accountLabel?: string;
}

export async function exchangeCode(cfg: OAuthConfig, code: string): Promise<OAuthTokens> {
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
    }),
  });
  if (!res.ok)
    throw new HttpProblem(502, "oauth_exchange", `Token endpoint answered ${String(res.status)}`);
  const body = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    account_label?: string;
  };
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresIn: body.expires_in,
    accountLabel: body.account_label,
  };
}
