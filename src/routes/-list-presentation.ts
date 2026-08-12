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

const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  CHANGES_REQUESTED: "Changes requested",
  SUBMITTED: "Submitted for review",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved for the next stage",
  REJECTED: "Not progressed",
  CANCELLED: "Cancelled",
};

const MEDIA_STATUS_LABELS: Record<string, string> = {
  PENDING_UPLOAD: "Preparing upload",
  UPLOADED: "Uploaded",
  SCANNING: "Checking file",
  SAFE: "Ready for review",
  REJECTED: "File needs attention",
  DELETED: "Removed",
};

export function submissionName(metadata: Record<string, unknown> | null) {
  const value = metadata?.name;
  return typeof value === "string" && value.trim() ? value : "Untitled submission";
}

export function submissionStatusLabel(status: string) {
  return SUBMISSION_STATUS_LABELS[status] ?? "Submission update pending";
}

export function mediaStatusLabel(status: string) {
  return MEDIA_STATUS_LABELS[status] ?? "Evidence status pending";
}
