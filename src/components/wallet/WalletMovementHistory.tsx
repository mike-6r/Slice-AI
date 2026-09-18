import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { useState } from "react";
import type { WalletMovementQuery, WalletMovementStatus, WalletMovementView } from "@/domain";
import { useAppServices } from "@/providers/AppServicesProvider";
import { queryKeys } from "@/queries/keys";
import { formatWalletMoney } from "@/routes/-wallet-presentation";
import {
  movementHistoryQuery,
  movementPageCsv,
  movementStatusLabel,
  type MovementHistoryFilters,
} from "./wallet-history";

const emptyFilters: MovementHistoryFilters = {
  type: "ALL",
  status: "ALL",
  search: "",
  from: "",
  to: "",
};

export function WalletMovementHistory({
  demoFundingCount,
  onSelect,
}: {
  demoFundingCount: number;
  onSelect: (item: WalletMovementView) => void;
}) {
  const services = useAppServices();
  const [filters, setFilters] = useState(emptyFilters);
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const [showDates, setShowDates] = useState(false);
  const page = cursors.length;
  const invalidDates = Boolean(filters.from && filters.to && filters.from > filters.to);
  const input: WalletMovementQuery = movementHistoryQuery(filters, pageSize, cursors.at(-1));
  const query = useQuery({
    queryKey: queryKeys.providers.movementHistory(input),
    queryFn: () => services.providers.movements(input),
    enabled: !invalidDates,
  });
  const items = query.data?.items ?? [];
  const filtered = Object.values(filters).some((value) => value && value !== "ALL");
  const update = (patch: Partial<MovementHistoryFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setCursors([undefined]);
  };
  const clear = () => {
    setFilters(emptyFilters);
    setSearch("");
    setCursors([undefined]);
  };
  const exportPage = () => {
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", movementPageCsv(items)], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `slice-wallet-page-${page}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section
      className="wallet-panel wallet-panel--movements"
      id="wallet-history"
      aria-labelledby="wallet-history-title"
    >
      <div className="wallet-history-heading">
        <div>
          <p className="wallet-eyebrow">YOUR ACTIVITY</p>
          <h2 id="wallet-history-title">Movement history</h2>
          <p>Every deposit and withdrawal, with a clear record of what happened.</p>
        </div>
        <button
          className="wallet-secondary-button"
          type="button"
          onClick={exportPage}
          disabled={!items.length || query.isFetching || query.isError || invalidDates}
        >
          <Download aria-hidden="true" /> Export page
        </button>
      </div>
      <div className="wallet-history-toolbar">
        <div
          className="wallet-movement-filters"
          role="group"
          aria-label="Wallet movement categories"
        >
          {(["ALL", "DEPOSIT", "WITHDRAWAL"] as const).map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={filters.type === type}
              className={filters.type === type ? "is-active" : ""}
              onClick={() => update({ type })}
            >
              {type === "ALL" ? "All movements" : type === "DEPOSIT" ? "Deposits" : "Withdrawals"}
            </button>
          ))}
        </div>
        <form
          className="wallet-history-search"
          onSubmit={(event) => {
            event.preventDefault();
            update({ search: search.trim() });
          }}
        >
          <Search aria-hidden="true" />
          <input
            aria-label="Search movement history"
            placeholder="Search reference or bank…"
            value={search}
            maxLength={100}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button type="submit" aria-label="Search all movements">
            <ArrowRight aria-hidden="true" />
          </button>
        </form>
        <label className="wallet-history-status">
          <span className="sr-only">Movement status</span>
          <select
            aria-label="Movement status"
            value={filters.status}
            onChange={(event) =>
              update({ status: event.target.value as WalletMovementStatus | "ALL" })
            }
          >
            <option value="ALL">All statuses</option>
            {(
              [
                "CREATED",
                "PENDING_PROVIDER",
                "PROCESSING",
                "SETTLED",
                "HELD",
                "MANUAL_REVIEW",
                "FAILED",
                "CANCELLED",
                "RETURNED",
                "REVERSED",
              ] as const
            ).map((status) => (
              <option key={status} value={status}>
                {movementStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <button
          className="wallet-secondary-button"
          type="button"
          aria-expanded={showDates}
          aria-controls="wallet-date-filters"
          onClick={() => setShowDates(!showDates)}
        >
          <SlidersHorizontal aria-hidden="true" /> Dates
        </button>
      </div>
      {showDates && (
        <div className="wallet-date-filters" id="wallet-date-filters">
          <label>
            From (UTC)
            <input
              type="date"
              value={filters.from}
              onChange={(event) => update({ from: event.target.value })}
            />
          </label>
          <label>
            To (UTC)
            <input
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(event) => update({ to: event.target.value })}
            />
          </label>
          <p>Search and filters cover your full movement history.</p>
        </div>
      )}
      {filtered && (
        <div className="wallet-active-filters">
          <span>
            {filters.search ? `Search: “${filters.search}” · ` : ""}
            {filters.from || filters.to
              ? `${filters.from || "Beginning"} → ${filters.to || "Today"} · `
              : ""}
            Filters applied
          </span>
          <button type="button" onClick={clear}>
            <RotateCcw aria-hidden="true" /> Clear filters
          </button>
        </div>
      )}
      <div className="wallet-history-results" aria-busy={query.isFetching}>
        {invalidDates ? (
          <div className="wallet-history-message" role="alert">
            The end date must be on or after the start date.
          </div>
        ) : query.isError ? (
          <div className="wallet-history-message" role="alert">
            <strong>Unable to load money movements.</strong>
            <p>Your balances and payment controls are unaffected.</p>
            <button
              type="button"
              className="wallet-secondary-button"
              onClick={() => void query.refetch()}
            >
              Try again
            </button>
          </div>
        ) : query.isLoading ? (
          <div className="wallet-history-message" role="status">
            Loading your movements…
          </div>
        ) : items.length ? (
          <div
            className="wallet-ledger-scroll"
            tabIndex={0}
            aria-label="Movement history table; scroll for more columns"
          >
            <table className="wallet-ledger-table">
              <caption className="sr-only">
                Deposits and withdrawals, newest first. Open a movement for fees and settlement
                updates.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Movement</th>
                  <th scope="col">Source / destination</th>
                  <th scope="col">Date</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="wallet-ledger-amount">
                    Amount
                  </th>
                  <th scope="col">
                    <span className="sr-only">Details</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="wallet-ledger-identity">
                        <span className={`wallet-movement-icon is-${item.type.toLowerCase()}`}>
                          {item.type === "DEPOSIT" ? (
                            <ArrowDownToLine aria-hidden="true" />
                          ) : (
                            <ArrowUpFromLine aria-hidden="true" />
                          )}
                        </span>
                        <div>
                          <strong>{item.type === "DEPOSIT" ? "Deposit" : "Withdrawal"}</strong>
                          <small>
                            {item.reference ?? `WLT-${item.id.slice(0, 8).toUpperCase()}`}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>{item.sourceLabel ?? "GBP wallet"}</td>
                    <td>
                      <time dateTime={item.createdAt}>
                        {new Date(item.createdAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          timeZone: "UTC",
                        })}
                      </time>
                    </td>
                    <td>
                      <span
                        className={`wallet-status ${item.status === "SETTLED" ? "is-good" : ["FAILED", "RETURNED", "REVERSED"].includes(item.status) ? "is-failed" : "is-attention"}`}
                      >
                        {movementStatusLabel(item.status)}
                      </span>
                    </td>
                    <td
                      className={`wallet-ledger-amount ${item.type === "DEPOSIT" ? "is-credit" : "is-debit"}`}
                    >
                      {item.type === "DEPOSIT" ? "+" : "−"}
                      {formatWalletMoney(item.amountMinor)}
                    </td>
                    <td>
                      <button
                        className="wallet-ledger-open"
                        type="button"
                        onClick={() => onSelect(item)}
                        aria-label={`View ${item.type.toLowerCase()} ${item.reference ?? `WLT-${item.id.slice(0, 8).toUpperCase()}`}`}
                      >
                        Details <ArrowRight aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="wallet-history-message">
            <Search aria-hidden="true" />
            <strong>
              {filtered
                ? "No matching movements"
                : page > 1
                  ? "No more movements"
                  : "No provider movements yet"}
            </strong>
            <p>
              {filtered
                ? "Try another reference, status, or date range."
                : demoFundingCount
                  ? `No bank or card deposits or withdrawals have been made. ${demoFundingCount} internal demo funding ${demoFundingCount === 1 ? "credit is" : "credits are"} shown in Portfolio activity.`
                  : "Your bank and card deposits and withdrawals will appear here."}
            </p>
            {filtered ? (
              <button className="wallet-secondary-button" type="button" onClick={clear}>
                Clear filters
              </button>
            ) : (
              <Link to={demoFundingCount ? "/portfolio" : "/how-it-works"}>
                {demoFundingCount ? "View portfolio activity" : "Learn how it works"}{" "}
                <ArrowRight aria-hidden="true" />
              </Link>
            )}
          </div>
        )}
      </div>
      <footer className="wallet-pagination">
        <p role="status" aria-live="polite">
          {query.isFetching
            ? "Updating history…"
            : query.isError || invalidDates
              ? "History unavailable"
              : items.length
                ? `Showing ${(page - 1) * pageSize + 1}–${(page - 1) * pageSize + items.length} · newest first`
                : "0 movements"}
        </p>
        <label>
          Rows per page{" "}
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setCursors([undefined]);
            }}
          >
            {[10, 25, 50].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <nav aria-label="Movement history pages">
          <button
            type="button"
            aria-label="Previous page"
            disabled={page === 1 || query.isFetching}
            onClick={() => setCursors((current) => current.slice(0, -1))}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <span aria-current="page">Page {page}</span>
          <button
            type="button"
            aria-label="Next page"
            disabled={!query.data?.nextCursor || query.isFetching || query.isError || invalidDates}
            onClick={() => {
              if (query.data?.nextCursor)
                setCursors((current) => [...current, query.data.nextCursor!]);
            }}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </nav>
      </footer>
      <p className="wallet-history-footnote">
        Amounts follow your display currency. CSV exports this page in original GBP. Trades and
        holdings are in{" "}
        <Link to="/portfolio">
          Portfolio activity <ArrowRight aria-hidden="true" />
        </Link>
        .
      </p>
    </section>
  );
}
