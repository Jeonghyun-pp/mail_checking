import IORedis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: IORedis | undefined;
};

/**
 * Shared Redis connection. BullMQ requires `maxRetriesPerRequest: null`
 * on the connection it uses for blocking commands.
 */
export const redis =
  globalForRedis.redis ??
  new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}
