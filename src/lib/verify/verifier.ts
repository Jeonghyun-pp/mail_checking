import { promises as dns } from "node:dns";
import { DISPOSABLE_DOMAINS, FREE_PROVIDERS, ROLE_PREFIXES } from "./data";
import { probeMailbox } from "./smtp";

export type VerifyStatus =
  | "VALID"
  | "INVALID"
  | "CATCH_ALL"
  | "RISKY"
  | "UNKNOWN";

export interface VerifyChecks {
  syntax: boolean;
  hasMx: boolean;
  disposable: boolean;
  roleBased: boolean;
  freeProvider: boolean;
  smtpConnected: boolean;
  mailboxExists: boolean | null;
  catchAll: boolean | null;
}

export interface VerifyOutcome {
  email: string;
  status: VerifyStatus;
  score: number; // 0-100 confidence the address is deliverable
  reason: string;
  checks: VerifyChecks;
}

// Practical RFC 5322-ish address pattern.
const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function isValidSyntax(email: string): boolean {
  return EMAIL_RE.test(email) && email.length <= 254;
}

/** Resolve MX hosts for a domain, sorted by ascending priority. */
export async function resolveMxHosts(domain: string): Promise<string[]> {
  try {
    const records = await dns.resolveMx(domain);
    if (records.length > 0) {
      return records
        .sort((a, b) => a.priority - b.priority)
        .map((r) => r.exchange);
    }
  } catch {
    // fall through
  }
  // Some domains accept mail on the A record when no MX is published.
  try {
    await dns.resolve4(domain);
    return [domain];
  } catch {
    return [];
  }
}

interface VerifyOptions {
  /** Skip the live SMTP probe (faster, less accurate). */
  skipSmtp?: boolean;
  timeoutMs?: number;
}

/**
 * Run the full verification pipeline for a single address.
 * Mirrors Snov.io's multi-tier verifier: syntax -> MX -> disposable/role ->
 * SMTP mailbox probe -> catch-all detection -> scoring.
 */
export async function verifyEmail(
  rawEmail: string,
  opts: VerifyOptions = {},
): Promise<VerifyOutcome> {
  const email = rawEmail.trim().toLowerCase();
  const checks: VerifyChecks = {
    syntax: false,
    hasMx: false,
    disposable: false,
    roleBased: false,
    freeProvider: false,
    smtpConnected: false,
    mailboxExists: null,
    catchAll: null,
  };

  const fail = (reason: string): VerifyOutcome => ({
    email,
    status: "INVALID",
    score: 0,
    reason,
    checks,
  });

  checks.syntax = isValidSyntax(email);
  if (!checks.syntax) return fail("Malformed email syntax");

  const [localPart, domain] = email.split("@");
  checks.disposable = DISPOSABLE_DOMAINS.has(domain);
  checks.roleBased = ROLE_PREFIXES.has(localPart);
  checks.freeProvider = FREE_PROVIDERS.has(domain);

  if (checks.disposable) {
    return {
      email,
      status: "INVALID",
      score: 0,
      reason: "Disposable / throwaway domain",
      checks,
    };
  }

  const mxHosts = await resolveMxHosts(domain);
  checks.hasMx = mxHosts.length > 0;
  if (!checks.hasMx) return fail("Domain has no mail server (no MX record)");

  if (opts.skipSmtp) {
    // No live probe: classify on metadata alone.
    const status: VerifyStatus = checks.roleBased ? "RISKY" : "UNKNOWN";
    return {
      email,
      status,
      score: checks.roleBased ? 40 : 55,
      reason: "Domain accepts mail (SMTP probe skipped)",
      checks,
    };
  }

  const probe = await probeMailbox(mxHosts[0], email, {
    heloDomain: process.env.VERIFY_HELO_DOMAIN ?? "mail-checking.local",
    mailFrom: process.env.VERIFY_MAIL_FROM ?? "verify@mail-checking.local",
    timeoutMs: opts.timeoutMs ?? 8000,
    checkCatchAll: true,
  });

  checks.smtpConnected = probe.connected;
  checks.mailboxExists = probe.accepted;
  checks.catchAll = probe.catchAll;

  if (!probe.connected) {
    return {
      email,
      status: "UNKNOWN",
      score: 50,
      reason: "Could not reach mail server (port 25 may be blocked)",
      checks,
    };
  }

  if (probe.accepted === false) {
    return {
      email,
      status: "INVALID",
      score: 0,
      reason: "Mail server rejected the recipient",
      checks,
    };
  }

  if (probe.catchAll) {
    return {
      email,
      status: "CATCH_ALL",
      score: 60,
      reason: "Domain accepts all addresses (catch-all) — cannot confirm",
      checks,
    };
  }

  if (probe.accepted) {
    const roleScore = checks.roleBased ? 75 : 95;
    return {
      email,
      status: checks.roleBased ? "RISKY" : "VALID",
      score: roleScore,
      reason: checks.roleBased
        ? "Mailbox exists but is a role-based address"
        : "Mailbox exists and accepts mail",
      checks,
    };
  }

  return {
    email,
    status: "UNKNOWN",
    score: 50,
    reason: "Inconclusive SMTP response",
    checks,
  };
}
