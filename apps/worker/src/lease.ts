import type { Redis } from "ioredis";
import type { Lease } from "@pms/jobs";

export { memoryLease } from "@pms/jobs";

/** Per-property in-flight lease: SET NX PX; released only by the holder. */
export function redisLease(redis: Redis): Lease {
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
