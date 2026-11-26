/** The bindings this app declares in wrangler.jsonc; everything else is a string var or secret. */
export interface CfEnv {
  HYPERDRIVE?: { connectionString: string };
  [key: string]: unknown;
}

export interface CfContext {
  env: CfEnv;
  ctx: { waitUntil(promise: Promise<unknown>): void };
}

/** Where the Worker entry (vinext/worker.ts, ADR-0013) publishes the current request's context. */
export const CF_CONTEXT = Symbol.for("otabridge.cloudflare-context");

type Store = { getStore(): CfContext | undefined };

/** The Cloudflare request context when running on Workers (ADR-0013), null under plain Node. */
export function cfContext(): CfContext | null {
  const store = (globalThis as { [CF_CONTEXT]?: Store })[CF_CONTEXT];
  return store?.getStore() ?? null;
}
