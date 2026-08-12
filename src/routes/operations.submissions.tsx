import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ApiError } from "@/api/http-client";
import { useSession } from "@/auth/use-session";
import { useAppServices } from "@/providers/AppServicesProvider";

export const Route = createFileRoute("/operations/submissions")({
  component: SubmissionOperationsPage,
});

export function SubmissionOperationsPage() {
  const services = useAppServices();
  const session = useSession();
  const client = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState("INCOMPLETE_EVIDENCE");
  const [note, setNote] = useState("");
  const queue = useQuery({
    queryKey: ["review", "queue"],
    queryFn: () => services.repositories.reviews.listQueue({ limit: 50 }),
    enabled: session.isAuthenticated,
  });
  const detail = useQuery({
    queryKey: ["review", selected],
    queryFn: () => services.repositories.reviews.getDetail(selected!),
    enabled: Boolean(selected),
  });
  const refresh = () => void client.invalidateQueries({ queryKey: ["review"] });
  const claim = useMutation({
    mutationFn: (id: string) => services.repositories.reviews.claim(id),
    onSuccess: refresh,
  });
  const decide = useMutation({
    mutationFn: (decision: "CHANGES_REQUESTED" | "APPROVED" | "REJECTED") =>
      services.repositories.reviews.decide(selected!, decision, {
        reasonCode: reason,
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: () => {
      setNote("");
      refresh();
    },
  });
  if (
    !session.isAuthenticated ||
    (queue.error instanceof ApiError && [401, 403].includes(queue.error.status ?? 0))
  )
    return (
      <State
        title="Reviewer access required"
        detail="This private operations queue is available only to authorized reviewers."
      />
    );
  if (queue.isLoading)
    return (
      <State title="Loading review queue" detail="Retrieving the authorized submission queue." />
    );
  if (queue.isError)
    return (
      <State
        title="Review queue unavailable"
        detail="The queue could not be loaded safely."
        retry={() => void queue.refetch()}
      />
    );
  return (
    <main className="page-shell grid gap-6 py-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <section className="rounded-2xl border border-border bg-elevated p-5">
        <p className="page-kicker">Collector workspace</p>
        <h1 className="mt-2 text-xl font-semibold">Submission review queue</h1>
        {queue.data?.items.length ? (
          <ul className="mt-5 divide-y divide-border">
            {queue.data.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelected(item.id)}
                  className="w-full py-3 text-left hover:text-accent"
                >
                  <span className="block font-mono text-xs text-muted">{item.id}</span>
                  <span className="text-sm font-medium">{item.status.replaceAll("_", " ")}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-subtle">No submitted assets are awaiting review.</p>
        )}
      </section>
      <section className="rounded-2xl border border-border bg-elevated p-6">
        {!selected ? (
          <p className="text-subtle">
            Select a submission to review its safe evidence state and make an authorized decision.
          </p>
        ) : detail.isLoading ? (
          <p className="text-subtle">Loading review detail…</p>
        ) : detail.isError || !detail.data ? (
          <p className="text-negative">Review detail could not be loaded.</p>
        ) : (
          <ReviewDetail
            detail={detail.data}
            onClaim={() => claim.mutate(selected)}
            claiming={claim.isPending}
            reason={reason}
            setReason={setReason}
            note={note}
            setNote={setNote}
            decide={decide}
          />
        )}
      </section>
    </main>
  );
}
function ReviewDetail({
  detail,
  onClaim,
  claiming,
  reason,
  setReason,
  note,
  setNote,
  decide,
}: {
  detail: import("@/domain").SubmissionReviewDetail;
  onClaim: () => void;
  claiming: boolean;
  reason: string;
  setReason: (value: string) => void;
  note: string;
  setNote: (value: string) => void;
  decide: ReturnType<
    typeof useMutation<
      import("@/domain").AssetSubmission,
      Error,
      "CHANGES_REQUESTED" | "APPROVED" | "REJECTED"
    >
  >;
}) {
  const inReview = detail.status === "IN_REVIEW";
  return (
    <div className="space-y-5">
      <div>
        <p className="page-kicker">Private review</p>
        <h2 className="mt-1 text-xl font-semibold">
          {String(detail.declaredMetadata?.name ?? "Untitled asset")}
        </h2>
        <p className="mt-1 text-sm text-subtle">
          {detail.status.replaceAll("_", " ")} ·{" "}
          {detail.media.map((m) => `${m.slot}: ${m.status}`).join(" · ") || "No evidence"}
        </p>
      </div>
      <dl className="grid gap-2 text-sm">
        {Object.entries(detail.declaredMetadata ?? {})
          .filter(([key]) => ["name", "manufacturer", "year", "details", "condition"].includes(key))
          .map(([key, value]) => (
            <div key={key}>
              <dt className="font-medium capitalize">{key}</dt>
              <dd className="text-subtle">{String(value)}</dd>
            </div>
          ))}
      </dl>
      <StaffMarketResearch research={detail.marketResearch} />
      {detail.status === "SUBMITTED" ? (
        <button className="button-primary" onClick={onClaim} disabled={claiming}>
          {claiming ? "Claiming…" : "Claim review"}
        </button>
      ) : null}
      {inReview ? (
        <div className="space-y-3 border-t border-border pt-5">
          <label className="grid gap-2 text-sm font-medium">
            Decision reason code
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value.toUpperCase())}
              pattern="[A-Z][A-Z0-9_]{1,63}"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Safe customer note{" "}
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={2000}
              rows={3}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              className="button-primary"
              disabled={decide.isPending}
              onClick={() => decide.mutate("APPROVED")}
            >
              Approve
            </button>
            <button
              className="button-secondary"
              disabled={decide.isPending}
              onClick={() => decide.mutate("CHANGES_REQUESTED")}
            >
              Request changes
            </button>
            <button
              className="text-sm font-semibold text-negative"
              disabled={decide.isPending}
              onClick={() => decide.mutate("REJECTED")}
            >
              Reject
            </button>
          </div>
        </div>
      ) : null}
      {decide.isError && (
        <p role="alert" className="text-sm text-negative">
          The backend refused this transition. Refresh before trying again.
        </p>
      )}
    </div>
  );
}
function StaffMarketResearch({
  research,
}: {
  research: import("@/domain").MarketResearchSnapshot | null;
}) {
  if (!research)
    return (
      <section className="border-t border-border pt-5">
        <h3 className="font-semibold">Market research</h3>
        <p className="mt-2 text-sm text-subtle">
          No external market research was attached to this submission.
        </p>
      </section>
    );
  const sales = research.snapshot.sales;
  const listings = research.snapshot.listings;
  return (
    <section className="border-t border-border pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="page-kicker">Supporting evidence</p>
          <h3 className="mt-1 font-semibold">External market research</h3>
        </div>
        <span className="text-xs text-subtle">
          Captured{" "}
          {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(
            new Date(research.collectedAt),
          )}
        </span>
      </div>
      <p className="mt-2 text-sm text-subtle">
        Reference data only. D11 staff valuation remains the authoritative decision.
      </p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <StaffMetric
          label="External reference range"
          value={sales ? marketRange(sales) : "No reliable sale range"}
        />
        <StaffMetric
          label="Median recent sale"
          value={sales ? marketAmount(sales.medianMinor, sales.currency) : "Not available"}
        />
        <StaffMetric
          label="Current listings"
          value={listings ? marketRange(listings) : "None tracked"}
        />
        <StaffMetric
          label="Comparable evidence"
          value={`${research.snapshot.exactCompCount} exact · ${research.snapshot.strongCompCount} strong · ${research.snapshot.rejectedCompCount} rejected`}
        />
        <StaffMetric
          label="Source coverage"
          value={`${research.sourceCoverage.available} available · ${research.sourceCoverage.unavailable} unavailable`}
        />
        <StaffMetric
          label="Data quality"
          value={research.dataQuality?.toLowerCase() ?? "Unavailable"}
        />
      </dl>
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold text-accent">
          Inspect comparable observations
        </summary>
        <ul className="mt-3 space-y-2 text-xs text-subtle">
          {research.observations.map((item) => (
            <li
              key={`${item.providerCode}-${item.externalReferenceId}`}
              className="rounded-lg border border-border p-3"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium text-foreground">
                  {item.observationType === "SALE"
                    ? "Completed sale"
                    : item.observationType === "LISTING"
                      ? "Current listing"
                      : "Price guide"}{" "}
                  · {marketAmount(item.amountMinor, item.currency)}
                </span>
                <span>
                  {item.providerCode.replaceAll("_", " ")} · {item.matchQuality}
                </span>
              </div>
              <p className="mt-1">
                {item.grader && item.grade ? `${item.grader} ${item.grade}` : "Raw"}
                {item.exclusionReason ? ` — ${item.exclusionReason}` : ""}
              </p>
              {item.externalUrl ? (
                <a
                  className="mt-1 inline-block text-accent"
                  href={item.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  View source
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
function StaffMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="mt-1 font-semibold capitalize">{value}</dd>
    </div>
  );
}
function marketAmount(amount: string | undefined, currency: string | undefined) {
  return amount && currency
    ? new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(Number(amount) / 100)
    : "Not available";
}
function marketRange(range: {
  lowMinor?: string;
  highMinor?: string;
  medianMinor?: string;
  currency?: string;
}) {
  return range.lowMinor && range.highMinor
    ? `${marketAmount(range.lowMinor, range.currency)} – ${marketAmount(range.highMinor, range.currency)}`
    : marketAmount(range.medianMinor, range.currency);
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
