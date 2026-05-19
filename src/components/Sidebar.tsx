"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/", label: "Dashboard", icon: "▦" },
  { href: "/finder", label: "Email Finder", icon: "🔍" },
  { href: "/verify", label: "Email Verifier", icon: "✓" },
  { href: "/bulk", label: "Bulk Jobs", icon: "≣" },
  { href: "/leads", label: "Leads", icon: "👤" },
  { href: "/campaigns", label: "Campaigns", icon: "✉" },
  { href: "/crm", label: "CRM", icon: "▤" },
  { href: "/warmup", label: "Warm-up", icon: "🔥" },
  { href: "/deliverability", label: "Deliverability", icon: "📊" },
  { href: "/accounts", label: "Email Accounts", icon: "⚙" },
  { href: "/settings", label: "Settings & API", icon: "🔑" },
];

const SOON: string[] = [];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setEmail(d.user?.email ?? null))
      .catch(() => setEmail(null));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="w-60 shrink-0 border-r border-gray-200 bg-white flex flex-col">
      <div className="px-5 py-5 border-b border-gray-100">
        <span className="text-lg font-bold tracking-tight">
          mail<span className="text-indigo-600">checking</span>
        </span>
        <p className="text-[11px] text-gray-400 mt-0.5">Outreach platform</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-indigo-50 text-indigo-700 font-medium"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <span className="w-4 text-center">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}

        {SOON.length > 0 && (
          <>
            <p className="px-3 pt-5 pb-1 text-[11px] uppercase tracking-wide text-gray-400">
              Coming soon
            </p>
            {SOON.map((label) => (
              <div
                key={label}
                className="flex items-center gap-3 px-3 py-2 text-sm text-gray-300 cursor-not-allowed"
              >
                <span className="w-4 text-center">○</span>
                {label}
              </div>
            ))}
          </>
        )}
      </nav>

      <div className="px-4 py-3 border-t border-gray-100">
        <p className="text-[11px] text-gray-400 px-1 truncate">
          {email ?? "Not signed in"}
        </p>
        <button
          onClick={logout}
          className="mt-1 w-full text-left px-1 py-1 text-xs text-gray-500 hover:text-red-600"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
