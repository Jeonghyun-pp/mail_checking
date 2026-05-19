"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader, Card, StatusBadge } from "@/components/ui";

interface Campaign {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  _count: { recipients: number; steps: number };
}

export default function CampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((d) => setCampaigns(d.campaigns ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    setCreating(false);
    if (res.ok) router.push(`/campaigns/${data.campaign.id}`);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Campaigns"
        subtitle="Multi-step cold email sequences."
      />

      <Card title="New campaign">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="Campaign name"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <button
            onClick={create}
            disabled={creating || !name.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            Create
          </button>
        </div>
      </Card>

      <Card>
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : campaigns.length === 0 ? (
          <p className="text-sm text-gray-500">No campaigns yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {campaigns.map((c) => (
              <Link
                key={c.id}
                href={`/campaigns/${c.id}`}
                className="flex items-center justify-between py-3 hover:bg-gray-50 -mx-2 px-2 rounded"
              >
                <div>
                  <span className="text-sm font-medium">{c.name}</span>
                  <span className="ml-2 text-xs text-gray-400">
                    {c._count.steps} steps · {c._count.recipients} recipients
                  </span>
                </div>
                <StatusBadge status={c.status} />
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
