import type { Redis } from "ioredis";

/** Per-property in-flight lease: SET NX PX; released only by the holder. */
export function redisLease(redis: Redis) {
  const tokens = new Map<string, string>();
  return {
    async acquire(key: string, ttlMs: number): Promise<boolean> {
      const token = `${String(process.pid)}:${String(Date.now())}:${String(Math.random())}`;
      const ok = await redis.set(key, token, "PX", ttlMs, "NX");
      if (ok === "OK") tokens.set(key, token);
      return ok === "OK";
    },
    async release(key: string): Promise<void> {
      const token = tokens.get(key);
      if (!token) return;
      tokens.delete(key);
      await redis.eval(
        `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`,
        1,
        key,
        token,
      );
    },
  };
}

/** In-process lease for tests and the chaos runner. */
export function memoryLease() {
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
