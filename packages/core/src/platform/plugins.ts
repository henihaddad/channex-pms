/**
 * Spec 12 §12.7 / ADR-0004: plugins run out of process as signed webhooks. The
 * manifest says what a plugin wants; installation shows it; delivery carries an HMAC
 * so a plugin can verify us and we never call anything but the declared endpoint.
 */
export interface PluginManifest {
  key: string;
  name: string;
  version: string;
  /** Domain event types (prefix match with a trailing dot, e.g. `booking.`). */
  events: string[];
  /** Extension points used, for the install screen (§12.7). */
  extensionPoints: Array<
    "event_subscriber" | "report_definition" | "notification_sink" | "webhook_transformer"
  >;
  /** Permissions the plugin asks for; today only read of what the events carry. */
  permissions: string[];
  compatibleCore: string;
  configSchema?: Record<string, unknown>;
}

export interface PluginDeliveryPolicy {
  timeoutMs: number;
  maxAttempts: number;
  /** Consecutive failures that open the plugin's breaker. */
  breakerThreshold: number;
  breakerCooldownMs: number;
  /** Deliveries per minute per plugin. */
  ratePerMinute: number;
}

export const DEFAULT_PLUGIN_POLICY: PluginDeliveryPolicy = {
  timeoutMs: 5_000,
  maxAttempts: 5,
  breakerThreshold: 5,
  breakerCooldownMs: 300_000,
  ratePerMinute: 120,
};

export function pluginWants(manifest: Pick<PluginManifest, "events">, eventType: string): boolean {
  return manifest.events.some((e) =>
    e.endsWith(".") ? eventType.startsWith(e) : e === eventType || e === "*",
  );
}

/** The string both sides sign: version, timestamp and body, dot-separated (replay window enforced by the receiver). */
export function pluginSigningInput(timestamp: string, body: string): string {
  return `v1.${timestamp}.${body}`;
}

/** Exponential backoff with a cap, minutes: 1, 2, 4, 8, 16. */
export function pluginRetryDelayMs(attempt: number): number {
  return Math.min(16, 2 ** Math.max(0, attempt - 1)) * 60_000;
}

/** A misbehaving plugin never delays an ARI push: deliveries are a separate cursor over the outbox, never a queue consumer. */
export const PLUGIN_ISOLATION_NOTE =
  "plugins read the outbox through their own cursor and are delivered by their own job; ari.push and booking.* queues never wait on them";
