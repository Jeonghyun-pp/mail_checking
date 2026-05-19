/**
 * Candidate email-address patterns, ordered by how common they are for
 * corporate mailboxes. The finder tries them in this order.
 */

export interface EmailCandidate {
  email: string;
  pattern: string;
  /** Prior likelihood weight (higher = more common). */
  weight: number;
}

function clean(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z]/g, "");
}

/**
 * Generate ordered candidate addresses for a person at a domain.
 * `last` is optional — when missing, only first-name patterns are produced.
 */
export function generateCandidates(
  firstName: string,
  lastName: string,
  domain: string,
): EmailCandidate[] {
  const first = clean(firstName);
  const last = clean(lastName);
  const d = domain.trim().toLowerCase().replace(/^@/, "");

  if (!first || !d) return [];

  const fi = first[0];
  const li = last ? last[0] : "";

  const specs: Array<{ local: string; pattern: string; weight: number }> = [];
  const add = (local: string, pattern: string, weight: number) => {
    if (local) specs.push({ local, pattern, weight });
  };

  if (last) {
    add(`${first}.${last}`, "first.last", 100);
    add(`${first}${last}`, "firstlast", 85);
    add(`${fi}${last}`, "flast", 80);
    add(`${fi}.${last}`, "f.last", 70);
    add(`${first}`, "first", 55);
    add(`${first}_${last}`, "first_last", 45);
    add(`${first}-${last}`, "first-last", 30);
    add(`${last}.${first}`, "last.first", 28);
    add(`${last}${first}`, "lastfirst", 22);
    add(`${first}${li}`, "firstl", 20);
    add(`${last}`, "last", 18);
    add(`${fi}${li}`, "fl", 12);
  } else {
    add(`${first}`, "first", 90);
  }

  // De-duplicate while keeping the highest weight per address.
  const byEmail = new Map<string, EmailCandidate>();
  for (const s of specs) {
    const email = `${s.local}@${d}`;
    const existing = byEmail.get(email);
    if (!existing || existing.weight < s.weight) {
      byEmail.set(email, { email, pattern: s.pattern, weight: s.weight });
    }
  }

  return [...byEmail.values()].sort((a, b) => b.weight - a.weight);
}
