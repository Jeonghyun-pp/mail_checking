"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, Card } from "@/components/ui";

interface WarmupAccount {
  id: string;
  fromName: string;
  fromEmail: string;
  warmupOn: boolean;
  warmupTarget: number;
  warmupStartedAt: string | null;
  quotaToday: number;
  sentToday: number;
  totalSent: number;
  totalReplies: number;
}

export default function WarmupPage() {
  const [accounts, setAccounts] = useState<WarmupAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/warmup");
    const data = await res.json();
    setAccounts(data.accounts ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(id: string, payload: Record<string, unknown>) {
    await fetch(`/api/email-accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    load();
  }

  const enabledCount = accounts.filter((a) => a.warmupOn).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Email Warm-up"
        subtitle="Gradually ramp sending volume to build mailbox reputation."
      />

      {!loading && accounts.length > 0 && enabledCount < 2 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
          Warm-up needs at least 2 enabled mailboxes — they exchange mail with
          each other. Enable warm-up on another account to start.
        </div>
      )}

      {loading ? (
        <Card>
          <p className="text-sm text-gray-500">Loading…</p>
        </Card>
      ) : accounts.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500">
            No mailboxes yet. Connect one on the{" "}
            <Link href="/accounts" className="text-indigo-600 underline">
              Email Accounts
            </Link>{" "}
            page first.
          </p>
        </Card>
      ) : (
        accounts.map((a) => {
          const pct = a.quotaToday
            ? Math.min(100, Math.round((a.sentToday / a.quotaToday) * 100))
            : 0;
          return (
            <Card key={a.id}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {a.fromName}{" "}
                    <span className="font-mono text-gray-500">
                      &lt;{a.fromEmail}&gt;
                    </span>
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {a.warmupOn
                      ? `Warming up since ${
                          a.warmupStartedAt
                            ? new Date(a.warmupStartedAt).toLocaleDateString()
                            : "—"
                        }`
                      : "Warm-up off"}
                  </p>
                </div>
                <button
                  onClick={() => patch(a.id, { warmupOn: !a.warmupOn })}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    a.warmupOn
                      ? "bg-amber-500 text-white hover:bg-amber-600"
                      : "bg-emerald-600 text-white hover:bg-emerald-700"
                  }`}
                >
                  {a.warmupOn ? "Turn off" : "Turn on"}
                </button>
              </div>

              {a.warmupOn && (
                <>
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>
                        Today: {a.sentToday} / {a.quotaToday} sent
                      </span>
                      <span>ramp target {a.warmupTarget}/day</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                      <div
                        className="h-full bg-amber-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-6 text-sm">
                    <span>
                      <span className="font-bold tabular-nums">
                        {a.totalSent}
                      </span>{" "}
                      <span className="text-gray-500">total sent</span>
                    </span>
                    <span>
                      <span className="font-bold tabular-nums">
                        {a.totalReplies}
                      </span>{" "}
                      <span className="text-gray-500">replies received</span>
                    </span>
                    <label className="ml-auto flex items-center gap-1 text-xs text-gray-500">
                      target/day
                      <input
                        type="number"
                        defaultValue={a.warmupTarget}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v && v !== a.warmupTarget)
                            patch(a.id, { warmupTarget: v });
                        }}
                        className="w-16 rounded border border-gray-300 px-1.5 py-0.5"
                      />
                    </label>
                  </div>
                </>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
