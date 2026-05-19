"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card } from "@/components/ui";

interface Account {
  id: string;
  fromName: string;
  fromEmail: string;
  smtpHost: string;
  smtpPort: number;
  dailyLimit: number;
  imapHost: string | null;
}

const EMPTY = {
  fromName: "",
  fromEmail: "",
  smtpHost: "",
  smtpPort: 587,
  smtpUser: "",
  smtpPassword: "",
  smtpSecure: false,
  dailyLimit: 50,
  imapHost: "",
  imapPort: 993,
  imapUser: "",
  imapPassword: "",
  imapSecure: true,
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [showImap, setShowImap] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  function refresh() {
    fetch("/api/email-accounts")
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts ?? []));
  }
  useEffect(refresh, []);

  async function add() {
    setSaving(true);
    setError("");
    try {
      // Only include IMAP settings when a host was provided.
      const { imapHost, imapPort, imapUser, imapPassword, imapSecure, ...smtp } =
        form;
      const payload =
        showImap && imapHost
          ? { ...smtp, imapHost, imapPort, imapUser, imapPassword, imapSecure }
          : smtp;

      const res = await fetch("/api/email-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add account");
      setForm({ ...EMPTY });
      setShowImap(false);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/email-accounts/${id}`, { method: "DELETE" });
    setAccounts((p) => p.filter((a) => a.id !== id));
  }

  async function test(id: string) {
    setTestResult((p) => ({ ...p, [id]: "testing" }));
    const res = await fetch(`/api/email-accounts/${id}/test`, {
      method: "POST",
    });
    const data = await res.json();
    setTestResult((p) => ({
      ...p,
      [id]: data.ok ? "ok" : `fail: ${data.error}`,
    }));
  }

  const inputCls =
    "rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Email Accounts"
        subtitle="Connect the mailboxes that campaigns will send from."
      />

      <Card title="Connect a mailbox">
        <p className="text-xs font-semibold text-gray-400 mb-1">SMTP (sending)</p>
        <div className="grid grid-cols-2 gap-2">
          <input
            className={inputCls}
            placeholder="From name"
            value={form.fromName}
            onChange={(e) => setForm({ ...form, fromName: e.target.value })}
          />
          <input
            className={inputCls}
            placeholder="From email"
            value={form.fromEmail}
            onChange={(e) => setForm({ ...form, fromEmail: e.target.value })}
          />
          <input
            className={inputCls}
            placeholder="SMTP host (e.g. smtp.gmail.com)"
            value={form.smtpHost}
            onChange={(e) => setForm({ ...form, smtpHost: e.target.value })}
          />
          <input
            className={inputCls}
            type="number"
            placeholder="SMTP port"
            value={form.smtpPort}
            onChange={(e) =>
              setForm({ ...form, smtpPort: Number(e.target.value) })
            }
          />
          <input
            className={inputCls}
            placeholder="SMTP username"
            value={form.smtpUser}
            onChange={(e) => setForm({ ...form, smtpUser: e.target.value })}
          />
          <input
            className={inputCls}
            type="password"
            placeholder="SMTP password"
            value={form.smtpPassword}
            onChange={(e) =>
              setForm({ ...form, smtpPassword: e.target.value })
            }
          />
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={form.smtpSecure}
              onChange={(e) =>
                setForm({ ...form, smtpSecure: e.target.checked })
              }
            />
            Use TLS (port 465)
          </label>
          <input
            className={inputCls}
            type="number"
            placeholder="Daily send limit"
            value={form.dailyLimit}
            onChange={(e) =>
              setForm({ ...form, dailyLimit: Number(e.target.value) })
            }
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600 mt-3">
          <input
            type="checkbox"
            checked={showImap}
            onChange={(e) => setShowImap(e.target.checked)}
          />
          Enable reply detection (IMAP)
        </label>

        {showImap && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <input
              className={inputCls}
              placeholder="IMAP host (e.g. imap.gmail.com)"
              value={form.imapHost}
              onChange={(e) => setForm({ ...form, imapHost: e.target.value })}
            />
            <input
              className={inputCls}
              type="number"
              placeholder="IMAP port"
              value={form.imapPort}
              onChange={(e) =>
                setForm({ ...form, imapPort: Number(e.target.value) })
              }
            />
            <input
              className={inputCls}
              placeholder="IMAP username"
              value={form.imapUser}
              onChange={(e) => setForm({ ...form, imapUser: e.target.value })}
            />
            <input
              className={inputCls}
              type="password"
              placeholder="IMAP password"
              value={form.imapPassword}
              onChange={(e) =>
                setForm({ ...form, imapPassword: e.target.value })
              }
            />
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={form.imapSecure}
                onChange={(e) =>
                  setForm({ ...form, imapSecure: e.target.checked })
                }
              />
              IMAP over TLS
            </label>
          </div>
        )}

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button
          onClick={add}
          disabled={saving}
          className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Add account"}
        </button>
      </Card>

      <Card title="Connected accounts">
        {accounts.length === 0 ? (
          <p className="text-sm text-gray-500">No mailboxes connected yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {accounts.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {a.fromName}{" "}
                    <span className="font-mono text-gray-500">
                      &lt;{a.fromEmail}&gt;
                    </span>
                  </p>
                  <p className="text-xs text-gray-400">
                    {a.smtpHost}:{a.smtpPort} · {a.dailyLimit}/day
                    {a.imapHost ? " · reply detection on" : ""}
                  </p>
                  {testResult[a.id] && (
                    <p
                      className={`text-xs mt-0.5 ${
                        testResult[a.id] === "ok"
                          ? "text-emerald-600"
                          : testResult[a.id] === "testing"
                            ? "text-gray-400"
                            : "text-red-600"
                      }`}
                    >
                      {testResult[a.id] === "ok"
                        ? "Connection OK ✓"
                        : testResult[a.id] === "testing"
                          ? "Testing…"
                          : testResult[a.id]}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => test(a.id)}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    Test
                  </button>
                  <button
                    onClick={() => remove(a.id)}
                    className="text-xs text-gray-400 hover:text-red-600"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
