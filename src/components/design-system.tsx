import { type ReactNode } from "react";

import { formatCurrency, formatPercent } from "@/lib/format";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-3xl font-bold tracking-[-0.04em] sm:text-4xl">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-subtle">{description}</p>
        )}
      </div>
      {action}
    </header>
  );
}

export function MetricCard({
  label,
  value,
  change,
  detail,
}: {
  label: string;
  value: string;
  change?: number;
  detail?: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-elevated p-4 shadow-card">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">{label}</p>
      <div className="mt-3 flex items-end gap-2">
        <strong className="font-display text-2xl tracking-[-0.04em]">{value}</strong>
        {change !== undefined && (
          <span
            className={
              change >= 0
                ? "text-sm font-semibold text-positive"
                : "text-sm font-semibold text-negative"
            }
          >
            {formatPercent(change)}
          </span>
        )}
      </div>
      {detail && <p className="mt-1 text-xs text-subtle">{detail}</p>}
    </section>
  );
}

export function FinancialValue({
  value,
  change,
  label,
}: {
  value: number;
  change?: number;
  label?: string;
}) {
  return (
    <div>
      {label && <p className="text-xs uppercase tracking-[0.12em] text-muted">{label}</p>}
      <p className="mt-1 font-display text-2xl font-bold tracking-[-0.04em]">
        {formatCurrency(value)}
      </p>
      {change !== undefined && (
        <p
          className={
            change >= 0
              ? "mt-1 text-sm font-semibold text-positive"
              : "mt-1 text-sm font-semibold text-negative"
          }
        >
          {formatPercent(change)}
        </p>
      )}
    </div>
  );
}

export function StatusBadge({
  status,
}: {
  status:
    | "Active"
    | "Verified"
    | "Pending"
    | "Review"
    | "Open"
    | "Partially filled"
    | "Filled"
    | "Cancelled"
    | "Failed"
    | "Unavailable"
    | "Provider pending";
}) {
  const colors = {
    Active: "bg-positive/10 text-positive",
    Verified: "bg-positive/10 text-positive",
    Pending: "bg-warning/10 text-warning",
    Review: "bg-sky/10 text-sky",
    Open: "bg-sky/10 text-sky",
    "Partially filled": "bg-sky/10 text-sky",
    Filled: "bg-positive/10 text-positive",
    Cancelled: "bg-elevated text-subtle",
    Failed: "bg-destructive/10 text-destructive",
    Unavailable: "bg-elevated text-subtle",
    "Provider pending": "bg-warning/10 text-warning",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${colors[status]}`}
    >
      {status}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border-strong bg-surface p-8 text-center">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-subtle">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
