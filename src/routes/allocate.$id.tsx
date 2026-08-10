import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/allocate/$id")({
  head: () => ({ meta: [{ title: "Portfolio allocation unavailable | Slice" }] }),
  component: AllocationUnavailable,
});

/**
 * The former page simulated a multi-asset allocation, fees, capacity and a fill. Slice has no
 * authoritative allocation authority or API for that product, so it is deliberately unavailable.
 */
function AllocationUnavailable() {
  return (
    <main className="page-shell py-16">
      <section className="mx-auto max-w-2xl rounded-2xl border border-border bg-elevated p-8 text-center">
        <p className="page-kicker">Unavailable</p>
        <h1 className="page-title mt-3">Portfolio allocation is not available</h1>
        <p className="mt-4 text-subtle">
          Slice does not currently offer an authoritative portfolio-allocation product. We do not
          simulate allocations, prices, fees, ownership capacity, or fills.
        </p>
        <Link to="/marketplace" className="mt-6 inline-block text-sm font-semibold text-accent">
          Browse published assets
        </Link>
      </section>
    </main>
  );
}
