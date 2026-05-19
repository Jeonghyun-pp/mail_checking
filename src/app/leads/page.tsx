"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card, StatusBadge } from "@/components/ui";

interface Lead {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  source: string | null;
  verifyStatus: string;
  createdAt: string;
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  function refresh() {
    fetch("/api/leads")
      .then((r) => r.json())
      .then((d) => setLeads(d.leads ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  async function remove(id: string) {
    await fetch(`/api/leads/${id}`, { method: "DELETE" });
    setLeads((prev) => prev.filter((l) => l.id !== id));
  }

  async function importFile(file: File) {
    const csv = await file.text();
    const res = await fetch("/api/leads/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv }),
    });
    const data = await res.json();
    if (res.ok) {
      alert(`Imported ${data.imported}, skipped ${data.skipped}.`);
      refresh();
    } else {
      alert(data.error ?? "Import failed");
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between">
        <PageHeader
          title="Leads"
          subtitle="Prospects saved from the finder, imports and campaigns."
        />
        <div className="flex gap-2">
          <label className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50">
            Import CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFile(f);
                e.target.value = "";
              }}
            />
          </label>
          <a
            href="/api/leads/export"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Export CSV
          </a>
        </div>
      </div>
      <Card>
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : leads.length === 0 ? (
          <p className="text-sm text-gray-500">
            No leads yet. Save one from the Email Finder.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="py-2 font-medium">Email</th>
                <th className="py-2 font-medium">Name</th>
                <th className="py-2 font-medium">Company</th>
                <th className="py-2 font-medium">Source</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-b border-gray-50 last:border-0"
                >
                  <td className="py-2 font-mono">{lead.email}</td>
                  <td className="py-2 text-gray-600">
                    {[lead.firstName, lead.lastName]
                      .filter(Boolean)
                      .join(" ") || "—"}
                  </td>
                  <td className="py-2 text-gray-600">
                    {lead.company || "—"}
                  </td>
                  <td className="py-2 text-gray-400 text-xs">
                    {lead.source}
                  </td>
                  <td className="py-2">
                    <StatusBadge status={lead.verifyStatus} />
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => remove(lead.id)}
                      className="text-xs text-gray-400 hover:text-red-600"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
