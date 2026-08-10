import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ApiError } from "@/api/http-client";
import type {
  TradingOrderInput,
  TradingOrderPreview,
  TradingOrderSide,
  TradingOrderView,
} from "@/domain";
import { useAppServices } from "@/providers/AppServicesProvider";
import { queryKeys } from "@/queries/keys";
import { CapabilityRequiredDialog } from "@/components/account/CapabilityRequiredDialog";
import type { AccountCapability } from "@/domain";

type Stage = "configure" | "review" | "result";

const formatMinor = (value: string) => {
  const amount = BigInt(value);
  const absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? "-" : ""}£${(absolute / 100n).toLocaleString("en-GB")}.${(absolute % 100n).toString().padStart(2, "0")}`;
};

/** Converts a user-entered GBP decimal to the backend's GBP minor-unit wire string. */
const gbpInputToMinor = (value: string) => {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  return (BigInt(match[1]!) * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0")).toString();
};
const validUnits = (value: string) => /^(0|[1-9]\d*)$/.test(value.trim()) && BigInt(value) > 0n;
const messageFor = (error: unknown) => {
  if (error instanceof ApiError) {
    if (error.code === "INSUFFICIENT_FUNDS")
      return "You do not have enough available cash for this order.";
    if (error.code === "INSUFFICIENT_UNITS")
      return "You do not have enough available units for this order.";
    if (error.code === "COMPLIANCE_REQUIRED") return "Trading is unavailable for this account.";
    return error.message;
  }
  return "The order could not be completed. Please retry.";
};

export function TradingOrderForm({
  assetSlug,
  side,
}: {
  assetSlug: string;
  side: TradingOrderSide;
}) {
  const services = useAppServices();
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<Stage>("configure");
  const [units, setUnits] = useState("");
  const [price, setPrice] = useState("");
  const [timeInForce, setTimeInForce] = useState<"GTC" | "IOC">("GTC");
  const [preview, setPreview] = useState<TradingOrderPreview | null>(null);
  const [result, setResult] = useState<TradingOrderView | null>(null);
  const [capabilityDialog, setCapabilityDialog] = useState<AccountCapability | null>(null);
  const capabilities = useQuery({
    queryKey: queryKeys.account.capabilities,
    queryFn: services.account.capabilities,
  });
  const asset = useQuery({
    queryKey: queryKeys.assets.detail(assetSlug),
    queryFn: () => services.assets.get(assetSlug as never),
  });
  const input = (): TradingOrderInput | null => {
    const limitPriceMinor = gbpInputToMinor(price);
    if (!asset.data || !limitPriceMinor || !validUnits(units)) return null;
    return {
      assetId: asset.data.id,
      side,
      type: "LIMIT",
      timeInForce,
      units: units.trim(),
      limitPriceMinor,
    };
  };
  const previewOrder = useMutation({
    mutationFn: services.trading.previewOrder,
    onSuccess: (value) => {
      setPreview(value);
      setStage("review");
    },
  });
  const place = useMutation({
    mutationFn: services.trading.placeOrder,
    onSuccess: (value) => {
      setResult(value);
      setStage("result");
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.summary }),
        queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.holdings }),
        queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.transactions() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.trading.orders }),
        queryClient.invalidateQueries({ queryKey: queryKeys.market.orderBook(assetSlug) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.market.recentTrades(assetSlug) }),
      ]);
    },
  });
  if (asset.isLoading)
    return <PageCard title="Loading asset" body="Loading the published trading asset." />;
  if (asset.isError || !asset.data)
    return <PageCard title="Asset unavailable" body="This asset is not available for trading." />;
  const orderInput = input();
  const action = side === "BUY" ? "Buy" : "Sell";
  const capability = capabilities.data?.capabilities.find(
    (item) => item.capability === (side === "BUY" ? "PLACE_BUY_ORDER" : "PLACE_SELL_ORDER"),
  );
  const submit = () => {
    if (!orderInput) return;
    if (capability && !capability.allowed) {
      setCapabilityDialog(capability);
      return;
    }
    place.mutate(orderInput);
  };
  if (stage === "result" && result) {
    return (
      <PageCard
        title={`${action} order ${formatStatus(result.status)}`}
        body="This status is returned by the trading authority."
      >
        <dl className="mt-5 grid grid-cols-2 gap-px border border-border bg-border text-sm">
          <Cell label="Units" value={result.originalUnits} />
          <Cell label="Filled" value={result.filledUnits} />
          <Cell label="Remaining" value={result.remainingUnits} />
          <Cell label="Limit price" value={formatMinor(result.limitPriceMinor)} />
        </dl>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/portfolio"
            className="bg-accent px-5 py-2 text-sm font-semibold text-background"
          >
            View portfolio
          </Link>
          <Link
            to="/asset/$id"
            params={{ id: assetSlug }}
            className="border border-border px-5 py-2 text-sm font-semibold"
          >
            Back to asset
          </Link>
        </div>
      </PageCard>
    );
  }
  return (
    <div className="page-shell max-w-2xl py-10 sm:py-12">
      <Link
        to="/asset/$id"
        params={{ id: assetSlug }}
        className="font-mono text-[10px] uppercase tracking-widest text-muted hover:text-foreground"
      >
        ← Back to {asset.data.symbol}
      </Link>
      <h1 className="mt-4 font-display text-4xl font-bold">Place a {action.toLowerCase()} order</h1>
      <p className="mt-2 text-sm text-subtle">
        {asset.data.details.title} · Limit orders only. Availability, fees, reservations and fills
        are confirmed by Slice.
      </p>
      {stage === "configure" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (orderInput) previewOrder.mutate(orderInput);
          }}
          className="mt-7 space-y-5 rounded-2xl border border-border bg-surface/30 p-5 sm:p-6"
        >
          <label className="block text-sm font-semibold">
            Units
            <input
              value={units}
              onChange={(event) => setUnits(event.target.value)}
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Smallest ownership units"
              className="form-control text-lg"
            />
          </label>
          <label className="block text-sm font-semibold">
            Limit price per unit (GBP)
            <input
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="form-control text-lg"
            />
          </label>
          <fieldset>
            <legend className="text-sm font-semibold">Time in force</legend>
            <div className="mt-2 flex gap-2">
              {(["GTC", "IOC"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTimeInForce(value)}
                  className={
                    timeInForce === value
                      ? "border border-accent bg-accent px-4 py-2 text-sm font-semibold text-background"
                      : "border border-border px-4 py-2 text-sm font-semibold"
                  }
                >
                  {value}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              GTC remains open until filled or cancelled. IOC cancels any unmatched remainder.
            </p>
          </fieldset>
          {previewOrder.isError && (
            <p role="alert" className="text-sm text-danger">
              {messageFor(previewOrder.error)}
            </p>
          )}
          <button
            disabled={!orderInput || previewOrder.isPending}
            className="w-full bg-accent px-6 py-3 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-40"
          >
            {previewOrder.isPending ? "Checking order…" : `Review ${action.toLowerCase()} order`}
          </button>
        </form>
      ) : (
        <section className="mt-7 space-y-5 rounded-2xl border border-border bg-surface/30 p-5 sm:p-6">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-accent">Review</p>
            <h2 className="mt-1 font-display text-2xl font-bold">
              Confirm your {action.toLowerCase()} order
            </h2>
          </div>
          {preview && (
            <dl className="grid grid-cols-2 gap-px border border-border bg-border text-sm">
              <Cell label="Units" value={preview.units} />
              <Cell label="Limit price" value={formatMinor(preview.limitPriceMinor)} />
              <Cell label="Order value" value={formatMinor(preview.grossMinor)} />
              <Cell label="Policy fee" value={formatMinor(preview.feeMinor)} />
              {side === "BUY" && (
                <Cell
                  label="Cash reservation"
                  value={
                    preview.reservationMinor ? formatMinor(preview.reservationMinor) : "Unavailable"
                  }
                />
              )}
              {side === "SELL" && (
                <Cell label="Unit reservation" value={preview.reservationUnits ?? "Unavailable"} />
              )}
            </dl>
          )}
          <p className="text-xs text-subtle">
            Fees are policy previews; final financial effects remain subject to backend matching and
            settlement.
          </p>
          {place.isError && (
            <p role="alert" className="text-sm text-danger">
              {messageFor(place.error)}
            </p>
          )}
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              disabled={!orderInput || place.isPending}
              onClick={submit}
              className="primary-action flex-1 px-6 py-3 text-sm font-semibold text-background disabled:opacity-40"
            >
              {place.isPending ? "Submitting…" : `Submit ${action.toLowerCase()} order`}
            </button>
            <button
              type="button"
              onClick={() => setStage("configure")}
              className="border border-border px-5 py-3 text-sm font-semibold"
            >
              Back
            </button>
          </div>
        </section>
      )}
      <CapabilityRequiredDialog
        decision={capabilityDialog}
        onClose={() => setCapabilityDialog(null)}
      />
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background p-3">
      <dt className="font-mono text-[10px] uppercase text-muted">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}
function formatStatus(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}
function PageCard({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-shell max-w-2xl py-12 sm:py-16">
      <section className="rounded-2xl border border-border bg-surface/30 p-6 sm:p-8">
        <p className="font-mono text-[10px] uppercase tracking-widest text-accent">Trading</p>
        <h1 className="mt-2 font-display text-3xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-subtle">{body}</p>
        {children}
      </section>
    </div>
  );
}
