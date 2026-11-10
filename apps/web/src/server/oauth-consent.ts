import { evaluate, type RoleKey } from "@pms/authz";
import {
  authorizationRedirect,
  checkAuthorizationRequest,
  isLoopbackRedirect,
  redirectHost,
  type OAuthErrorCode,
} from "@pms/core";
import {
  DrizzleIdentityRepository,
  DrizzleOAuthStore,
  rawRows,
  sql,
  withoutTenant,
  withTenant,
} from "@pms/db";
import { container } from "./container";
import { memberships } from "./auth-flows";
import { oauthUrls } from "./oauth";
import { currentOrgId, currentSession } from "./session";

/** The authorization request parameters the consent form carries back to the action. */
export const AUTHORIZE_PARAMS = [
  "response_type",
  "client_id",
  "redirect_uri",
  "code_challenge",
  "code_challenge_method",
  "state",
  "scope",
  "resource",
] as const;

export type ConsentView =
  | { kind: "signin"; next: string }
  /** Never redirected: the client or its redirect cannot be trusted (OAuth 2.1 §4.1.2.1). */
  | { kind: "error"; error: OAuthErrorCode; description: string }
  | { kind: "redirect"; to: string }
  /** Signed in, but no organization where this person may connect an app. */
  | { kind: "no_org"; clientName: string }
  | {
      kind: "consent";
      clientName: string;
      redirectHost: string;
      /** A desktop or CLI client on this computer. */
      loopback: boolean;
      orgs: Array<{ id: string; name: string }>;
      defaultOrgId: string;
      params: Record<string, string>;
      denyUrl: string;
    };

function single(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? undefined : v;
}

/** Organizations where this person may connect an app: the same right as creating an API key. */
async function eligibleOrgs(userId: string): Promise<Array<{ id: string; name: string }>> {
  const c = await container();
  const out: Array<{ id: string; name: string }> = [];
  for (const m of await memberships(userId as never)) {
    const { grants, name } = await withTenant(
      c.db.db,
      { orgId: m.orgId, actor: { type: "user", id: userId } },
      async (tx) => ({
        grants: await new DrizzleIdentityRepository(tx).listGrantsForSubject(
          "user",
          userId as never,
        ),
        name: (
          await rawRows<{ name: string }>(
            tx,
            sql`select name from organization where id = ${m.orgId}`,
          )
        )[0]?.name,
      }),
    );
    const allowed = evaluate({
      permission: "api_key:create",
      target: { kind: "organization", id: m.orgId },
      graph: { orgId: m.orgId, groupProperties: new Map() },
      grants: grants
        .filter((g) => g.roleKey)
        .map((g) => ({
          role: g.roleKey as RoleKey,
          scope: { kind: g.scopeType, id: g.scopeId },
          ...(g.overrides ? { overrides: g.overrides as never } : {}),
          expiresAt: g.expiresAt,
        })),
    }).allow;
    if (allowed) out.push({ id: m.orgId, name: name ?? (m.name || m.slug) });
  }
  return out;
}

/**
 * What the authorize page shows (spec 04 §4.7b): sign in first, an error that must not
 * redirect, a protocol error sent back to the client, or the consent screen.
 */
export async function loadConsent(
  sp: Record<string, string | string[] | undefined>,
): Promise<ConsentView> {
  const params: Record<string, string> = {};
  for (const k of AUTHORIZE_PARAMS) {
    const v = single(sp[k]);
    if (v !== undefined) params[k] = v;
  }
  const c = await container();
  const urls = await oauthUrls();
  const client = params.client_id
    ? await withoutTenant(c.db.db, (tx) => new DrizzleOAuthStore(tx).findClient(params.client_id!))
    : null;
  const check = checkAuthorizationRequest(params, client, urls.resource);
  if (check.kind === "fatal")
    return { kind: "error", error: check.error, description: check.description };
  if (check.kind === "redirect_error")
    return {
      kind: "redirect",
      to: authorizationRedirect(check.redirectUri, {
        error: check.error,
        error_description: check.description,
        state: check.state,
        iss: urls.issuer,
      }),
    };
  const session = await currentSession();
  if (!session) {
    const qs = new URLSearchParams(params).toString();
    return { kind: "signin", next: `/oauth/authorize?${qs}` };
  }
  const orgs = await eligibleOrgs(session.userId);
  if (orgs.length === 0) return { kind: "no_org", clientName: client!.clientName };
  const current = await currentOrgId();
  const r = check.request;
  return {
    kind: "consent",
    clientName: client!.clientName,
    redirectHost: redirectHost(r.redirectUri),
    loopback: isLoopbackRedirect(r.redirectUri),
    orgs,
    defaultOrgId: orgs.find((o) => o.id === current)?.id ?? orgs[0]!.id,
    params,
    denyUrl: authorizationRedirect(r.redirectUri, {
      error: "access_denied",
      error_description: "The person declined",
      state: r.state,
      iss: urls.issuer,
    }),
  };
}
