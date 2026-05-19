import crypto from "node:crypto";
import { prisma } from "./prisma";

const DAY_MS = 86400_000;

/** Generate a fresh API key. The plaintext `key` is shown to the user once. */
export function generateApiKey() {
  const key = `mk_${crypto.randomBytes(24).toString("hex")}`;
  return {
    key,
    hash: hashKey(key),
    prefix: key.slice(0, 11), // "mk_" + 8 chars
  };
}

export function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export interface ApiAuthResult {
  ok: boolean;
  status?: number;
  error?: string;
  userId?: string;
}

/** Authenticate a raw API key string, enforce the daily limit, record usage. */
export async function authenticateApiKeyValue(
  raw: string,
): Promise<ApiAuthResult> {
  raw = raw.trim();
  if (!raw) return { ok: false, status: 401, error: "Missing API key" };

  const apiKey = await prisma.apiKey.findUnique({
    where: { hash: hashKey(raw) },
  });
  if (!apiKey) return { ok: false, status: 401, error: "Invalid API key" };

  // Roll the rate-limit window if a day has passed.
  const now = Date.now();
  const windowExpired = now - apiKey.usageResetAt.getTime() >= DAY_MS;
  const usageToday = windowExpired ? 0 : apiKey.usageToday;

  if (usageToday >= apiKey.dailyLimit) {
    return { ok: false, status: 429, error: "Daily rate limit exceeded" };
  }

  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: {
      usageToday: usageToday + 1,
      usageResetAt: windowExpired ? new Date(now) : apiKey.usageResetAt,
      usageTotal: { increment: 1 },
      lastUsedAt: new Date(now),
    },
  });

  return { ok: true, userId: apiKey.userId };
}

/**
 * Authenticate a public-API request via `Authorization: Bearer` or the
 * `x-api-key` header.
 */
export async function authenticateApiKey(req: Request): Promise<ApiAuthResult> {
  const auth = req.headers.get("authorization");
  let raw = req.headers.get("x-api-key") ?? "";
  if (auth?.startsWith("Bearer ")) raw = auth.slice(7);
  return authenticateApiKeyValue(raw);
}
