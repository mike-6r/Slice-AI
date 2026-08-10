import { useEffect } from "react";

/** Installs local-only QA observability after the browser has hydrated. */
export function QaHarnessBoundary() {
  useEffect(() => {
    if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_QA_HARNESS !== "true") return;

    void import("@/auth/qa-harness").then(({ installQaHarness }) => installQaHarness());
  }, []);

  return null;
}
