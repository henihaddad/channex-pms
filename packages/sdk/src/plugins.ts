/**
 * Plugin SDK (Apache-2.0, spec 12 §12.7, ADR-0004): what a plugin receives and how it
 * verifies that a delivery came from the platform. No dependencies: `crypto.subtle`
 * is the only primitive, so the same code runs in Node, Deno and workers.
 */
export interface PluginEvent<T = unknown> {
  id: string;
  type: string;
  orgId: string;
  aggregate: { kind: string; id: string };
  payload: T;
  occurredAt: string;
  dedupeKey: string;
}

export interface PluginDeliveryHeaders {
  "x-pms-signature": string;
  "x-pms-timestamp": string;
  "x-pms-delivery": string;
  "x-pms-event": string;
}

const enc = new TextEncoder();

async function hmacHex(secret: string, input: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(input));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The signed string: `v1.<unix seconds>.<raw body>`; the header is `v1=<hex hmac-sha256>`. */
export async function signPluginDelivery(
  secret: string,
  timestamp: string,
  body: string,
): Promise<string> {
  return `v1=${await hmacHex(secret, `v1.${timestamp}.${body}`)}`;
}

/**
 * Verify a delivery. Rejects a bad signature and anything older than the replay
 * window (default five minutes). Constant-time comparison.
 */
export async function verifyPluginDelivery(input: {
  secret: string;
  body: string;
  signature: string;
  timestamp: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "bad timestamp" };
  if (Math.abs(now - ts) > (input.toleranceSeconds ?? 300)) return { ok: false, reason: "stale" };
  const expected = await signPluginDelivery(input.secret, input.timestamp, input.body);
  if (expected.length !== input.signature.length) return { ok: false, reason: "bad signature" };
  let diff = 0;
  for (let i = 0; i < expected.length; i++)
    diff |= expected.charCodeAt(i) ^ input.signature.charCodeAt(i);
  return diff === 0 ? { ok: true } : { ok: false, reason: "bad signature" };
}

/** A manifest as the platform's install screen reads it. */
export interface PluginManifest {
  key: string;
  name: string;
  version: string;
  events: string[];
  extensionPoints: Array<
    "event_subscriber" | "report_definition" | "notification_sink" | "webhook_transformer"
  >;
  permissions: string[];
  compatibleCore: string;
  configSchema?: Record<string, unknown>;
}
