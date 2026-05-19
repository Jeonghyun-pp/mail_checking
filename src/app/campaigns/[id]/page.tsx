"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, Card, StatusBadge } from "@/components/ui";

interface Step {
  id?: string;
  order: number;
  delayHours: number;
  subject: string;
  body: string;
  subjectB?: string | null;
  bodyB?: string | null;
}
interface Lead {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}
interface Recipient {
  id: string;
  status: string;
  currentStep: number;
  lead: Lead;
}
interface Account {
  id: string;
  fromName: string;
  fromEmail: string;
}
interface Campaign {
  id: string;
  name: string;
  status: string;
  emailAccountId: string | null;
  steps: Step[];
  recipients: Recipient[];
}
interface Stats {
  SENT: number;
  OPENED: number;
  CLICKED: number;
  REPLIED: number;
  BOUNCED: number;
}
interface VariantCount {
  sent: number;
  opened: number;
  clicked: number;
}
interface AbStat {
  stepId: string;
  A: VariantCount;
  B: VariantCount;
}

const inputCls =
  "rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200";

function rate(part: number, whole: number): string {
  if (whole === 0) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

export default function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [abStats, setAbStats] = useState<AbStat[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [accountId, setAccountId] = useState("");
  const [msg, setMsg] = useState("");
  const [picker, setPicker] = useState<string[]>([]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setCampaign(data.campaign);
    setStats(data.stats);
    setAbStats(data.abStats ?? []);
    setSteps(data.campaign.steps);
    setAccountId(data.campaign.emailAccountId ?? "");
  }, [id]);

  useEffect(() => {
    load();
    fetch("/api/email-accounts")
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts ?? []));
    fetch("/api/leads")
      .then((r) => r.json())
      .then((d) => setLeads(d.leads ?? []));
  }, [load]);

  if (!campaign) {
    return (
      <div>
        <PageHeader title="Campaign" />
        <Card>
          <p className="text-sm text-gray-500">Loading…</p>
        </Card>
      </div>
    );
  }

  async function patch(payload: Record<string, unknown>, note: string) {
    const res = await fetch(`/api/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setMsg(res.ok ? note : "Save failed");
    await load();
    setTimeout(() => setMsg(""), 2500);
  }

  function updateStep(i: number, patch: Partial<Step>) {
    setSteps((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    );
  }
  function addStep() {
    setSteps((prev) => [
      ...prev,
      {
        order: prev.length,
        delayHours: 48,
        subject: "Following up, {{firstName}}",
        body: "Just following up on my previous note.",
      },
    ]);
  }
  function removeStep(i: number) {
    setSteps((prev) =>
      prev.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, order: idx })),
    );
  }
  function toggleAb(i: number, on: boolean) {
    updateStep(
      i,
      on
        ? { subjectB: "", bodyB: "" }
        : { subjectB: null, bodyB: null },
    );
  }

  async function saveSteps() {
    await patch(
      { steps: steps.map((s, i) => ({ ...s, order: i })) },
      "Sequence saved",
    );
  }

  async function addRecipients() {
    if (picker.length === 0) return;
    await fetch(`/api/campaigns/${id}/recipients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadIds: picker }),
    });
    setPicker([]);
    await load();
  }

  async function remove() {
    if (!confirm("Delete this campaign?")) return;
    await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    router.push("/campaigns");
  }

  const enrolledLeadIds = new Set(campaign.recipients.map((r) => r.lead.id));
  const availableLeads = leads.filter((l) => !enrolledLeadIds.has(l.id));
  const canActivate =
    !!accountId && steps.length > 0 && campaign.recipients.length > 0;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <PageHeader title={campaign.name} subtitle={`Campaign ${campaign.id}`} />
        <div className="flex items-center gap-2">
          <StatusBadge status={campaign.status} />
          {campaign.status !== "ACTIVE" ? (
            <button
              onClick={() => patch({ status: "ACTIVE" }, "Campaign activated")}
              disabled={!canActivate}
              title={
                canActivate
                  ? ""
                  : "Set an email account, a sequence and recipients first"
              }
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              Activate
            </button>
          ) : (
            <button
              onClick={() => patch({ status: "PAUSED" }, "Campaign paused")}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600"
            >
              Pause
            </button>
          )}
        </div>
      </div>

      {msg && <p className="text-sm text-emerald-600">{msg}</p>}

      {stats && (
        <div className="grid grid-cols-5 gap-3">
          {(
            [
              ["Sent", stats.SENT],
              ["Opened", stats.OPENED],
              ["Clicked", stats.CLICKED],
              ["Replied", stats.REPLIED],
              ["Bounced", stats.BOUNCED],
            ] as const
          ).map(([label, value]) => (
            <div
              key={label}
              className="bg-white rounded-xl border border-gray-200 p-3 text-center"
            >
              <p className="text-2xl font-bold tabular-nums">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          ))}
        </div>
      )}

      <Card title="Sending account">
        <div className="flex gap-2">
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className={`${inputCls} flex-1`}
          >
            <option value="">— Select a mailbox —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.fromName} ({a.fromEmail})
              </option>
            ))}
          </select>
          <button
            onClick={() =>
              patch({ emailAccountId: accountId || null }, "Account saved")
            }
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Save
          </button>
        </div>
        {accounts.length === 0 && (
          <p className="mt-2 text-xs text-gray-400">
            No mailboxes yet — add one on the Email Accounts page.
          </p>
        )}
      </Card>

      <Card
        title="Drip sequence"
        description="Delay is from the previous step. Variables: {{firstName}} {{company}}. Spin: {Hi|Hello|Hey}"
      >
        <div className="space-y-4">
          {steps.map((step, i) => {
            const abOn = step.subjectB !== null && step.subjectB !== undefined;
            const ab = abStats.find((a) => a.stepId === step.id);
            return (
              <div
                key={i}
                className="rounded-lg border border-gray-200 p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500">
                    Step {i + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    {i > 0 && (
                      <label className="text-xs text-gray-500 flex items-center gap-1">
                        wait
                        <input
                          type="number"
                          value={step.delayHours}
                          onChange={(e) =>
                            updateStep(i, {
                              delayHours: Number(e.target.value),
                            })
                          }
                          className="w-16 rounded border border-gray-300 px-1.5 py-0.5"
                        />
                        h
                      </label>
                    )}
                    {steps.length > 1 && (
                      <button
                        onClick={() => removeStep(i)}
                        className="text-xs text-gray-400 hover:text-red-600"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-[11px] font-semibold text-gray-400">
                  {abOn ? "Variant A" : "Email"}
                </p>
                <input
                  value={step.subject}
                  onChange={(e) => updateStep(i, { subject: e.target.value })}
                  placeholder="Subject"
                  className={`${inputCls} w-full`}
                />
                <textarea
                  value={step.body}
                  onChange={(e) => updateStep(i, { body: e.target.value })}
                  rows={5}
                  placeholder="Email body"
                  className={`${inputCls} w-full font-mono`}
                />

                {abOn && (
                  <>
                    <p className="text-[11px] font-semibold text-gray-400 pt-1">
                      Variant B
                    </p>
                    <input
                      value={step.subjectB ?? ""}
                      onChange={(e) =>
                        updateStep(i, { subjectB: e.target.value })
                      }
                      placeholder="Subject B"
                      className={`${inputCls} w-full`}
                    />
                    <textarea
                      value={step.bodyB ?? ""}
                      onChange={(e) => updateStep(i, { bodyB: e.target.value })}
                      rows={5}
                      placeholder="Email body B"
                      className={`${inputCls} w-full font-mono`}
                    />
                  </>
                )}

                <label className="flex items-center gap-2 text-xs text-gray-500">
                  <input
                    type="checkbox"
                    checked={abOn}
                    onChange={(e) => toggleAb(i, e.target.checked)}
                  />
                  A/B test this step (50/50 split)
                </label>

                {ab && (ab.A.sent > 0 || ab.B.sent > 0) && (
                  <div className="rounded bg-gray-50 p-2 text-xs text-gray-600">
                    <span className="font-semibold">A:</span> {ab.A.sent} sent ·{" "}
                    {rate(ab.A.opened, ab.A.sent)} open ·{" "}
                    {rate(ab.A.clicked, ab.A.sent)} click
                    <span className="mx-2 text-gray-300">|</span>
                    <span className="font-semibold">B:</span> {ab.B.sent} sent ·{" "}
                    {rate(ab.B.opened, ab.B.sent)} open ·{" "}
                    {rate(ab.B.clicked, ab.B.sent)} click
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={addStep}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            + Add step
          </button>
          <button
            onClick={saveSteps}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Save sequence
          </button>
        </div>
      </Card>

      <Card title={`Recipients (${campaign.recipients.length})`}>
        {campaign.recipients.length > 0 && (
          <div className="divide-y divide-gray-100 mb-4">
            {campaign.recipients.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span className="font-mono">{r.lead.email}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">
                    step {r.currentStep + 1}
                  </span>
                  <StatusBadge status={r.status} />
                </div>
              </div>
            ))}
          </div>
        )}

        {availableLeads.length > 0 ? (
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1">
              Add leads
            </p>
            <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
              {availableLeads.map((l) => (
                <label
                  key={l.id}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={picker.includes(l.id)}
                    onChange={(e) =>
                      setPicker((p) =>
                        e.target.checked
                          ? [...p, l.id]
                          : p.filter((x) => x !== l.id),
                      )
                    }
                  />
                  <span className="font-mono">{l.email}</span>
                </label>
              ))}
            </div>
            <button
              onClick={addRecipients}
              disabled={picker.length === 0}
              className="mt-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              Add {picker.length || ""} selected
            </button>
          </div>
        ) : (
          <p className="text-xs text-gray-400">
            All leads are enrolled. Save more on the Leads / Finder pages.
          </p>
        )}
      </Card>

      <button
        onClick={remove}
        className="text-xs text-gray-400 hover:text-red-600"
      >
        Delete campaign
      </button>
    </div>
  );
}
