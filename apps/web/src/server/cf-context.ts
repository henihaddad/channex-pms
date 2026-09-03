import { getCloudflareContext } from "@opennextjs/cloudflare";

/** The bindings this app declares in wrangler.jsonc; everything else is a string var or secret. */
export interface CfEnv {
  HYPERDRIVE?: { connectionString: string };
  [key: string]: unknown;
}

export interface CfContext {
  env: CfEnv;
  ctx: { waitUntil(promise: Promise<unknown>): void };
}

/** The Cloudflare request context when running on Workers (ADR-0008), null under plain Node. */
export function cfContext(): CfContext | null {
  try {
    const c = getCloudflareContext() as { env?: unknown; ctx?: CfContext["ctx"] } | undefined;
    if (!c?.env || !c.ctx) return null;
    return { env: c.env as CfEnv, ctx: c.ctx };
  } catch {
    return null;
  }
}
