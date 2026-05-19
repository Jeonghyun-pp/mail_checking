import { promises as dns } from "node:dns";

// ---------------------------------------------------------------------------
// Domain authentication (SPF / DKIM / DMARC / MX)
// ---------------------------------------------------------------------------

export interface DomainAuth {
  mx: boolean;
  spf: { found: boolean; record?: string };
  dkim: { found: boolean; selector?: string };
  dmarc: { found: boolean; record?: string; policy?: string };
}

// DKIM has no fixed selector; probe the ones common providers use.
const DKIM_SELECTORS = [
  "google",
  "default",
  "selector1",
  "selector2",
  "k1",
  "k2",
  "mail",
  "dkim",
  "s1",
  "s2",
];

async function resolveTxtFlat(name: string): Promise<string[]> {
  const records = await dns.resolveTxt(name);
  return records.map((chunks) => chunks.join(""));
}

/** Look up the email-authentication DNS records for a domain. */
export async function checkDomainAuth(domain: string): Promise<DomainAuth> {
  const auth: DomainAuth = {
    mx: false,
    spf: { found: false },
    dkim: { found: false },
    dmarc: { found: false },
  };

  try {
    auth.mx = (await dns.resolveMx(domain)).length > 0;
  } catch {
    // no MX
  }

  try {
    const txt = await resolveTxtFlat(domain);
    const spf = txt.find((t) => /^v=spf1/i.test(t));
    if (spf) auth.spf = { found: true, record: spf };
  } catch {
    // no TXT
  }

  try {
    const txt = await resolveTxtFlat(`_dmarc.${domain}`);
    const rec = txt.find((t) => /^v=DMARC1/i.test(t));
    if (rec) {
      auth.dmarc = {
        found: true,
        record: rec,
        policy: /\bp=(\w+)/i.exec(rec)?.[1],
      };
    }
  } catch {
    // no DMARC
  }

  for (const sel of DKIM_SELECTORS) {
    try {
      const txt = await resolveTxtFlat(`${sel}._domainkey.${domain}`);
      if (txt.some((t) => /v=DKIM1|k=rsa|p=[A-Za-z0-9]/i.test(t))) {
        auth.dkim = { found: true, selector: sel };
        break;
      }
    } catch {
      // selector not present — keep probing
    }
  }

  return auth;
}

/** 0-100 score: MX / SPF / DKIM / DMARC each worth 25 points. */
export function authScore(auth: DomainAuth): number {
  return (
    (auth.mx ? 25 : 0) +
    (auth.spf.found ? 25 : 0) +
    (auth.dkim.found ? 25 : 0) +
    (auth.dmarc.found ? 25 : 0)
  );
}

// ---------------------------------------------------------------------------
// Content spam analysis
// ---------------------------------------------------------------------------

export interface ContentIssue {
  label: string;
  penalty: number;
}

const SPAM_WORDS = [
  "free",
  "guarantee",
  "click here",
  "buy now",
  "act now",
  "limited time",
  "winner",
  "cash",
  "100%",
  "risk-free",
  "urgent",
  "congratulations",
  "cheap",
  "discount",
  "earn money",
  "extra income",
  "no obligation",
  "order now",
  "this is not spam",
];

export interface ContentReport {
  score: number;
  issues: ContentIssue[];
}

/** Heuristic spam-signal analysis of a draft email. */
export function analyzeContent(subject: string, body: string): ContentReport {
  const issues: ContentIssue[] = [];
  const text = `${subject}\n${body}`;
  const lower = text.toLowerCase();

  const hits = SPAM_WORDS.filter((w) => lower.includes(w));
  if (hits.length > 0) {
    issues.push({
      label: `Spam trigger words: ${hits.join(", ")}`,
      penalty: Math.min(30, hits.length * 6),
    });
  }

  const words = text.split(/\s+/).filter((w) => w.length > 3);
  const caps = words.filter((w) => /[A-Z]/.test(w) && w === w.toUpperCase());
  if (caps.length > 2) {
    issues.push({
      label: `Excessive ALL-CAPS words (${caps.length})`,
      penalty: 12,
    });
  }

  const excl = (text.match(/!/g) ?? []).length;
  if (excl > 3) {
    issues.push({ label: `Too many exclamation marks (${excl})`, penalty: 10 });
  }

  if (/\$\$\$|!!!|\?\?\?/.test(text)) {
    issues.push({ label: "Spammy punctuation ($$$, !!!, ???)", penalty: 10 });
  }

  if (subject.length > 90) {
    issues.push({ label: "Subject line very long (>90 chars)", penalty: 8 });
  }
  if (subject.trim().length > 0 && subject.trim().length < 3) {
    issues.push({ label: "Subject line too short", penalty: 8 });
  }

  const bodyChars = body.replace(/\s/g, "").length;
  if (bodyChars < 40) {
    issues.push({ label: "Body is very short — looks thin", penalty: 12 });
  }

  const links = (body.match(/https?:\/\//g) ?? []).length;
  if (links > 5) {
    issues.push({ label: `Many links in the body (${links})`, penalty: 10 });
  }
  const textOnly = body.replace(/https?:\/\/\S+/g, "").replace(/\s/g, "");
  if (links > 0 && textOnly.length < 80) {
    issues.push({ label: "Link-heavy with little real text", penalty: 15 });
  }

  if (body.length > 0 && !/unsubscribe|opt.?out/i.test(body)) {
    issues.push({ label: "No unsubscribe option in the body", penalty: 10 });
  }

  const penalty = issues.reduce((sum, i) => sum + i.penalty, 0);
  return { score: Math.max(0, 100 - penalty), issues };
}

// ---------------------------------------------------------------------------
// Combined test
// ---------------------------------------------------------------------------

export interface DeliverabilityResult {
  domain: string;
  auth: DomainAuth;
  authScore: number;
  content: ContentReport | null;
  overall: number;
  recommendations: string[];
}

export async function runDeliverabilityTest(args: {
  domain: string;
  subject?: string;
  body?: string;
}): Promise<DeliverabilityResult> {
  const auth = await checkDomainAuth(args.domain);
  const aScore = authScore(auth);

  const hasContent = !!(args.subject || args.body);
  const content = hasContent
    ? analyzeContent(args.subject ?? "", args.body ?? "")
    : null;

  const overall = content
    ? Math.round(aScore * 0.5 + content.score * 0.5)
    : aScore;

  const recommendations: string[] = [];
  if (!auth.mx) recommendations.push("Add an MX record so the domain can receive mail.");
  if (!auth.spf.found)
    recommendations.push("Publish an SPF record (v=spf1 …) to authorize senders.");
  if (!auth.dkim.found)
    recommendations.push("Set up DKIM signing and publish the public key.");
  if (!auth.dmarc.found)
    recommendations.push("Publish a DMARC record at _dmarc.<domain>.");
  else if (auth.dmarc.policy === "none")
    recommendations.push("Tighten the DMARC policy from p=none to quarantine or reject.");
  if (content) {
    for (const issue of content.issues) recommendations.push(issue.label);
  }

  return { domain: args.domain, auth, authScore: aScore, content, overall, recommendations };
}
