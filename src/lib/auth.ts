import crypto from "node:crypto";

/**
 * Password hashing with Node's built-in scrypt — no native dependency.
 * Stored format: "<salt-hex>:<hash-hex>".
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(test, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export {
  signSessionToken,
  verifySessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "./session-token";
