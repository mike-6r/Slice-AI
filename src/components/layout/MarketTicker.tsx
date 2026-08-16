import { Link, useRouterState } from "@tanstack/react-router";
import { HOMEPAGE_MARKET_TICKER } from "@/data/homepage-showcase";
import { useTrendingAssets } from "@/queries/hooks";
import { formatPercent } from "@/lib/format";
import { useCurrency } from "@/currency/CurrencyProvider";
import { isBetaEnvironment } from "@/config/environment";

/** Published market snapshots; it never substitutes the legacy sample tape in API mode. */
export function MarketTicker() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (pathname === "/" && !isBetaEnvironment) {
    return <HomepageShowcaseTicker />;
  }

  return <AuthoritativeMarketTicker />;
}

function HomepageShowcaseTicker() {
  return (
    <div className="hidden border-b border-border bg-surface/60 lg:block">
      <div className="site-shell flex h-6 items-center gap-5 text-[8px] font-medium tabular">
        <span className="shrink-0 uppercase tracking-[0.18em] text-muted">Market snapshot</span>
        <ul
          className="flex items-center gap-5 overflow-hidden"
          aria-label="Illustrative market tape"
        >
          {HOMEPAGE_MARKET_TICKER.map((item) => (
            <li key={item.symbol} className="flex shrink-0 items-center gap-2">
              <span className="text-subtle">{item.symbol}</span>
              <span className="text-foreground">{item.value}</span>
              <span className={item.tone === "positive" ? "text-positive" : "text-negative"}>
                {item.movement}
              </span>
            </li>
          ))}
        </ul>
        <span className="ml-auto flex shrink-0 items-center gap-3 text-subtle">
          <span className="market-tape__dot" aria-hidden="true" />
          Showcase data
        </span>
      </div>
    </div>
  );
}

function AuthoritativeMarketTicker() {
  const market = useTrendingAssets();
  const { formatMoney } = useCurrency();
  const assets = market.data ?? [];
  if (!market.isLoading && !market.isError && assets.length === 0) return null;
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
                      ? formatMoney(
                          asset.market.estimatedMarketValue.amount,
                          asset.market.estimatedMarketValue.currency,
                        )
                      : "Unavailable"}
                  </span>
                  {asset.market?.hasTradingHistory && asset.market.change24hBps !== undefined && (
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
