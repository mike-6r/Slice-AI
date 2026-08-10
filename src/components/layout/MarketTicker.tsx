import { Link } from "@tanstack/react-router";
import { useTrendingAssets } from "@/queries/hooks";
import { formatCurrency, formatPercent } from "@/lib/format";

/** Published market snapshots; it never substitutes the legacy sample tape in API mode. */
export function MarketTicker() {
  const market = useTrendingAssets();
  const assets = market.data ?? [];
  return (
    <div className="hidden border-b border-border bg-surface/60 lg:block">
      <div className="site-shell flex h-6 items-center gap-5 text-[8px] font-medium tabular">
        <span className="shrink-0 uppercase tracking-[0.18em] text-muted">Market snapshot</span>
        {market.isLoading ? (
          <span className="text-muted">Loading published market data…</span>
        ) : market.isError ? (
          <span className="text-muted">Market data unavailable</span>
        ) : assets.length ? (
          <ul className="flex items-center gap-5 overflow-hidden">
            {assets.slice(0, 5).map((asset) => (
              <li key={asset.id} className="shrink-0">
                <Link
                  to="/asset/$id"
                  params={{ id: asset.slug ?? asset.id }}
                  className="market-tape__item flex items-center gap-2 rounded-sm"
                >
                  <span className="text-subtle">{asset.symbol}</span>
                  <span className="text-foreground">
                    {asset.market?.estimatedMarketValue
                      ? formatCurrency(asset.market.estimatedMarketValue.amount)
                      : "Unavailable"}
                  </span>
                  {asset.market?.change24hBps !== undefined && (
                    <span
                      className={asset.market.change24hBps >= 0 ? "text-positive" : "text-negative"}
                    >
                      {formatPercent(asset.market.change24hBps / 100)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-muted">No published market data yet</span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-3 text-subtle">
          <span className="market-tape__dot" aria-hidden="true" />
          {assets.some((asset) => asset.market?.dataStatus === "LIVE")
            ? "Live source available"
            : "Estimated market data"}
        </span>
      </div>
    </div>
  );
}
