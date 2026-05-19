import { resolveMxHosts, verifyEmail, type VerifyOutcome } from "../verify/verifier";
import { generateCandidates, type EmailCandidate } from "./patterns";

export interface FinderCandidateResult extends EmailCandidate {
  verify: VerifyOutcome;
  /** Combined confidence: pattern prior blended with verification score. */
  confidence: number;
}

export interface FinderResult {
  query: { firstName: string; lastName: string; domain: string };
  /** Best guess, or null when nothing plausible was found. */
  best: FinderCandidateResult | null;
  candidates: FinderCandidateResult[];
  catchAll: boolean;
  reason: string;
}

function blend(patternWeight: number, verifyScore: number): number {
  // Pattern prior is normalized to 0-100, then weighted 35/65 with the probe.
  return Math.round(patternWeight * 0.35 + verifyScore * 0.65);
}

interface FinderOptions {
  /** Maximum candidates to probe with live SMTP. */
  maxProbes?: number;
  timeoutMs?: number;
}

/**
 * Find the most likely email address for a person at a company domain.
 * Generates pattern candidates, then verifies them via SMTP, stopping
 * early once a confirmed VALID address is found.
 */
export async function findEmail(
  firstName: string,
  lastName: string,
  domain: string,
  opts: FinderOptions = {},
): Promise<FinderResult> {
  const maxProbes = opts.maxProbes ?? 8;
  const query = { firstName, lastName, domain };
  const candidates = generateCandidates(firstName, lastName, domain);

  if (candidates.length === 0) {
    return {
      query,
      best: null,
      candidates: [],
      catchAll: false,
      reason: "Need at least a first name and a domain",
    };
  }

  // No mail server -> no point probing anything.
  const mx = await resolveMxHosts(domain.replace(/^@/, ""));
  if (mx.length === 0) {
    return {
      query,
      best: null,
      candidates: [],
      catchAll: false,
      reason: "Domain has no mail server (no MX record)",
    };
  }

  const results: FinderCandidateResult[] = [];
  let catchAll = false;

  for (const cand of candidates.slice(0, maxProbes)) {
    const verify = await verifyEmail(cand.email, {
      timeoutMs: opts.timeoutMs,
    });
    const confidence = blend(cand.weight, verify.score);
    results.push({ ...cand, verify, confidence });

    if (verify.checks.catchAll) catchAll = true;

    // A confirmed, non-role mailbox is as good as it gets — stop early.
    if (verify.status === "VALID") break;
  }

  results.sort((a, b) => b.confidence - a.confidence);

  const confirmed = results.find((r) => r.verify.status === "VALID");
  let best = confirmed ?? null;
  let reason: string;

  if (best) {
    reason = "Confirmed deliverable address";
  } else if (catchAll) {
    // Catch-all domains accept everything; fall back to the top pattern prior.
    best = results[0] ?? null;
    reason = "Domain is catch-all — returning the most likely pattern";
  } else {
    best = results[0] ?? null;
    reason = best
      ? "No address confirmed — best guess by pattern likelihood"
      : "No plausible address found";
  }

  return { query, best, candidates: results, catchAll, reason };
}
