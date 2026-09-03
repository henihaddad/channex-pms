/** `ioredis` stand-in for Workers bundles: realtime falls back to polling, leases live in a Durable Object. */
export class Redis {
  constructor() {
    throw new Error("Redis is not available on this runtime");
  }
}
export default Redis;
