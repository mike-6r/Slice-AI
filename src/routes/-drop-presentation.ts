import type { DropView } from "@/data/repositories";

export function dropReferenceValueLabel(
  referenceValue: { amountMinor: string; currency: string } | null,
): string {
  if (!referenceValue) return "Reference value unavailable";
  const amount = Number(referenceValue.amountMinor);
  if (!Number.isSafeInteger(amount))
    return `${referenceValue.currency} ${referenceValue.amountMinor} minor`;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: referenceValue.currency,
  }).format(amount / 100);
}

export function canSubmitDrop(drop: Pick<DropView, "state" | "readiness">): boolean {
  return drop.state === "DRAFT" && drop.readiness.ready;
}

export function dropInventorySummary(
  drop: Pick<DropView, "inventoryCount" | "openingCount" | "remainingInventoryCount">,
) {
  return {
    selected: drop.inventoryCount,
    opened: drop.openingCount,
    remaining: drop.remainingInventoryCount,
  };
}
