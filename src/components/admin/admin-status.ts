/**
 * Admin workspaces use a small shared vocabulary for the decision state. The
 * original authority value remains available through the element title, while
 * the visible label tells an operator what state they are dealing with.
 */
export function adminStatusLabel(value: unknown) {
  const status = String(value ?? "UNKNOWN").toUpperCase();
  if (status === "REJECTED") return "Rejected";
  if (
    [
      "HEALTHY",
      "OPERATIONAL",
      "DELIVERED",
      "PROCESSED",
      "RECONCILED",
      "SETTLED",
      "AVAILABLE",
      "ACTIVE",
    ].includes(status)
  )
    return "Clear";
  if (
    [
      "PENDING",
      "CREATED",
      "PROCESSING",
      "ACCEPTED",
      "OPEN",
      "CLAIMED",
      "WAITING_STAFF",
      "PARTIALLY_FILLED",
      "PENDING_PROVIDER",
    ].includes(status)
  )
    return "In progress";
  if (["WAITING_USER", "ACTION_REQUIRED", "CHANGES_REQUESTED", "INCOMPLETE"].includes(status))
    return "Needs customer action";
  if (
    [
      "MANUAL_REVIEW",
      "REVIEW",
      "UNDER_REVIEW",
      "HELD",
      "MISMATCH",
      "ESCALATED",
      "PENDING_APPROVAL",
    ].includes(status)
  )
    return "Needs admin review";
  if (
    ["FAILED", "DEAD_LETTER", "UNAVAILABLE", "INSUFFICIENT", "SUSPENDED", "FROZEN"].includes(status)
  )
    return "Blocked";
  if (["APPROVED", "AUTO_QUALIFIED", "FILLED"].includes(status)) return "Approved";
  if (["PAUSED", "BETA_DISABLED"].includes(status)) return "Paused";
  if (["CLOSED", "CANCELLED", "EXPIRED", "REVERSED"].includes(status)) return "Closed";
  return "Needs admin review";
}

export function adminStatusTone(value: unknown) {
  const label = adminStatusLabel(value);
  if (label === "Clear" || label === "Approved") return "ok";
  if (label === "Blocked" || label === "Closed" || label === "Rejected") return "danger";
  if (label === "Needs customer action" || label === "Needs admin review" || label === "Paused")
    return "warning";
  return "muted";
}
