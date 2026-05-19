import type { ReactNode } from "react";

const STATUS_STYLES: Record<string, string> = {
  VALID: "bg-emerald-100 text-emerald-700",
  INVALID: "bg-red-100 text-red-700",
  CATCH_ALL: "bg-amber-100 text-amber-700",
  RISKY: "bg-orange-100 text-orange-700",
  UNKNOWN: "bg-gray-200 text-gray-600",
  NOT_VERIFIED: "bg-gray-100 text-gray-500",
  // job statuses
  QUEUED: "bg-gray-200 text-gray-600",
  RUNNING: "bg-blue-100 text-blue-700",
  DONE: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-red-100 text-red-700",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? "bg-gray-100 text-gray-500";
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-emerald-500"
      : score >= 50
        ? "bg-amber-500"
        : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-1.5 rounded-full bg-gray-200 overflow-hidden">
        <div
          className={`h-full ${color}`}
          style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 tabular-nums">{score}</span>
    </div>
  );
}

export function Card({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      {title && <h2 className="font-semibold text-gray-900">{title}</h2>}
      {description && (
        <p className="text-sm text-gray-500 mt-0.5">{description}</p>
      )}
      <div className={title ? "mt-4" : ""}>{children}</div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">
        {title}
      </h1>
      {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
    </header>
  );
}
