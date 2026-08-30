export const operationWorkspaceTabs = [
  "overview",
  "valuation",
  "ownership",
  "initial-offering",
  "launch",
  "market",
  "controls",
  "history",
] as const;

export type OperationWorkspaceTab = (typeof operationWorkspaceTabs)[number];

export function operationWorkspaceTabLabel(value: OperationWorkspaceTab) {
  return value === "initial-offering"
    ? "Initial Offering"
    : value === "controls"
      ? "Controls & Restrictions"
      : value.replace(/(^|-)\w/g, (letter) => letter.replace("-", "").toUpperCase());
}

export function isEconomicActivity(event: { action: string }) {
  return /(VALUATION|OWNERSHIP|SUPPLY|OFFERING|MARKET|PUBLISH|TRADE|ISSUANCE|ORDER|PROCEEDS)/i.test(
    event.action,
  );
}
