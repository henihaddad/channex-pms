import { AsyncLocalStorage } from "node:async_hooks";
import { headers } from "next/headers";
import { hashApiKey, isApiKey, isOAuthAccessToken } from "@pms/core";
import { resolveApiKey, withoutTenant, type ResolvedApiKey } from "@pms/db";
import { container } from "./container";
import { HttpProblem } from "./errors";

/** A request made with an API key (spec 04 §4.7a): the key's service account acts, never a person. */
export interface ApiKeyPrincipal extends ResolvedApiKey {
  /** Where the call came in, for the audit entry's `surface`. */
  surface: "api" | "mcp";
  /** An access token from "Sign in with OTAbridge" (spec 04 §4.7b), not a key a person created. */
  oauth: boolean;
}

const store = new AsyncLocalStorage<{ principal: ApiKeyPrincipal }>();

export const invalidApiKey = () =>
  new HttpProblem(
    401,
    "invalid_api_key",
    "Invalid or revoked API key",
    "Create a key on Settings → API & AI and send it as Authorization: Bearer otab_…",
  );

/**
 * Look a presented secret up by its hash; null for an unknown, revoked or expired key. An
 * OAuth access token is issued for the MCP server alone (its audience, RFC 8707), so the
 * REST API does not take one.
 */
export async function resolvePresentedKey(
  secret: string,
  surface: ApiKeyPrincipal["surface"],
): Promise<ApiKeyPrincipal | null> {
  if (!isApiKey(secret)) return null;
  const oauth = isOAuthAccessToken(secret);
  if (oauth && surface !== "mcp") return null;
  const c = await container();
  const hash = hashApiKey(c.sha256Hex, secret);
  const r = await withoutTenant(c.db.db, (tx) => resolveApiKey(tx, hash));
  return r ? { ...r, surface, oauth } : null;
}

/** Run `fn` as this key: the MCP route resolves once per request, every tool call inside reuses it. */
export function runAsApiKey<T>(principal: ApiKeyPrincipal, fn: () => Promise<T>): Promise<T> {
  return store.run({ principal }, fn);
}

/**
 * The API key this request acts with, if any: the one the MCP route put in context, else an
 * `Authorization: Bearer otab_…` header. A bearer that looks like a key but does not resolve
 * is a 401, never a fall-through to the cookie session.
 */
export async function currentApiKey(): Promise<ApiKeyPrincipal | null> {
  const inContext = store.getStore()?.principal;
  if (inContext) return inContext;
  const auth = (await headers()).get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!bearer?.startsWith("otab_")) return null;
  const principal = await resolvePresentedKey(bearer, "api");
  if (!principal) throw invalidApiKey();
  return principal;
}
