import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

/**
 * Compatibility entry point for older bookmarks and authenticated return paths.
 * The customer dashboard and portfolio are now one workspace at /portfolio.
 */
export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Portfolio | Slice" }] }),
  component: DashboardRedirect,
});

export function DashboardRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    void navigate({ to: "/portfolio", replace: true });
  }, [navigate]);

  return (
    <main className="page-shell py-20 text-center">
      <p className="text-sm text-subtle">Opening your Slice portfolio…</p>
    </main>
  );
}
