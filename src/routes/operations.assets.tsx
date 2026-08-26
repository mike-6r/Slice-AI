import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { ApiError } from "@/api/http-client";
import { useSession } from "@/auth/use-session";
import { useAppServices } from "@/providers/AppServicesProvider";

export const Route = createFileRoute("/operations/assets")({ component: AssetOperationsPage });

export function AssetOperationsPage() {
  const services = useAppServices();
  const session = useSession();
  const client = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [valueMinor, setValueMinor] = useState("");
  const [confidence, setConfidence] = useState("80");
  const [coverageMinor, setCoverageMinor] = useState("");
  const [providerCode, setProviderCode] = useState("");
  const [facilityCode, setFacilityCode] = useState("");
  const [providerRef, setProviderRef] = useState("");
  const operations = useQuery({
    queryKey: ["asset-operations"],
    queryFn: () => services.repositories.lifecycle.listOperations(),
    enabled: session.isAuthenticated,
  });
  const readiness = useQuery({
    queryKey: ["asset-operations", selected, "readiness"],
    queryFn: () => services.repositories.lifecycle.getReadiness(selected!),
    enabled: Boolean(selected),
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["asset-operations"] });
  };
  const handoff = useMutation({
    mutationFn: () =>
      services.repositories.lifecycle.handoff(selected!, {
        providerCode,
        facilityCode,
        providerRef,
      }),
    onSuccess: refresh,
  });
  const custody = useMutation({
    mutationFn: (toStatus: string) =>
      services.repositories.lifecycle.transitionCustody(selected!, toStatus, providerRef),
    onSuccess: refresh,
  });
  const valuation = useMutation({
    mutationFn: () =>
      services.repositories.lifecycle.recordValuation(selected!, {
        valueMinor,
        confidence: Number(confidence),
        methodologyCode: "MANUAL_REVIEW",
        sourceType: "MANUAL",
      }),
    onSuccess: refresh,
  });
  const coverage = useMutation({
    mutationFn: () =>
      services.repositories.lifecycle.recordCoverage(selected!, {
        insuredValueMinor: coverageMinor,
        effectiveAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 365 * 86400000).toISOString(),
        status: "ACTIVE",
      }),
    onSuccess: refresh,
  });
  const publish = useMutation({
    mutationFn: () => services.repositories.lifecycle.publish(selected!),
    onSuccess: refresh,
  });
  if (
    !session.isAuthenticated ||
    (operations.error instanceof ApiError && [401, 403].includes(operations.error.status ?? 0))
  )
    return (
      <State
        title="Asset operations access required"
        detail="This lifecycle workspace is for authorized operational staff."
      />
    );
  if (operations.isLoading)
    return (
      <State title="Loading asset operations" detail="Retrieving safe lifecycle work items." />
    );
  if (operations.isError)
    return (
      <State
        title="Asset operations unavailable"
        detail="Lifecycle work items could not be loaded safely."
        retry={() => void operations.refetch()}
      />
    );
  const item = operations.data?.find((entry) => entry.id === selected) ?? null;
  return (
    <main className="page-shell grid gap-6 py-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <section className="rounded-2xl border border-border bg-elevated p-5">
        <p className="page-kicker">Asset operations</p>
        <h1 className="mt-2 text-xl font-semibold">Asset lifecycle</h1>
        <p className="mt-2 text-sm text-subtle">
          Valuation, custody, coverage and publication remain server-authorized transitions.
        </p>
        <ul className="mt-5 divide-y divide-border">
          {operations.data?.map((asset) => (
            <li key={asset.id}>
              <button
                type="button"
                onClick={() => setSelected(asset.id)}
                className="w-full py-3 text-left hover:text-accent"
              >
                <span className="block font-medium">{asset.title}</span>
                <span className="text-xs text-muted">
                  Valuation {asset.valuationStatus.toLowerCase()} · custody{" "}
                  {asset.custodyStatus.toLowerCase()} · coverage{" "}
                  {asset.coverageStatus.toLowerCase()}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {!operations.data?.length && (
          <p className="mt-4 text-sm text-subtle">No active assets require lifecycle work.</p>
        )}
      </section>
      <section className="rounded-2xl border border-border bg-elevated p-6">
        {!item ? (
          <p className="text-subtle">
            Choose an asset to see the real readiness gates and permitted lifecycle actions.
          </p>
        ) : (
          <div className="space-y-6">
            <div>
              <p className="page-kicker">Staff-only record</p>
              <h2 className="mt-1 text-xl font-semibold">{item.title}</h2>
              <p className="mt-2 text-sm text-subtle">
                Catalogue {item.catalogueStatus} · publication {item.publicationStatus}
              </p>
            </div>
            <Readiness value={readiness.data} loading={readiness.isLoading} />
            <div className="grid gap-4 md:grid-cols-2">
              <ActionCard title="Custody" detail={`Current: ${item.custodyStatus}`}>
                <div className="grid gap-2 text-xs">
                  <label>
                    Provider code
                    <input
                      value={providerCode}
                      onChange={(event) => setProviderCode(event.target.value)}
                      placeholder="Approved operator code"
                    />
                  </label>
                  <label>
                    Facility code
                    <input
                      value={facilityCode}
                      onChange={(event) => setFacilityCode(event.target.value)}
                      placeholder="Approved facility"
                    />
                  </label>
                  <label>
                    Evidence / operator reference
                    <input
                      value={providerRef}
                      onChange={(event) => setProviderRef(event.target.value)}
                      placeholder="Reference for this step"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="button-secondary"
                    onClick={() => handoff.mutate()}
                    disabled={
                      handoff.isPending ||
                      !providerCode.trim() ||
                      !facilityCode.trim() ||
                      !providerRef.trim()
                    }
                  >
                    Start intake
                  </button>
                  {["RECEIVED", "INSPECTED", "SECURED", "EXCEPTION"].map((status) => (
                    <button
                      key={status}
                      className="text-sm font-semibold text-accent"
                      onClick={() => custody.mutate(status)}
                      disabled={custody.isPending}
                    >
                      {status.toLowerCase().replaceAll("_", " ")}
                    </button>
                  ))}
                </div>
              </ActionCard>
              <ActionCard title="Valuation" detail={`Current: ${item.valuationStatus}`}>
                <label className="grid gap-1 text-xs">
                  GBP minor units
                  <input
                    value={valueMinor}
                    inputMode="numeric"
                    onChange={(event) => setValueMinor(event.target.value)}
                  />
                </label>
                <label className="mt-2 grid gap-1 text-xs">
                  Confidence
                  <input
                    value={confidence}
                    inputMode="numeric"
                    onChange={(event) => setConfidence(event.target.value)}
                  />
                </label>
                <button
                  className="mt-3 text-sm font-semibold text-accent"
                  disabled={!valueMinor || valuation.isPending}
                  onClick={() => valuation.mutate()}
                >
                  Record valuation
                </button>
              </ActionCard>
              <ActionCard title="Coverage" detail={`Current: ${item.coverageStatus}`}>
                <label className="grid gap-1 text-xs">
                  Insured GBP minor units
                  <input
                    value={coverageMinor}
                    inputMode="numeric"
                    onChange={(event) => setCoverageMinor(event.target.value)}
                  />
                </label>
                <button
                  className="mt-3 text-sm font-semibold text-accent"
                  disabled={!coverageMinor || coverage.isPending}
                  onClick={() => coverage.mutate()}
                >
                  Record active coverage
                </button>
              </ActionCard>
              <ActionCard
                title="Publication"
                detail="The backend evaluates all gates before publication."
              >
                <button
                  className="button-primary"
                  disabled={readiness.data?.status !== "READY" || publish.isPending}
                  onClick={() => publish.mutate()}
                >
                  Publish when ready
                </button>
              </ActionCard>
            </div>
            {[handoff, custody, valuation, coverage, publish].some(
              (mutation) => mutation.isError,
            ) && (
              <p role="alert" className="text-sm text-negative">
                The lifecycle service refused this action. Refresh readiness before retrying.
              </p>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
function Readiness({
  value,
  loading,
}: {
  value?: import("@/domain").PublicationReadiness;
  loading: boolean;
}) {
  if (loading) return <p className="text-sm text-subtle">Loading readiness…</p>;
  if (!value) return <p className="text-sm text-negative">Readiness could not be loaded.</p>;
  return (
    <div
      className={`rounded-lg border p-4 text-sm ${value.status === "READY" ? "border-positive/30 bg-positive/10" : "border-border bg-surface"}`}
    >
      <strong>{value.status === "READY" ? "Ready to publish" : "Publication blocked"}</strong>
      {value.blockingCodes.length ? (
        <ul className="mt-2 list-disc pl-5 text-subtle">
          {value.blockingCodes.map((code) => (
            <li key={code}>{code.replaceAll("_", " ")}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-subtle">All authoritative publication gates are satisfied.</p>
      )}
    </div>
  );
}
function ActionCard({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border p-4">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-muted">{detail}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}
function State({ title, detail, retry }: { title: string; detail: string; retry?: () => void }) {
  return (
    <main className="page-shell py-16">
      <section className="rounded-2xl border border-border bg-elevated p-8 text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-subtle">{detail}</p>
        {retry && (
          <button className="mt-5 text-sm font-semibold text-accent" onClick={retry}>
            Retry
          </button>
        )}
        <Link to="/" className="mt-5 block text-sm font-semibold text-accent">
          Home
        </Link>
      </section>
    </main>
  );
}
