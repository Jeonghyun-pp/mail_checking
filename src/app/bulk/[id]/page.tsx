"use client";

import { use, useCallback, useEffect, useState } from "react";
import { PageHeader, Card, StatusBadge } from "@/components/ui";

interface Verification {
  id: string;
  email: string;
  status: string;
  score: number;
  reason: string | null;
}

interface FindResultRow {
  query: { firstName: string; lastName: string; domain: string };
  email: string | null;
  status: string | null;
  confidence: number;
  reason: string;
}

interface BulkJob {
  id: string;
  type: string;
  status: string;
  total: number;
  processed: number;
  error: string | null;
  result: { results?: FindResultRow[] } & Record<string, number>;
  verifications: Verification[];
}

export default function BulkJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [job, setJob] = useState<BulkJob | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/bulk/${id}`);
    if (res.ok) {
      const data = await res.json();
      setJob(data.job);
      return data.job.status as string;
    }
    return "FAILED";
  }, [id]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const status = await load();
      if (status === "QUEUED" || status === "RUNNING") {
        timer = setTimeout(tick, 2000);
      }
    };
    tick();
    return () => clearTimeout(timer);
  }, [load]);

  if (!job) {
    return (
      <div>
        <PageHeader title="Bulk Job" />
        <Card>
          <p className="text-sm text-gray-500">Loading…</p>
        </Card>
      </div>
    );
  }

  const pct = job.total ? Math.round((job.processed / job.total) * 100) : 0;
  const findRows = job.result?.results ?? [];

  function exportCsv() {
    let csv = "";
    if (job!.type === "VERIFY") {
      csv =
        "email,status,score,reason\n" +
        job!.verifications
          .map(
            (v) =>
              `${v.email},${v.status},${v.score},"${v.reason ?? ""}"`,
          )
          .join("\n");
    } else {
      csv =
        "firstName,lastName,domain,email,status,confidence\n" +
        findRows
          .map(
            (r) =>
              `${r.query.firstName},${r.query.lastName},${r.query.domain},${r.email ?? ""},${r.status ?? ""},${r.confidence}`,
          )
          .join("\n");
    }
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `bulk-${job!.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        title={job.type === "VERIFY" ? "Bulk Verification" : "Bulk Email Search"}
        subtitle={`Job ${job.id}`}
      />

      <div className="space-y-5">
        <Card>
          <div className="flex items-center justify-between">
            <StatusBadge status={job.status} />
            <span className="text-sm text-gray-500 tabular-nums">
              {job.processed} / {job.total}
            </span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full bg-indigo-600 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          {job.error && (
            <p className="mt-2 text-sm text-red-600">{job.error}</p>
          )}
          {job.status === "DONE" && (
            <button
              onClick={exportCsv}
              className="mt-4 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
            >
              Export CSV
            </button>
          )}
        </Card>

        {job.type === "VERIFY" && job.verifications.length > 0 && (
          <Card title="Results">
            <div className="divide-y divide-gray-100">
              {job.verifications.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span className="font-mono">{v.email}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 tabular-nums">
                      {v.score}
                    </span>
                    <StatusBadge status={v.status} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {job.type === "FIND" && findRows.length > 0 && (
          <Card title="Results">
            <div className="divide-y divide-gray-100">
              {findRows.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <div>
                    <span className="text-gray-500">
                      {r.query.firstName} {r.query.lastName} @{" "}
                      {r.query.domain}
                    </span>
                    <span className="ml-2 font-mono">
                      {r.email ?? "— not found"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 tabular-nums">
                      {r.confidence}
                    </span>
                    {r.status && <StatusBadge status={r.status} />}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
