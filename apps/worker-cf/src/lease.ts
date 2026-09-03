import { DurableObject } from "cloudflare:workers";
import type { Lease } from "@pms/jobs";

/**
 * One Durable Object per lease key: the in-flight lock per property that
 * Redis SET NX held in apps/worker (spec 04 §4.5). Storage survives isolate
 * restarts; the TTL bounds a crashed holder.
 */
export class PropertyLease extends DurableObject {
  async acquire(ttlMs: number): Promise<boolean> {
    const until = (await this.ctx.storage.get<number>("until")) ?? 0;
    if (until > Date.now()) return false;
    await this.ctx.storage.put("until", Date.now() + ttlMs);
    return true;
  }

  async release(): Promise<void> {
    await this.ctx.storage.delete("until");
  }
}

export function durableLease(ns: DurableObjectNamespace<PropertyLease>): Lease {
  return {
    acquire: (key, ttlMs) => ns.get(ns.idFromName(key)).acquire(ttlMs),
    release: (key) => ns.get(ns.idFromName(key)).release(),
  };
}
