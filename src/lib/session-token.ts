// Edge-safe session tokens — used by both middleware (edge) and route
// handlers (node). Uses only Web Crypto, no node:* imports.

const SECRET = process.env.AUTH_SECRET ?? "dev-insecure-secret";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const SESSION_COOKIE = "mc_session";

const encoder = new TextEncoder();

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Uint8Array {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function getKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(SECRET) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Create a signed, expiring session token for a user. */
export async function signSessionToken(userId: string): Promise<string> {
  const body = b64urlEncode(
    encoder.encode(JSON.stringify({ uid: userId, exp: Date.now() + SESSION_MS })),
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    await getKey(),
    encoder.encode(body) as BufferSource,
  );
  return `${body}.${b64urlEncode(new Uint8Array(sig))}`;
}

/** Verify a session token; returns the user id, or null if invalid/expired. */
export async function verifySessionToken(
  token: string,
): Promise<string | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await getKey(),
      b64urlDecode(sig) as BufferSource,
      encoder.encode(body) as BufferSource,
    );
    if (!valid) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(b64urlDecode(body)),
    ) as { uid?: unknown; exp?: unknown };
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return typeof payload.uid === "string" ? payload.uid : null;
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = SESSION_MS / 1000;
