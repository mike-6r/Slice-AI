import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ApiError } from "@/api/http-client";
import { useSession } from "@/auth/use-session";
import { useAppServices } from "@/providers/AppServicesProvider";
import { useCurrency } from "@/currency/CurrencyProvider";

export const Route = createFileRoute("/sell-proposal/$id")({
  head: () => ({ meta: [{ title: "Sale proposal | Slice" }] }),
  component: SaleProposalPage,
});

function formatGbpMinor(value: string) {
  const amount = BigInt(value);
  return `£${(amount / 100n).toLocaleString("en-GB")}.${(amount % 100n).toString().padStart(2, "0")}`;
}

function SaleProposalPage() {
  useCurrency();
  const { id } = Route.useParams();
  const services = useAppServices();
  const session = useSession();
  const queryClient = useQueryClient();
  const proposal = useQuery({
    queryKey: ["sale-proposal", id],
    queryFn: () => services.repositories.proposals.getSaleProposal(id),
    enabled: session.isAuthenticated,
  });
  const vote = useMutation({
    mutationFn: (choice: "APPROVE" | "REJECT") => services.repositories.proposals.vote(id, choice),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["sale-proposal", id] }),
  });
  const authRequired =
    !session.isAuthenticated ||
    (proposal.error instanceof ApiError && proposal.error.status === 401);
  if (authRequired)
    return (
      <State
        title="Sign in to view this proposal"
        detail="Sale proposals and voting eligibility are private to your authenticated account."
        login
      />
    );
  if (proposal.isLoading)
    return <State title="Loading proposal" detail="Loading its authoritative governance state." />;
  if (proposal.isError)
    return (
      <State
        title="Proposal unavailable"
        detail="The proposal could not be loaded safely."
        retry={() => void proposal.refetch()}
      />
    );
  if (!proposal.data)
    return <State title="Proposal not found" detail="This proposal is unavailable." />;
  const item = proposal.data;
  const votingOpen = item.status === "OPEN" && item.votingEnabled;
  const voteLabel = item.ownVote ? "Replace vote" : "Cast vote";
  return (
    <main className="page-shell space-y-7 py-10">
      <header>
        <p className="page-kicker">Sale proposal</p>
        <h1 className="page-title mt-3">Governance proposal</h1>
        <p className="mt-3 max-w-2xl text-subtle">
          This is the current backend-authoritative proposal and weighted-vote tally. No asset
          appreciation, counterparty, performance fee, or sale result is inferred here.
        </p>
      </header>
      <section className="grid gap-4 rounded-2xl border border-border bg-elevated p-6 md:grid-cols-3">
        <Metric label="Status" value={item.status.replaceAll("_", " ")} />
        <Metric label="Proposed gross amount" value={formatGbpMinor(item.offerMinor)} />
        <Metric
          label="Voting closes"
          value={item.closesAt ? new Date(item.closesAt).toLocaleString() : "Not scheduled"}
        />
      </section>
      <section className="rounded-2xl border border-border bg-elevated p-6">
        <h2 className="text-xl font-semibold">Current tally</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <Metric label="Eligible units" value={item.eligibleUnits} />
          <Metric label="Approve units" value={item.approveUnits} />
          <Metric label="Reject units" value={item.rejectUnits} />
        </dl>
      </section>
      <section className="rounded-2xl border border-border bg-elevated p-6">
        <h2 className="text-xl font-semibold">Your vote</h2>
        {item.ownVote ? (
          <p className="mt-2 text-subtle">
            Your current vote is {item.ownVote.toLowerCase()}. You may replace it while the voting
            window remains open; the backend keeps one current vote for your immutable snapshot.
          </p>
        ) : null}
        {!item.votingEnabled ? (
          <p className="mt-2 text-subtle">
            Weighted voting is unavailable until the required legal governance gate is enabled.
          </p>
        ) : null}
        {votingOpen ? (
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              aria-label={`${voteLabel}: approve`}
              disabled={vote.isPending}
              onClick={() => vote.mutate("APPROVE")}
              className="button-primary"
            >
              {item.ownVote === "APPROVE" ? "Keep approval" : "Approve"}
            </button>
            <button
              type="button"
              aria-label={`${voteLabel}: reject`}
              disabled={vote.isPending}
              onClick={() => vote.mutate("REJECT")}
              className="button-secondary"
            >
              {item.ownVote === "REJECT" ? "Keep rejection" : "Reject"}
            </button>
          </div>
        ) : (
          <p className="mt-2 text-subtle">Voting is not currently open for this proposal.</p>
        )}
        {vote.isSuccess ? (
          <p role="status" className="mt-3 text-sm text-positive">
            Vote recorded. The authoritative proposal state has been refreshed.
          </p>
        ) : null}
        {vote.isError ? (
          <p role="alert" className="mt-3 text-sm text-negative">
            Your vote could not be recorded. No local tally was changed.
          </p>
        ) : null}
      </section>
      <div className="flex flex-wrap gap-4">
        <Link to="/governance" className="inline-block text-sm font-semibold text-accent">
          Back to governance
        </Link>
        <Link to="/marketplace" className="inline-block text-sm font-semibold text-accent">
          Browse published assets
        </Link>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-subtle">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}

function State({
  title,
  detail,
  login,
  retry,
}: {
  title: string;
  detail: string;
  login?: boolean;
  retry?: () => void;
}) {
  return (
    <main className="page-shell py-16">
      <section className="rounded-2xl border border-border bg-elevated p-8 text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-subtle">{detail}</p>
        {login ? (
          <Link to="/login" className="mt-5 inline-block text-sm font-semibold text-accent">
            Sign in
          </Link>
        ) : null}
        {retry ? (
          <button type="button" onClick={retry} className="mt-5 text-sm font-semibold text-accent">
            Retry
          </button>
        ) : null}
      </section>
    </main>
  );
}
