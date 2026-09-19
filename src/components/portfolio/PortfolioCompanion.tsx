import { Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, ChevronDown, Layers3, ShoppingCart, Wallet } from "lucide-react";
import type { PortfolioSummary } from "@/domain";
import type { PreSaleReservationView } from "@/data/repositories";
import { formatPortfolioMoney, portfolioAccountValue } from "@/routes/-portfolio-presentation";

export function PortfolioBalanceGuide({
  summary,
  reservations,
}: {
  summary?: PortfolioSummary;
  reservations: PreSaleReservationView[];
}) {
  const total = summary ? portfolioAccountValue(summary) : null;
  const reserved = reservations.reduce((sum, item) => sum + BigInt(item.grossMinor), 0n);
  return (
    <details className="portfolio-balance-guide">
      <summary>
        <span>
          <Wallet aria-hidden="true" /> Understand your account value
        </span>
        <span>
          Cash, holdings & reservations <ChevronDown aria-hidden="true" />
        </span>
      </summary>
      <div className="portfolio-balance-guide__body">
        <dl className="portfolio-equation">
          <div>
            <dt>01 / Wallet cash</dt>
            <dd>{summary ? formatPortfolioMoney(summary.cash.totalMinor) : "Unavailable"}</dd>
            <small>Includes available and reserved cash.</small>
          </div>
          <div>
            <dt>02 / Owned collectibles</dt>
            <dd>
              {summary?.estimatedHoldingsValueMinor != null
                ? formatPortfolioMoney(summary.estimatedHoldingsValueMinor)
                : "Unavailable"}
            </dd>
            <small>The estimated value of your settled Slices.</small>
          </div>
          <div>
            <dt>Total account value</dt>
            <dd>{total !== null ? formatPortfolioMoney(total) : "Unavailable"}</dd>
            <small>Reserved cash is already included, not added twice.</small>
          </div>
        </dl>
        <p>
          {reservations.length > 0
            ? `${reservations.length} active pre-sale ${reservations.length === 1 ? "reservation" : "reservations"} · ${formatPortfolioMoney(reserved.toString())} committed. `
            : "Pre-sale reservations are conditional, not settled ownership. "}
          Reservation commitments are shown separately from owned collectibles and are not added
          again to the account total.
        </p>
        <p>
          Values are estimates, not guaranteed sale proceeds. Individual holding marks can have
          different dates. Pending funding and withdrawal eligibility are explained in your{" "}
          <Link to="/wallet">
            Wallet <ArrowRight aria-hidden="true" />
          </Link>
          .
        </p>
      </div>
    </details>
  );
}

const explanations = [
  {
    title: "What do my Slices represent?",
    body: "Your settled Slices record your fractional position in a collectible. Ownership percentage compares your Slices with the asset’s total Slices. A pre-sale reservation is a conditional commitment; it is not settled ownership yet.",
  },
  {
    title: "Account value vs. unrealised return",
    body: "Account value combines wallet cash with the estimated value of owned collectibles. Unrealised return compares the current marked value of those holdings with their recorded cost. Deposits are not gains, withdrawals are not losses, and a mark is not a guaranteed selling price.",
  },
  {
    title: "Why is some cash or ownership reserved?",
    body: "An open buy order or pending withdrawal can reserve cash. An open sell order can reserve Slices. Reserved amounts are not available for another action at the same time. Inspect Orders for the current state; Wallet explains cash and payout eligibility.",
  },
  {
    title: "Why can the chart differ from today’s total?",
    body: "The chart uses saved, dated snapshots. The account summary uses the latest available account data, so the two may differ. The adjusted change removes external cash flows between snapshots. Missing marks, cost data, or history are shown as unavailable rather than estimated here.",
  },
];

export function PortfolioCompanion() {
  return (
    <section className="portfolio-companion" aria-labelledby="portfolio-companion-heading">
      <div className="portfolio-companion__intro">
        <p className="portfolio-companion__eyebrow">
          <BookOpen aria-hidden="true" /> The bigger picture
        </p>
        <h2 id="portfolio-companion-heading">
          Know what you own.
          <br />
          <span>Understand every move.</span>
        </h2>
        <p>
          A little context goes a long way. Get familiar with the numbers, then use the right place
          to take action.
        </p>
        <div className="portfolio-companion__links">
          <Link to="/portfolio" search={{ tab: "holdings" }}>
            <Layers3 aria-hidden="true" />
            <span>
              <strong>Inspect your collection</strong>
              <small>Ownership, cost and marked value</small>
            </span>
            <ArrowRight aria-hidden="true" />
          </Link>
          <Link to="/portfolio" search={{ tab: "orders" }}>
            <ShoppingCart aria-hidden="true" />
            <span>
              <strong>Manage your orders</strong>
              <small>Fills, reserved Slices and cancellations</small>
            </span>
            <ArrowRight aria-hidden="true" />
          </Link>
          <Link to="/wallet">
            <Wallet aria-hidden="true" />
            <span>
              <strong>Manage your cash</strong>
              <small>Funding, withdrawals and payment status</small>
            </span>
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </div>
      <div className="portfolio-companion__questions">
        {explanations.map(({ title, body }, index) => (
          <details key={title}>
            <summary>
              <span className="portfolio-companion__number">0{index + 1}</span>
              <span>{title}</span>
              <ChevronDown aria-hidden="true" />
            </summary>
            <p>{body}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
