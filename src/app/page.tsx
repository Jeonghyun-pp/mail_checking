import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";
import { PageHeader, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

async function getStats() {
  const user = await getCurrentUser();
  const [leads, bulkJobs, verified] = await Promise.all([
    prisma.lead.count({ where: { userId: user.id } }),
    prisma.bulkJob.count({ where: { userId: user.id } }),
    prisma.lead.count({
      where: { userId: user.id, verifyStatus: "VALID" },
    }),
  ]);
  return { leads, bulkJobs, verified };
}

export default async function DashboardPage() {
  const stats = await getStats();

  const tiles = [
    { label: "Leads saved", value: stats.leads },
    { label: "Valid emails", value: stats.verified },
    { label: "Bulk jobs run", value: stats.bulkJobs },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="A Snov.io-style outreach platform — built phase by phase."
      />

      <div className="grid grid-cols-3 gap-4">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="bg-white rounded-xl border border-gray-200 p-5"
          >
            <p className="text-3xl font-bold tabular-nums">{t.value}</p>
            <p className="text-sm text-gray-500 mt-1">{t.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Link href="/finder">
          <Card title="🔍 Find emails">
            <p className="text-sm text-gray-500">
              Discover work emails from a name and company domain.
            </p>
          </Card>
        </Link>
        <Link href="/verify">
          <Card title="✓ Verify emails">
            <p className="text-sm text-gray-500">
              Check deliverability with SMTP and catch-all detection.
            </p>
          </Card>
        </Link>
      </div>

      <Card title="Roadmap">
        <ul className="text-sm text-gray-600 space-y-1.5">
          <li>✅ Phase 1 — Email Finder &amp; Verifier (single + bulk)</li>
          <li>✅ Phase 2 — Cold email campaigns &amp; drip sequences</li>
          <li>✅ Phase 3 — CRM pipelines, deals, tasks &amp; activity</li>
          <li>✅ Phase 4 — Email warm-up &amp; deliverability test</li>
          <li>✅ Phase 5 — Public API, Chrome extension, webhooks, CSV</li>
        </ul>
      </Card>
    </div>
  );
}
