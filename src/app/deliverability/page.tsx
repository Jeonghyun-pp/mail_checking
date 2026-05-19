"use client";

import { useState } from "react";
import { PageHeader, Card, ScoreBar } from "@/components/ui";

interface DomainAuth {
  mx: boolean;
  spf: { found: boolean; record?: string };
  dkim: { found: boolean; selector?: string };
  dmarc: { found: boolean; record?: string; policy?: string };
}
interface Result {
  domain: string;
  auth: DomainAuth;
  authScore: number;
  content: { score: number; issues: { label: string; penalty: number }[] } | null;
  overall: number;
  recommendations: string[];
}

const inputCls =
  "rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200";

function CheckLine({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0 text-sm">
      <span className="text-gray-600">{label}</span>
      <span
        className={`font-medium ${ok ? "text-emerald-600" : "text-red-600"}`}
      >
        {ok ? `Pass${detail ? ` · ${detail}` : ""}` : "Not found"}
      </span>
    </div>
  );
}

export default function DeliverabilityPage() {
  const [domain, setDomain] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function run() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/deliverability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain,
          subject: subject || undefined,
          body: body || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Test failed");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Deliverability Test"
        subtitle="Check domain authentication and scan a draft for spam signals."
      />

      <Card title="Run a test">
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="Sending domain (e.g. yourcompany.com)"
          className={`${inputCls} w-full`}
        />
        <p className="text-xs text-gray-400 mt-2 mb-1">
          Optional — paste a draft to scan its content:
        </p>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Draft subject"
          className={`${inputCls} w-full`}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          placeholder="Draft body"
          className={`${inputCls} w-full mt-2 font-mono`}
        />
        <button
          onClick={run}
          disabled={loading || !domain.trim()}
          className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
        >
          {loading ? "Testing…" : "Run test"}
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </Card>

      {result && (
        <>
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Overall score</p>
                <p className="text-4xl font-bold tabular-nums">
                  {result.overall}
                  <span className="text-lg text-gray-400">/100</span>
                </p>
              </div>
              <div className="w-48">
                <ScoreBar score={result.overall} />
              </div>
            </div>
          </Card>

          <Card title={`Domain authentication — ${result.domain}`}>
            <CheckLine label="MX record" ok={result.auth.mx} />
            <CheckLine
              label="SPF record"
              ok={result.auth.spf.found}
            />
            <CheckLine
              label="DKIM record"
              ok={result.auth.dkim.found}
              detail={result.auth.dkim.selector}
            />
            <CheckLine
              label="DMARC record"
              ok={result.auth.dmarc.found}
              detail={result.auth.dmarc.policy}
            />
            <p className="text-xs text-gray-400 mt-2">
              Authentication score: {result.authScore}/100
            </p>
          </Card>

          {result.content && (
            <Card title="Content analysis">
              <ScoreBar score={result.content.score} />
              {result.content.issues.length === 0 ? (
                <p className="mt-3 text-sm text-emerald-600">
                  No spam signals detected.
                </p>
              ) : (
                <ul className="mt-3 space-y-1.5">
                  {result.content.issues.map((i, idx) => (
                    <li key={idx} className="text-sm text-gray-600">
                      <span className="text-red-500">−{i.penalty}</span>{" "}
                      {i.label}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {result.recommendations.length > 0 && (
            <Card title="Recommendations">
              <ul className="space-y-1.5 text-sm text-gray-700 list-disc pl-5">
                {result.recommendations.map((r, idx) => (
                  <li key={idx}>{r}</li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
