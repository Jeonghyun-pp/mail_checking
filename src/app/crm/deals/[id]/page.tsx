"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, Card } from "@/components/ui";

interface Lead {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
}
interface Stage {
  id: string;
  name: string;
}
interface Task {
  id: string;
  title: string;
  done: boolean;
  dueAt: string | null;
}
interface Activity {
  id: string;
  type: string;
  content: string;
  createdAt: string;
}
interface Deal {
  id: string;
  title: string;
  value: number;
  stageId: string;
  lead: Lead | null;
  stage: Stage;
  pipeline: { id: string; name: string; stages: Stage[] };
  tasks: Task[];
  activities: Activity[];
}

const ACTIVITY_LABEL: Record<string, string> = {
  NOTE: "📝 Note",
  CALL: "📞 Call",
  EMAIL: "✉ Email",
  MEETING: "📅 Meeting",
  STAGE_CHANGE: "↪ Stage",
};

const inputCls =
  "rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200";

export default function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [deal, setDeal] = useState<Deal | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [title, setTitle] = useState("");
  const [value, setValue] = useState(0);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [note, setNote] = useState("");
  const [noteType, setNoteType] = useState("NOTE");

  const load = useCallback(async () => {
    const res = await fetch(`/api/deals/${id}`);
    if (!res.ok) return;
    const d: Deal = (await res.json()).deal;
    setDeal(d);
    setTitle(d.title);
    setValue(d.value);
  }, [id]);

  useEffect(() => {
    load();
    fetch("/api/leads")
      .then((r) => r.json())
      .then((d) => setLeads(d.leads ?? []));
  }, [load]);

  if (!deal) {
    return (
      <div>
        <PageHeader title="Deal" />
        <Card>
          <p className="text-sm text-gray-500">Loading…</p>
        </Card>
      </div>
    );
  }

  async function patchDeal(payload: Record<string, unknown>) {
    await fetch(`/api/deals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await load();
  }

  async function addTask() {
    if (!taskTitle.trim()) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: taskTitle,
        dealId: id,
        dueAt: taskDue ? new Date(taskDue).toISOString() : null,
      }),
    });
    setTaskTitle("");
    setTaskDue("");
    load();
  }

  async function toggleTask(t: Task) {
    await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !t.done }),
    });
    load();
  }

  async function deleteTask(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    load();
  }

  async function addActivity() {
    if (!note.trim()) return;
    await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: noteType, content: note, dealId: id }),
    });
    setNote("");
    load();
  }

  async function deleteDeal() {
    if (!confirm("Delete this deal?")) return;
    await fetch(`/api/deals/${id}`, { method: "DELETE" });
    router.push("/crm");
  }

  return (
    <div className="space-y-5">
      <PageHeader title={deal.title} subtitle={deal.pipeline.name} />

      <Card title="Deal">
        <div className="grid grid-cols-2 gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
            placeholder="Deal title"
          />
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            className={inputCls}
            placeholder="Value"
          />
        </div>
        <div className="flex items-center gap-2 mt-2">
          <select
            value={deal.stageId}
            onChange={(e) => patchDeal({ stageId: e.target.value })}
            className={`${inputCls} flex-1`}
          >
            {deal.pipeline.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => patchDeal({ title, value })}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Save
          </button>
        </div>
      </Card>

      <Card title="Linked lead">
        {deal.lead ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-mono">{deal.lead.email}</p>
              <p className="text-xs text-gray-400">
                {[deal.lead.firstName, deal.lead.lastName]
                  .filter(Boolean)
                  .join(" ")}{" "}
                {deal.lead.company ? `· ${deal.lead.company}` : ""}
              </p>
            </div>
            <button
              onClick={() => patchDeal({ leadId: null })}
              className="text-xs text-gray-400 hover:text-red-600"
            >
              Unlink
            </button>
          </div>
        ) : (
          <select
            onChange={(e) => e.target.value && patchDeal({ leadId: e.target.value })}
            defaultValue=""
            className={`${inputCls} w-full`}
          >
            <option value="">— Link a lead —</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.email}
              </option>
            ))}
          </select>
        )}
      </Card>

      <Card title={`Tasks (${deal.tasks.filter((t) => !t.done).length} open)`}>
        <div className="flex gap-2">
          <input
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            placeholder="New task"
            className={`${inputCls} flex-1`}
          />
          <input
            type="date"
            value={taskDue}
            onChange={(e) => setTaskDue(e.target.value)}
            className={inputCls}
          />
          <button
            onClick={addTask}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Add
          </button>
        </div>
        {deal.tasks.length > 0 && (
          <div className="mt-3 divide-y divide-gray-100">
            {deal.tasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={() => toggleTask(t)}
                />
                <span
                  className={
                    t.done ? "line-through text-gray-400 flex-1" : "flex-1"
                  }
                >
                  {t.title}
                </span>
                {t.dueAt && (
                  <span className="text-xs text-gray-400">
                    {new Date(t.dueAt).toLocaleDateString()}
                  </span>
                )}
                <button
                  onClick={() => deleteTask(t.id)}
                  className="text-xs text-gray-300 hover:text-red-600"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Activity">
        <div className="flex gap-2">
          <select
            value={noteType}
            onChange={(e) => setNoteType(e.target.value)}
            className={inputCls}
          >
            <option value="NOTE">Note</option>
            <option value="CALL">Call</option>
            <option value="EMAIL">Email</option>
            <option value="MEETING">Meeting</option>
          </select>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addActivity()}
            placeholder="Log an activity…"
            className={`${inputCls} flex-1`}
          />
          <button
            onClick={addActivity}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Log
          </button>
        </div>
        {deal.activities.length > 0 && (
          <div className="mt-4 space-y-3">
            {deal.activities.map((a) => (
              <div key={a.id} className="flex gap-3 text-sm">
                <span className="text-xs text-gray-400 w-20 shrink-0">
                  {ACTIVITY_LABEL[a.type] ?? a.type}
                </span>
                <div className="flex-1">
                  <p className="text-gray-700">{a.content}</p>
                  <p className="text-[11px] text-gray-400">
                    {new Date(a.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <button
        onClick={deleteDeal}
        className="text-xs text-gray-400 hover:text-red-600"
      >
        Delete deal
      </button>
    </div>
  );
}
