"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, Card, StatusBadge } from "@/components/ui";

interface BulkJob {
  id: string;
  type: string;
  status: string;
  total: number;
  processed: number;
  createdAt: string;
}

export default function BulkListPage() {
  const [jobs, setJobs] = useState<BulkJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/bulk")
      .then((r) => r.json())
      .then((d) => setJobs(d.jobs ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title="Bulk Jobs"
        subtitle="Background verification and finder jobs."
      />
      <Card>
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-gray-500">
            No jobs yet. Start one from the Verifier or Finder page.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {jobs.map((job) => (
              <Link
                key={job.id}
                href={`/bulk/${job.id}`}
                className="flex items-center justify-between py-3 hover:bg-gray-50 -mx-2 px-2 rounded"
              >
                <div>
                  <span className="text-sm font-medium">
                    {job.type === "VERIFY" ? "Verification" : "Email search"}
                  </span>
                  <span className="ml-2 text-xs text-gray-400">
                    {new Date(job.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 tabular-nums">
                    {job.processed}/{job.total}
                  </span>
                  <StatusBadge status={job.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
