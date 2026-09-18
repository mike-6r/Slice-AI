import type { WalletMovementQuery, WalletMovementStatus, WalletMovementView } from "@/domain";

export type MovementHistoryFilters = {
  type: "ALL" | "DEPOSIT" | "WITHDRAWAL";
  status: "ALL" | WalletMovementStatus;
  search: string;
  from: string;
  to: string;
};

export function movementHistoryQuery(
  filters: MovementHistoryFilters,
  limit: number,
  cursor?: string,
): WalletMovementQuery {
  return {
    limit,
    ...(cursor ? { cursor } : {}),
    ...(filters.type !== "ALL" ? { type: filters.type } : {}),
    ...(filters.status !== "ALL" ? { status: filters.status } : {}),
    ...(filters.search.trim() ? { search: filters.search.trim() } : {}),
    ...(filters.from ? { from: `${filters.from}T00:00:00.000Z` } : {}),
    ...(filters.to ? { to: `${filters.to}T23:59:59.999Z` } : {}),
  };
}

export function movementStatusLabel(status: WalletMovementStatus) {
  const labels: Record<WalletMovementStatus, string> = {
    CREATED: "Requested",
    PENDING_PROVIDER: "Awaiting provider",
    PROCESSING: "Processing",
    SETTLED: "Completed",
    FAILED: "Failed",
    CANCELLED: "Cancelled",
    RETURNED: "Returned",
    MANUAL_REVIEW: "Under review",
    HELD: "On hold",
    REVERSED: "Reversed",
  };
  return labels[status];
}

/** Export only the safe customer projection; exact minor-unit conversion, never FX estimates. */
export function movementPageCsv(items: WalletMovementView[]) {
  const cell = (value: string) =>
    `"${(/^[\s]*[=+\-@\t\r\n]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`;
  const rows = items.map((item) => {
    const minor = BigInt(item.amountMinor);
    return [
      item.reference ?? `WLT-${item.id.slice(0, 8).toUpperCase()}`,
      item.createdAt,
      item.type,
      movementStatusLabel(item.status),
      `${minor / 100n}.${String(minor % 100n).padStart(2, "0")}`,
      item.currency,
      item.sourceLabel ?? "GBP wallet",
    ];
  });
  return [
    [
      "Reference",
      "Requested (UTC)",
      "Type",
      "Status",
      "Amount",
      "Currency",
      "Source / destination",
    ],
    ...rows,
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}
