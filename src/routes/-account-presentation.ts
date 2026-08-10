import type { ComplianceState } from "@/domain";

export function accountStatusLabel(status: string) {
  return status
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function complianceLabel(status: ComplianceState) {
  return status === "APPROVED" ? "Verified" : accountStatusLabel(status);
}

export function initialsFor(displayName: string, email: string) {
  const initials = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || email.slice(0, 2).toUpperCase();
}

export function memberSinceLabel(createdAt: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(createdAt));
}

export const ACCOUNT_UNAVAILABLE = {
  memberSince: "Member date not exposed",
  twoFactor: "Authenticator status not exposed",
  sessions: "Session history not exposed",
  integrations: "No connected integration is exposed",
  dataExport: "Data export is not available in this account view",
  deactivate: "Account deactivation is not available in this account view",
} as const;
