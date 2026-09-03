/** One in-flight push per property (spec 04 §4.5). Redis in the Node worker, a Durable Object on Cloudflare. */
export interface Lease {
  acquire(key: string, ttlMs: number): Promise<boolean>;
  release(key: string): Promise<void>;
}

/** In-process lease for tests, the chaos runner and single-process development. */
export function memoryLease(): Lease {
  const held = new Map<string, number>();
  return {
    async acquire(key: string, ttlMs: number): Promise<boolean> {
      const now = Date.now();
      const until = held.get(key);
      if (until && until > now) return false;
      held.set(key, now + ttlMs);
      return true;
    },
    async release(key: string): Promise<void> {
      held.delete(key);
    },
  };
}
