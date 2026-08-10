export const LISTING_STEPS = [
  ["Asset details", "Basic information"],
  ["Details & terms", "Submission metadata"],
  ["Media & documents", "Evidence upload"],
  ["Review & submit", "Send for review"],
] as const;

export const SUBMISSION_EMPTY = {
  categories: "No categories are currently available.",
  drafts: "You have no saved submissions.",
  media: "No media added yet.",
} as const;

export function submissionName(metadata: Record<string, unknown> | null) {
  const value = metadata?.name;
  return typeof value === "string" && value.trim() ? value : "Untitled submission";
}
