"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card } from "@/components/ui";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  dailyLimit: number;
  usageToday: number;
  usageTotal: number;
  lastUsedAt: string | null;
}
interface Webhook {
  id: string;
  url: string;
  event: string;
  active: boolean;
}
interface Invite {
  id: string;
  code: string;
  createdAt: string;
  usedByEmail: string | null;
  usedAt: string | null;
}

const inputCls =
  "rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200";
const EVENTS = ["LEAD_CREATED", "CAMPAIGN_REPLIED", "DEAL_WON"];

export default function SettingsPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [keyName, setKeyName] = useState("");
  const [freshKey, setFreshKey] = useState("");
  const [hookUrl, setHookUrl] = useState("");
  const [hookEvent, setHookEvent] = useState(EVENTS[0]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);

  const load = useCallback(() => {
    fetch("/api/api-keys")
      .then((r) => r.json())
      .then((d) => setKeys(d.keys ?? []));
    fetch("/api/webhooks")
      .then((r) => r.json())
      .then((d) => setWebhooks(d.webhooks ?? []));
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user?.role === "ADMIN") {
          setIsAdmin(true);
          fetch("/api/invites")
            .then((r) => r.json())
            .then((x) => setInvites(x.invites ?? []));
        }
      });
  }, []);

  async function generateInvite() {
    const res = await fetch("/api/invites", { method: "POST" });
    if (res.ok) {
      const d = await res.json();
      setInvites((prev) => [d.invite, ...prev]);
    }
  }

  useEffect(load, [load]);

  async function createKey() {
    if (!keyName.trim()) return;
    const res = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: keyName }),
    });
    const data = await res.json();
    if (res.ok) {
      setFreshKey(data.key);
      setKeyName("");
      load();
    }
  }

  async function deleteKey(id: string) {
    await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
    load();
  }

  async function createWebhook() {
    if (!hookUrl.trim()) return;
    const res = await fetch("/api/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: hookUrl, event: hookEvent }),
    });
    if (res.ok) {
      setHookUrl("");
      load();
    }
  }

  async function deleteWebhook(id: string) {
    await fetch(`/api/webhooks/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        subtitle="Team invites, API keys and outbound webhooks."
      />

      {isAdmin && (
        <Card
          title="Team invites"
          description="Generate a single-use code so a teammate can sign up."
        >
          <button
            onClick={generateInvite}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Generate invite code
          </button>
          {invites.length > 0 && (
            <div className="mt-3 divide-y divide-gray-100">
              {invites.map((i) => (
                <div
                  key={i.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <code className="font-mono">{i.code}</code>
                  {i.usedAt ? (
                    <span className="text-xs text-gray-400">
                      used by {i.usedByEmail}
                    </span>
                  ) : (
                    <span className="text-xs text-emerald-600 font-semibold">
                      unused
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card
        title="API Keys"
        description="Authenticate /api/v1 requests with a Bearer token."
      >
        <div className="flex gap-2">
          <input
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createKey()}
            placeholder="Key name (e.g. Chrome extension)"
            className={`${inputCls} flex-1`}
          />
          <button
            onClick={createKey}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Create key
          </button>
        </div>

        {freshKey && (
          <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 p-3">
            <p className="text-xs text-emerald-700 font-semibold">
              Copy this key now — it won't be shown again.
            </p>
            <code className="block mt-1 text-sm font-mono break-all">
              {freshKey}
            </code>
          </div>
        )}

        {keys.length > 0 && (
          <div className="mt-3 divide-y divide-gray-100">
            {keys.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <div>
                  <span className="font-medium">{k.name}</span>
                  <span className="ml-2 font-mono text-gray-400">
                    {k.prefix}…
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">
                    {k.usageToday}/{k.dailyLimit} today · {k.usageTotal} total
                  </span>
                  <button
                    onClick={() => deleteKey(k.id)}
                    className="text-xs text-gray-400 hover:text-red-600"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Webhooks"
        description="POST a JSON payload to a URL when an event fires."
      >
        <div className="flex gap-2">
          <select
            value={hookEvent}
            onChange={(e) => setHookEvent(e.target.value)}
            className={inputCls}
          >
            {EVENTS.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
          <input
            value={hookUrl}
            onChange={(e) => setHookUrl(e.target.value)}
            placeholder="https://example.com/webhook"
            className={`${inputCls} flex-1`}
          />
          <button
            onClick={createWebhook}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Add
          </button>
        </div>

        {webhooks.length > 0 && (
          <div className="mt-3 divide-y divide-gray-100">
            {webhooks.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <div>
                  <span className="text-[11px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 font-semibold">
                    {w.event}
                  </span>
                  <span className="ml-2 font-mono text-gray-500 break-all">
                    {w.url}
                  </span>
                </div>
                <button
                  onClick={() => deleteWebhook(w.id)}
                  className="text-xs text-gray-400 hover:text-red-600 shrink-0"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Public API reference">
        <pre className="text-xs bg-gray-50 rounded-lg p-3 overflow-x-auto">
{`# Verify an email
curl -X POST http://localhost:3000/api/v1/verify \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"name@company.com"}'

# Find an email
curl -X POST http://localhost:3000/api/v1/find \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -d '{"firstName":"Jane","lastName":"Doe","domain":"company.com"}'

# Create a lead
curl -X POST http://localhost:3000/api/v1/leads \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -d '{"email":"name@company.com","firstName":"Jane"}'`}
        </pre>
      </Card>
    </div>
  );
}
