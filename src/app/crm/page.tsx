"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, Card } from "@/components/ui";

interface Lead {
  id: string;
  email: string;
  firstName: string | null;
}
interface Deal {
  id: string;
  title: string;
  value: number;
  stageId: string;
  lead: Lead | null;
  _count: { tasks: number };
}
interface Stage {
  id: string;
  name: string;
  order: number;
  deals: Deal[];
}
interface Pipeline {
  id: string;
  name: string;
  stages: Stage[];
  _count?: { deals: number };
}

function money(v: number): string {
  if (!v) return "";
  return "$" + v.toLocaleString();
}

export default function CrmPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [board, setBoard] = useState<Pipeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [newPipeline, setNewPipeline] = useState("");
  const [addingTo, setAddingTo] = useState<string>("");
  const [dealTitle, setDealTitle] = useState("");
  const [dragId, setDragId] = useState<string>("");

  const loadPipelines = useCallback(async () => {
    const res = await fetch("/api/pipelines");
    const data = await res.json();
    const list: Pipeline[] = data.pipelines ?? [];
    setPipelines(list);
    setLoading(false);
    setSelectedId((cur) => cur || list[0]?.id || "");
  }, []);

  const loadBoard = useCallback(async (id: string) => {
    const res = await fetch(`/api/pipelines/${id}`);
    if (res.ok) setBoard((await res.json()).pipeline);
  }, []);

  useEffect(() => {
    loadPipelines();
  }, [loadPipelines]);

  useEffect(() => {
    if (selectedId) loadBoard(selectedId);
  }, [selectedId, loadBoard]);

  async function createPipeline() {
    if (!newPipeline.trim()) return;
    const res = await fetch("/api/pipelines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newPipeline }),
    });
    const data = await res.json();
    setNewPipeline("");
    await loadPipelines();
    if (res.ok) setSelectedId(data.pipeline.id);
  }

  async function createDeal(stageId: string) {
    if (!dealTitle.trim()) return;
    await fetch("/api/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: dealTitle,
        pipelineId: selectedId,
        stageId,
      }),
    });
    setDealTitle("");
    setAddingTo("");
    loadBoard(selectedId);
  }

  async function moveDeal(dealId: string, stageId: string) {
    // Optimistic: move the card locally, then persist.
    setBoard((prev) => {
      if (!prev) return prev;
      let moved: Deal | undefined;
      const stages = prev.stages.map((s) => ({
        ...s,
        deals: s.deals.filter((d) => {
          if (d.id === dealId) {
            moved = d;
            return false;
          }
          return true;
        }),
      }));
      if (moved) {
        const target = stages.find((s) => s.id === stageId);
        target?.deals.unshift({ ...moved, stageId });
      }
      return { ...prev, stages };
    });
    await fetch(`/api/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId }),
    });
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="CRM" />
        <Card>
          <p className="text-sm text-gray-500">Loading…</p>
        </Card>
      </div>
    );
  }

  if (pipelines.length === 0) {
    return (
      <div>
        <PageHeader title="CRM" subtitle="Track deals through your pipeline." />
        <Card title="Create your first pipeline">
          <div className="flex gap-2">
            <input
              value={newPipeline}
              onChange={(e) => setNewPipeline(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createPipeline()}
              placeholder="Pipeline name (e.g. Sales)"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <button
              onClick={createPipeline}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Create
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Comes with 5 default stages: Lead In, Contacted, Proposal, Won, Lost.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="CRM" subtitle="Drag deals between stages." />

      <div className="flex items-center gap-2 mb-4">
        {pipelines.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelectedId(p.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              p.id === selectedId
                ? "bg-indigo-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {p.name}
          </button>
        ))}
        <div className="flex gap-1 ml-2">
          <input
            value={newPipeline}
            onChange={(e) => setNewPipeline(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createPipeline()}
            placeholder="New pipeline"
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <button
            onClick={createPipeline}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm hover:bg-gray-50"
          >
            +
          </button>
        </div>
      </div>

      {board && (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {board.stages.map((stage) => (
            <div
              key={stage.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragId) moveDeal(dragId, stage.id);
                setDragId("");
              }}
              className="w-56 shrink-0 rounded-xl bg-gray-100 p-2"
            >
              <div className="flex items-center justify-between px-1 py-1.5">
                <span className="text-sm font-semibold">{stage.name}</span>
                <span className="text-xs text-gray-400">
                  {stage.deals.length}
                </span>
              </div>

              <div className="space-y-2 min-h-[40px]">
                {stage.deals.map((deal) => (
                  <Link
                    key={deal.id}
                    href={`/crm/deals/${deal.id}`}
                    draggable
                    onDragStart={() => setDragId(deal.id)}
                    className="block rounded-lg bg-white border border-gray-200 p-2.5 hover:border-indigo-300 cursor-grab active:cursor-grabbing"
                  >
                    <p className="text-sm font-medium text-gray-900">
                      {deal.title}
                    </p>
                    {deal.value > 0 && (
                      <p className="text-xs text-emerald-600 font-semibold mt-0.5">
                        {money(deal.value)}
                      </p>
                    )}
                    {deal.lead && (
                      <p className="text-xs text-gray-400 font-mono mt-0.5 truncate">
                        {deal.lead.email}
                      </p>
                    )}
                    {deal._count.tasks > 0 && (
                      <span className="inline-block mt-1 text-[10px] bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">
                        {deal._count.tasks} open task
                        {deal._count.tasks > 1 ? "s" : ""}
                      </span>
                    )}
                  </Link>
                ))}
              </div>

              {addingTo === stage.id ? (
                <div className="mt-2">
                  <input
                    autoFocus
                    value={dealTitle}
                    onChange={(e) => setDealTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createDeal(stage.id);
                      if (e.key === "Escape") setAddingTo("");
                    }}
                    placeholder="Deal title"
                    className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                  <div className="flex gap-1 mt-1">
                    <button
                      onClick={() => createDeal(stage.id)}
                      className="rounded bg-indigo-600 px-2 py-1 text-xs text-white"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => setAddingTo("")}
                      className="rounded px-2 py-1 text-xs text-gray-500"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setAddingTo(stage.id);
                    setDealTitle("");
                  }}
                  className="mt-2 w-full rounded-lg px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-200"
                >
                  + Add deal
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
