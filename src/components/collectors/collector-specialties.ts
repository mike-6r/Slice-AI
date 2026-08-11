import type { CollectorProfile } from "@/domain";

/**
 * Public filters are derived from the public focus string returned by the API;
 * they never infer a collector's private holdings or account data.
 */
export function collectorSpecialties(collector: CollectorProfile) {
  const value = collector.focus.trim();
  return value.includes("·")
    ? [
        ...new Set(
          value
            .split("·")
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ].slice(0, 5)
    : [];
}
