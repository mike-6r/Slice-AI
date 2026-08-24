import { Link } from "@tanstack/react-router";
import type { MarketSnapshot, MarketSnapshotItem } from "@/domain";
import { formatRelativeTime } from "@/lib/finance";
import { formatPercent } from "@/lib/format";
import { useCurrency } from "@/currency/CurrencyProvider";
import { useMarketSnapshot } from "@/queries/hooks";

/**
 * A compact window into the same persisted market projections used by the
 * asset page and marketplace. It never falls back to editorial showcase data.
 */
export function MarketTicker() {
  const market = useMarketSnapshot();
  const snapshot = market.data;
  const items = snapshot?.items ?? [];
  const status = market.isError ? "DELAYED" : snapshot?.status ?? "UNAVAILABLE";

  return (
    <div className="market-tape border-b border-border bg-surface/60">
      <div className="site-shell market-tape__shell text-[8px] font-medium tabular">
        <span className="market-tape__label shrink-0 uppercase tracking-[0.18em] text-muted">
          Market snapshot
        </span>
        <div className="market-tape__rail" aria-live="polite">
          {market.isLoading && !snapshot ? (
            <span className="market-tape__loading text-muted">Loading market data…</span>
          ) : items.length ? (
            <ul className="market-tape__items" aria-label="Live market snapshot">
              {items.map((item) => (
                <SnapshotItem key={item.assetId} item={item} />
              ))}
            </ul>
          ) : market.isError ? (
            <span className="text-muted">Market data delayed</span>
          ) : (
            <span className="text-muted">No published market data yet</span>
          )}
        </div>
        <SnapshotFreshness status={status} lastUpdatedAt={snapshot?.lastUpdatedAt ?? null} />
      </div>
    </div>
  );
}

function SnapshotItem({ item }: { item: MarketSnapshotItem }) {
  const { formatMoney } = useCurrency();
  const slicePrice = item.sliceMarketPrice;
  const reference = item.externalReference;
  const movement = reference?.movement24hBps;
  const priceLabel = slicePrice
    ? `${formatMoney(slicePrice.amount.amount, slicePrice.amount.currency)} / Slice`
    : null;
  const priceKind = slicePrice
    ? slicePrice.kind === "INITIAL_OFFERING"
      ? "Initial offering"
      : "Last trade"
    : null;
  const referenceLabel = reference
    ? `${reference.source === "PRICECHARTING" ? "PC" : reference.source} ${formatMoney(reference.amount.amount, reference.amount.currency)}`
    : null;
  const label = [
    item.title,
    priceLabel && priceKind ? `${priceLabel}, ${priceKind}` : priceLabel,
    referenceLabel,
    movement === null || movement === undefined ? null : `${formatPercent(movement / 100)} 24h`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="market-tape__asset shrink-0">
      <Link
        to="/asset/$id"
        params={{ id: item.slug }}
        className="market-tape__item flex min-w-0 items-center gap-2 rounded-sm"
        aria-label={label}
        title={label}
      >
        <span className="market-tape__title text-subtle">{item.title}</span>
        {priceLabel ? (
          <span className="market-tape__slice-price text-foreground">
            {priceLabel}
            <span className="market-tape__price-kind text-muted">{priceKind}</span>
          </span>
        ) : null}
        {reference ? (
          <span
            className="market-tape__reference text-subtle"
            title={`${reference.source} external reference in ${reference.amount.currency}`}
          >
            {referenceLabel}
          </span>
        ) : null}
        {movement !== null && movement !== undefined ? (
          <span className={movement >= 0 ? "text-positive" : "text-negative"}>
            {formatPercent(movement / 100)} <span className="text-muted">24h</span>
          </span>
        ) : null}
      </Link>
    </li>
  );
}

function SnapshotFreshness({
  status,
  lastUpdatedAt,
}: {
  status: MarketSnapshot["status"];
  lastUpdatedAt: string | null;
}) {
  const statusLabel =
    status === "CURRENT"
      ? "Market data current"
      : status === "UNAVAILABLE"
        ? "Market data unavailable"
        : lastUpdatedAt
          ? `Last updated ${formatRelativeTime(lastUpdatedAt)}`
          : "Market data delayed";
  const statusTone = status === "CURRENT" ? "is-current" : "is-delayed";
  return (
    <span className={`market-tape__status ${statusTone} ml-auto shrink-0 text-subtle`}>
      <span className="market-tape__dot" aria-hidden="true" />
      {statusLabel}
    </span>
  );
}
