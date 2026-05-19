"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, Card, StatusBadge, ScoreBar } from "@/components/ui";

interface VerifyChecks {
  syntax: boolean;
  hasMx: boolean;
  disposable: boolean;
  roleBased: boolean;
  freeProvider: boolean;
  smtpConnected: boolean;
  mailboxExists: boolean | null;
  catchAll: boolean | null;
}

interface VerifyOutcome {
  email: string;
  status: string;
  score: number;
  reason: string;
  checks: VerifyChecks;
}

const CHECK_LABELS: Record<keyof VerifyChecks, string> = {
  syntax: "Valid syntax",
  hasMx: "Domain has mail server (MX)",
  disposable: "Disposable domain",
  roleBased: "Role-based address",
  freeProvider: "Free mail provider",
  smtpConnected: "SMTP server reachable",
  mailboxExists: "Mailbox exists",
  catchAll: "Catch-all domain",
};

// Checks where `true` is the undesirable outcome.
const NEGATIVE_CHECKS = new Set(["disposable", "roleBased", "catchAll"]);

function CheckRow({ name, value }: { name: keyof VerifyChecks; value: boolean | null }) {
  let mark = "—";
  let color = "text-gray-400";
  if (value !== null) {
    const good = NEGATIVE_CHECKS.has(name) ? !value : value;
    mark = value ? "Yes" : "No";
    color = good ? "text-emerald-600" : "text-red-600";
  }
  return (
    <div className="flex justify-between py-1.5 border-b border-gray-100 last:border-0 text-sm">
      <span className="text-gray-600">{CHECK_LABELS[name]}</span>
      <span className={`font-medium ${color}`}>{mark}</span>
    </div>
  );
}

export default function VerifyPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyOutcome | null>(null);
  const [error, setError] = useState("");

  const [bulkText, setBulkText] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  async function runVerify() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Verification failed");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  async function runBulk() {
    const emails = bulkText
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (emails.length === 0) return;
    setBulkLoading(true);
    try {
      const res = await fetch("/api/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "verify", emails }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to queue job");
      router.push(`/bulk/${data.job.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
      setBulkLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Email Verifier"
        subtitle="Check deliverability with syntax, MX, SMTP and catch-all detection."
      />

      <div className="space-y-5">
        <Card
          title="Verify a single address"
          description="Runs a live SMTP probe — results take a few seconds."
        >
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && email && runVerify()}
              placeholder="name@company.com"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <button
              onClick={runVerify}
              disabled={loading || !email}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              {loading ? "Verifying…" : "Verify"}
            </button>
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          {result && (
            <div className="mt-4 rounded-lg bg-gray-50 p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm">{result.email}</span>
                <StatusBadge status={result.status} />
              </div>
              <div className="mt-3">
                <ScoreBar score={result.score} />
              </div>
              <p className="mt-2 text-sm text-gray-600">{result.reason}</p>
              <div className="mt-3">
                {(Object.keys(CHECK_LABELS) as (keyof VerifyChecks)[]).map(
                  (k) => (
                    <CheckRow key={k} name={k} value={result.checks[k]} />
                  ),
                )}
              </div>
            </div>
          )}
        </Card>

        <Card
          title="Bulk verification"
          description="Paste up to 10,000 addresses — separated by spaces, commas or new lines."
        >
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={6}
            placeholder={"john@acme.com\njane@globex.com"}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <button
            onClick={runBulk}
            disabled={bulkLoading || !bulkText.trim()}
            className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            {bulkLoading ? "Queuing…" : "Start bulk verification"}
          </button>
        </Card>
      </div>
    </div>
  );
}
