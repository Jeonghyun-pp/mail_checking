"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, Card, StatusBadge, ScoreBar } from "@/components/ui";

interface Candidate {
  email: string;
  pattern: string;
  confidence: number;
  verify: { status: string; reason: string };
}

interface FinderResult {
  best: Candidate | null;
  candidates: Candidate[];
  catchAll: boolean;
  reason: string;
  query: { firstName: string; lastName: string; domain: string };
}

export default function FinderPage() {
  const router = useRouter();
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FinderResult | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const [bulkText, setBulkText] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  async function runFind() {
    setLoading(true);
    setError("");
    setResult(null);
    setSaved("");
    try {
      const res = await fetch("/api/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, domain }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  async function saveLead(email: string) {
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        firstName,
        lastName,
        company: domain,
        source: "finder",
      }),
    });
    if (res.ok) setSaved(email);
  }

  async function runBulk() {
    const rows = bulkText
      .split(/\r?\n/)
      .map((line) => line.split(",").map((c) => c.trim()))
      .filter((cols) => cols[0] && cols[2])
      .map((cols) => ({
        firstName: cols[0],
        lastName: cols[1] ?? "",
        domain: cols[2],
      }));
    if (rows.length === 0) {
      setError("Each line must be: firstName, lastName, domain");
      return;
    }
    setBulkLoading(true);
    try {
      const res = await fetch("/api/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "find", rows }),
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
        title="Email Finder"
        subtitle="Discover a person's work email from their name and company domain."
      />

      <div className="space-y-5">
        <Card title="Find an email">
          <div className="grid grid-cols-3 gap-2">
            <input
              value={firstName}
              onChange={(e) => setFirst(e.target.value)}
              placeholder="First name"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <input
              value={lastName}
              onChange={(e) => setLast(e.target.value)}
              placeholder="Last name"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="company.com"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <button
            onClick={runFind}
            disabled={loading || !firstName || !domain}
            className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            {loading ? "Searching…" : "Find email"}
          </button>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          {result && (
            <div className="mt-4 space-y-3">
              {result.best ? (
                <div className="rounded-lg bg-indigo-50 p-4">
                  <p className="text-[11px] uppercase tracking-wide text-indigo-500 font-semibold">
                    Best match
                  </p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="font-mono font-semibold">
                      {result.best.email}
                    </span>
                    <StatusBadge status={result.best.verify.status} />
                  </div>
                  <div className="mt-2">
                    <ScoreBar score={result.best.confidence} />
                  </div>
                  <p className="mt-2 text-sm text-gray-600">{result.reason}</p>
                  <button
                    onClick={() => saveLead(result.best!.email)}
                    disabled={saved === result.best.email}
                    className="mt-3 rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                  >
                    {saved === result.best.email ? "Saved ✓" : "Save as lead"}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-500">{result.reason}</p>
              )}

              {result.candidates.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1">
                    All candidates ({result.candidates.length})
                  </p>
                  <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
                    {result.candidates.map((c) => (
                      <div
                        key={c.email}
                        className="flex items-center justify-between px-3 py-2 text-sm"
                      >
                        <span className="font-mono">{c.email}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-400">
                            {c.pattern}
                          </span>
                          <StatusBadge status={c.verify.status} />
                          <span className="tabular-nums text-xs text-gray-500 w-8 text-right">
                            {c.confidence}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card
          title="Bulk finder"
          description="One person per line as: firstName, lastName, domain"
        >
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={6}
            placeholder={"John, Doe, acme.com\nJane, Smith, globex.com"}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <button
            onClick={runBulk}
            disabled={bulkLoading || !bulkText.trim()}
            className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            {bulkLoading ? "Queuing…" : "Start bulk search"}
          </button>
        </Card>
      </div>
    </div>
  );
}
