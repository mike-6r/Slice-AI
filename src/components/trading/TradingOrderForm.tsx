import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Banknote,
  BookOpen,
  CheckCircle2,
  Clock3,
  Coins,
  Layers3,
  LockKeyhole,
  Scale,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/api/http-client";
import { CapabilityRequiredDialog } from "@/components/account/CapabilityRequiredDialog";
import { assetShowcaseMedia } from "@/components/marketplace/demo-asset-media";
import { marketCategoryPresentation } from "@/components/marketplace/marketplace-presentation";
import type {
  AccountCapability,
  TradingOrderInput,
  TradingOrderPreview,
  TradingOrderSide,
  TradingOrderView,
} from "@/domain";
import { useAppServices } from "@/providers/AppServicesProvider";
import { queryKeys } from "@/queries/keys";
import { customerTerms } from "@/lib/customer-terminology";
import { formatAvailability, formatPricePerUnit } from "@/lib/market-presentation";
import {
  averageCostMinor,
  bestOrderBookLevel,
  formatGbpMinor,
  gbpInputToMinor,
  minorToGbpInput,
  referenceSharePriceMinor,
} from "./trading-order-presentation";

type Stage = "configure" | "review" | "result";

const messageFor = (error: unknown) => {
  if (error instanceof ApiError) {
    if (error.code === "INSUFFICIENT_FUNDS")
      return "Your available cash does not cover this order and its authoritative fee preview.";
    if (error.code === "INSUFFICIENT_UNITS")
      return "You do not have enough ownership units for this sell order.";
    if (error.code === "COMPLIANCE_REQUIRED")
      return "Complete the required verification step before placing this order.";
    if (error.code === "MARKET_NOT_OPEN") return "This market is not currently accepting orders.";
    return error.message;
  }
  return "The order could not be checked. Please retry.";
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
  const [ownershipPercent, setOwnershipPercent] = useState("1");
  const [inputMode, setInputMode] = useState<"PERCENTAGE" | "AMOUNT">("PERCENTAGE");
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");
  const [priceTouched, setPriceTouched] = useState(false);
  const [timeInForce, setTimeInForce] = useState<"GTC" | "IOC">("GTC");
  const [review, setReview] = useState<TradingOrderPreview | null>(null);
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
  const portfolio = useQuery({
    queryKey: queryKeys.portfolio.summary,
    queryFn: services.portfolio.portfolio,
  });
  const orderBook = useQuery({
    queryKey: queryKeys.market.orderBook(assetSlug),
    queryFn: () => services.market.orderBook(assetSlug as never),
  });
  const issuance = useQuery({
    queryKey: ["ownership", "issuance", assetSlug],
    queryFn: () => services.ownership.publicIssuance(assetSlug),
  });
  const position = useQuery({
    queryKey: ["ownership", "position", assetSlug],
    queryFn: () => services.ownership.ownMarketPosition(assetSlug),
  });

  const holding = portfolio.data?.holdings.find(
    (item) => item.assetId === asset.data?.id || item.slug === assetSlug,
  );
  const bestAsk = bestOrderBookLevel(orderBook.data?.asks, "ASK");
  const bestBid = bestOrderBookLevel(orderBook.data?.bids, "BID");
  const referencePrice = referenceSharePriceMinor(
    asset.data?.market?.estimatedMarketValue
      ? Number(asset.data.market.estimatedMarketValue.amount)
      : undefined,
    issuance.data?.issuedUnits,
  );
  const suggestedPrice =
    side === "BUY"
      ? bestAsk
        ? BigInt(bestAsk.pricePerUnit.amount)
        : referencePrice
      : bestBid
        ? BigInt(bestBid.pricePerUnit.amount)
        : referencePrice;

  useEffect(() => {
    if (!priceTouched && !price && suggestedPrice && suggestedPrice > 0n)
      setPrice(minorToGbpInput(suggestedPrice));
  }, [price, priceTouched, suggestedPrice]);

  const capability = capabilities.data?.capabilities.find(
    (item) => item.capability === (side === "BUY" ? "PLACE_BUY_ORDER" : "PLACE_SELL_ORDER"),
  );
  const availableOwned = BigInt(position.data?.availableUnits ?? holding?.availableUnits ?? "0");
  const reservedOwned = BigInt(position.data?.reservedUnits ?? holding?.reservedUnits ?? "0");
  const settledOwned = BigInt(position.data?.settledUnits ?? holding?.ownedUnits ?? "0");
  const averageCost = averageCostMinor(holding?.costBasisMinor ?? null, holding?.ownedUnits ?? "0");
  const limitPriceMinor = gbpInputToMinor(price);
  const chooseBuyMax = async () => undefined;
  const percentInputIsValid = /^\d{1,3}(?:\.\d{1,4})?$/.test(ownershipPercent);
  const ownershipPreview = useQuery({
    queryKey: [
      "trading",
      "ownership-preview",
      asset.data?.id,
      side,
      ownershipPercent,
      inputMode,
      inputMode === "PERCENTAGE" ? ownershipPercent : amount,
      price,
      timeInForce,
    ],
    queryFn: () =>
      services.trading.previewOwnershipOrder({
        assetId: asset.data!.id,
        side,
        ...(inputMode === "PERCENTAGE"
          ? { desiredOwnershipPercent: ownershipPercent }
          : { desiredAmountMinor: gbpInputToMinor(amount) || undefined }),
        limitPriceMinor:
          limitPriceMinor && BigInt(limitPriceMinor) > 0n ? limitPriceMinor : undefined,
        timeInForce,
      }),
    enabled: Boolean(
      asset.data &&
      (inputMode === "PERCENTAGE" ? percentInputIsValid : Boolean(gbpInputToMinor(amount))) &&
      (!capability || capability.allowed),
    ),
    retry: false,
    staleTime: 0,
  });
  useEffect(() => {
    const preview = ownershipPreview.data;
    if (!preview) return;
    if (inputMode === "AMOUNT") setOwnershipPercent(preview.requestedOwnershipPercent);
    if (inputMode === "PERCENTAGE" && preview.estimatedCostMinor)
      setAmount(minorToGbpInput(BigInt(preview.estimatedCostMinor)));
  }, [inputMode, ownershipPreview.data]);
  const parsedShares = ownershipPreview.data?.requestedSlices
    ? BigInt(ownershipPreview.data.requestedSlices)
    : null;

  const validationError = useMemo(() => {
    if (inputMode === "PERCENTAGE" && !ownershipPercent)
      return "Enter the percentage of the collectible you want to own.";
    if (inputMode === "PERCENTAGE" && !percentInputIsValid)
      return "Enter a valid ownership percentage, such as 5 or 2.5.";
    if (inputMode === "AMOUNT" && !gbpInputToMinor(amount))
      return "Enter the amount you want to invest.";
    if (price && (!limitPriceMinor || BigInt(limitPriceMinor) <= 0n))
      return "Enter a valid GBP price with no more than two decimal places.";
    if (ownershipPreview.data?.requestedSlices === null)
      return "Choose one of the closest available ownership amounts to continue.";
    if (ownershipPreview.data?.maximumExceeded)
      return `Up to ${formatAvailability(ownershipPreview.data.availableOwnershipPercent)} is currently available.`;
    if (ownershipPreview.data?.eligibility === "INELIGIBLE")
      return "Complete the required account checks before placing an order.";
    return null;
  }, [
    amount,
    inputMode,
    limitPriceMinor,
    ownershipPercent,
    ownershipPreview.data,
    percentInputIsValid,
    price,
  ]);

  const orderInput = useMemo<TradingOrderInput | null>(() => {
    if (!asset.data || !parsedShares || !limitPriceMinor || validationError) return null;
    return {
      assetId: asset.data.id,
      side,
      type: "LIMIT",
      timeInForce,
      units: parsedShares.toString(),
      limitPriceMinor,
    };
  }, [asset.data, limitPriceMinor, parsedShares, side, timeInForce, validationError]);

  const livePreview = useQuery({
    queryKey: ["trading", "preview", orderInput],
    queryFn: () => services.trading.previewOrder(orderInput!),
    enabled: Boolean(orderInput && (!capability || capability.allowed)),
    retry: false,
    staleTime: 0,
  });

  const refreshTradingViews = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.assets.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.market.summary }),
      queryClient.invalidateQueries({ queryKey: ["marketplace", "public-catalogue"] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.market.orderBook(assetSlug) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.market.recentTrades(assetSlug) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.trading.orders }),
      queryClient.invalidateQueries({ queryKey: ["trading", "executions"] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.summary }),
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.holdings }),
      queryClient.invalidateQueries({ queryKey: ["portfolio", "transactions"] }),
      queryClient.invalidateQueries({ queryKey: ["ownership", "issuance", assetSlug] }),
      queryClient.invalidateQueries({ queryKey: ["ownership", "position", assetSlug] }),
    ]);
  };

  const place = useMutation({
    mutationFn: services.trading.placeOrder,
    onSuccess: async (value) => {
      await refreshTradingViews();
      setResult(value);
      setStage("result");
    },
  });

  if (asset.isLoading)
    return <PageCard title="Loading asset" body="Loading the published trading asset." />;
  if (asset.isError || !asset.data)
    return <PageCard title="Asset unavailable" body="This asset is not available for trading." />;

  const action = side === "BUY" ? "Buy" : "Sell";
  const category = marketCategoryPresentation(asset.data.details.category);
  const showcase = assetShowcaseMedia(assetSlug);
  const media = asset.data.media.find((item) => item.kind === "image");
  const image = media?.url ?? showcase?.src;
  const imageAlt = media?.alt ?? showcase?.alt ?? asset.data.details.title;
  const availableCash = BigInt(portfolio.data?.cash.availableMinor ?? "0");

  const openReview = async () => {
    if (capability && !capability.allowed) {
      setCapabilityDialog(capability);
      return;
    }
    if (!orderInput) return;
    const response = livePreview.data ?? (await livePreview.refetch()).data;
    if (response) {
      setReview(response);
      setStage("review");
    }
  };

  if (stage === "result" && result) {
    return (
      <div className="trading-order-page page-shell">
        <section className="trading-result-card">
          <span className="trading-result-icon">
            <CheckCircle2 aria-hidden="true" />
          </span>
          <p className="trading-eyebrow">Order received</p>
          <h1>
            {action} order {formatStatus(result.status)}
          </h1>
          <p>Slice returned the authoritative order state below.</p>
          <dl className="trading-summary-grid">
            <Cell label="Ownership units" value={result.originalUnits} />
            <Cell label="Filled" value={result.filledUnits} />
            <Cell label="Remaining" value={result.remainingUnits} />
            <Cell label="Limit price" value={formatGbpMinor(result.limitPriceMinor)} />
            <Cell
              label="Average fill"
              value={
                result.averageFillPriceMinor
                  ? formatGbpMinor(result.averageFillPriceMinor)
                  : "Not filled yet"
              }
            />
            <Cell label="Status" value={formatStatus(result.status)} />
          </dl>
          <div className="trading-actions trading-result-actions">
            <Link to="/orders" className="primary-action">
              View orders
            </Link>
            <Link to="/portfolio" className="secondary-action">
              View portfolio
            </Link>
            <Link to="/asset/$id" params={{ id: assetSlug }} className="secondary-action">
              Back to asset
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const netProceeds =
    review && side === "SELL" ? BigInt(review.grossMinor) - BigInt(review.feeMinor) : null;

  return (
    <main className="trading-order-page page-shell">
      <Link to="/asset/$id" params={{ id: assetSlug }} className="trading-back-link">
        <ArrowLeft aria-hidden="true" /> Back to {asset.data.details.title}
      </Link>
      <header className="trading-order-header">
        <div>
          <p className="trading-eyebrow">
            {side === "BUY" ? customerTerms.own : customerTerms.sell}
          </p>
          <h1>Place a {action.toLowerCase()} order</h1>
          <p>
            Choose the percentage or amount you want and your limit price. Slice confirms fees,
            reservations and fills.
          </p>
        </div>
        <div className="trading-asset-chip">
          {image ? <img src={image} alt={imageAlt} /> : <Layers3 aria-hidden="true" />}
          <span>
            <strong>{asset.data.details.title}</strong>
            <small>
              {category.label} ·{" "}
              {asset.data.grade
                ? `${asset.data.grade.company} ${asset.data.grade.label}`
                : "Published asset"}
            </small>
          </span>
        </div>
      </header>

      <div className="trading-order-layout">
        <section className="trading-form-card">
          {stage === "configure" ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void openReview();
              }}
            >
              <div className="trading-section-heading">
                <span className="trading-section-icon">
                  <Scale aria-hidden="true" />
                </span>
                <div>
                  <p className="trading-eyebrow">Trade ownership</p>
                  <h2>{side === "BUY" ? "Own this collectible" : "Sell ownership"}</h2>
                  <p>
                    Choose a percentage or amount of the whole collectible. Slice converts it into
                    whole ownership units and checks the live market before you review.
                  </p>
                </div>
              </div>
              <div className="trading-side-tabs" role="tablist" aria-label="Trade ownership">
                <Link
                  className={side === "BUY" ? "is-active" : ""}
                  to="/buy/$id"
                  params={{ id: assetSlug }}
                >
                  Buy
                </Link>
                <Link
                  className={side === "SELL" ? "is-active" : ""}
                  to="/sell/$id"
                  params={{ id: assetSlug }}
                >
                  Sell
                </Link>
              </div>
              <div className="trading-ownership-facts">
                <ContextRow
                  label="Slice market-implied value"
                  value={
                    ownershipPreview.data?.impliedWholeValueMinor
                      ? formatGbpMinor(ownershipPreview.data.impliedWholeValueMinor)
                      : "Unavailable"
                  }
                />
                <ContextRow
                  label="Available ownership"
                  value={
                    ownershipPreview.data
                      ? formatAvailability(ownershipPreview.data.availableOwnershipPercent)
                      : "Unavailable"
                  }
                />
                <ContextRow
                  label="Value of 1%"
                  value={
                    ownershipPreview.data?.onePercentValueMinor
                      ? formatGbpMinor(ownershipPreview.data.onePercentValueMinor)
                      : "Unavailable"
                  }
                />
                <ContextRow
                  label="Price per Slice"
                  value={
                    ownershipPreview.data?.slicePriceMinor === undefined
                      ? "Unavailable"
                      : formatPricePerUnit(ownershipPreview.data.slicePriceMinor, "GBP")
                  }
                />
              </div>
              <fieldset className="trading-input-mode">
                <legend>Buy by</legend>
                <div className="trading-side-tabs" role="tablist" aria-label="Order input mode">
                  <button
                    type="button"
                    className={inputMode === "PERCENTAGE" ? "is-active" : ""}
                    onClick={() => setInputMode("PERCENTAGE")}
                  >
                    Percentage
                  </button>
                  <button
                    type="button"
                    className={inputMode === "AMOUNT" ? "is-active" : ""}
                    onClick={() => setInputMode("AMOUNT")}
                  >
                    Amount
                  </button>
                </div>
              </fieldset>
              {inputMode === "PERCENTAGE" ? (
                <>
                  <label className="trading-field-label" htmlFor="trading-ownership-percent">
                    {side === "BUY"
                      ? "What percentage would you like to buy?"
                      : "Percentage of the collectible to sell"}
                  </label>
                  <div className="trading-percent-control">
                    <input
                      id="trading-ownership-percent"
                      value={ownershipPercent}
                      onChange={(event) => setOwnershipPercent(event.target.value)}
                      inputMode="decimal"
                      placeholder="5"
                      aria-describedby="trading-ownership-help"
                      className="trading-input trading-percent-input"
                    />
                    <span>%</span>
                  </div>
                </>
              ) : (
                <>
                  <label className="trading-field-label" htmlFor="trading-amount">
                    {side === "BUY"
                      ? "How much would you like to spend?"
                      : "How much would you like to sell?"}
                  </label>
                  <div className="trading-money-input">
                    <span>£</span>
                    <input
                      id="trading-amount"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      inputMode="decimal"
                      placeholder="300.00"
                      aria-describedby="trading-ownership-help"
                    />
                    <small>GBP</small>
                  </div>
                </>
              )}
              <p id="trading-ownership-help" className="trading-field-help">
                Valid increments are{" "}
                {ownershipPreview.data?.ownershipIncrementPercent ?? "whole Slice"}%.
                {side === "SELL" && ownershipPreview.data
                  ? ` You currently own ${ownershipPreview.data.ownedOwnershipPercent}% (${ownershipPreview.data.ownedSlices} ownership units).`
                  : " This is ownership of the whole collectible, not a percentage of your holdings."}
              </p>
              {ownershipPreview.data?.requestedSlices === null &&
                ownershipPreview.data.lowerSnap &&
                ownershipPreview.data.upperSnap && (
                  <div className="trading-snap-notice" role="status">
                    The closest available ownership amounts are{" "}
                    {ownershipPreview.data.lowerSnap.ownershipPercent}% or{" "}
                    {ownershipPreview.data.upperSnap.ownershipPercent}%.
                    <div>
                      <button
                        type="button"
                        onClick={() =>
                          setOwnershipPercent(ownershipPreview.data!.lowerSnap!.ownershipPercent)
                        }
                      >
                        Use {ownershipPreview.data.lowerSnap.ownershipPercent}%
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setOwnershipPercent(ownershipPreview.data!.upperSnap!.ownershipPercent)
                        }
                      >
                        Use {ownershipPreview.data.upperSnap.ownershipPercent}%
                      </button>
                    </div>
                  </div>
                )}
              <section className="trading-how-it-works">
                <strong>How ownership works</strong>
                <span>
                  This collectible is divided into ownership units. Slice calculates the valid
                  quantity and estimated order value from the live market.
                </span>
              </section>
              <p className="trading-field-help">
                1. Choose your ownership&nbsp;&nbsp; 2. Review your order&nbsp;&nbsp; 3. Filled
                ownership units appear in your Portfolio. Orders may remain open until matching
                liquidity is available.
              </p>
              <details className="trading-advanced-settings">
                <summary>Advanced order settings</summary>
                <label className="trading-field-label" htmlFor="trading-price">
                  {side === "BUY" ? "Maximum price per Slice" : "Your minimum price per Slice"}
                </label>
                <div className="trading-money-input">
                  <span>£</span>
                  <input
                    id="trading-price"
                    value={price}
                    onChange={(event) => {
                      setPriceTouched(true);
                      setPrice(event.target.value);
                    }}
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-describedby="trading-price-help"
                  />
                  <small>GBP</small>
                </div>
                <p id="trading-price-help" className="trading-field-help">
                  {ownershipPreview.data?.bestMarketPriceMinor
                    ? `Suggested from the live ${side === "BUY" ? "ask" : "bid"}: ${formatGbpMinor(ownershipPreview.data.bestMarketPriceMinor)}. Your limit remains in control.`
                    : "Set a limit price to control the maximum you pay or minimum you accept."}
                </p>
                <p className="trading-field-help">
                  A limit price is the highest price per Slice you will pay on a buy order, or the
                  lowest price you will accept on a sell order. It is separate from your total
                  amount to invest.
                </p>
                <fieldset className="trading-tif">
                  <legend>Time in force</legend>
                  <div className="trading-tif-grid">
                    <button
                      type="button"
                      className={timeInForce === "GTC" ? "is-active" : ""}
                      onClick={() => setTimeInForce("GTC")}
                    >
                      <Clock3 aria-hidden="true" />
                      <span>
                        <strong>Good ’til cancelled</strong>
                        <small>Remains open until filled or cancelled.</small>
                      </span>
                      <b>GTC</b>
                    </button>
                    <button
                      type="button"
                      className={timeInForce === "IOC" ? "is-active" : ""}
                      onClick={() => setTimeInForce("IOC")}
                    >
                      <ShieldCheck aria-hidden="true" />
                      <span>
                        <strong>Immediate or cancel</strong>
                        <small>Cancels any unmatched remainder.</small>
                      </span>
                      <b>IOC</b>
                    </button>
                  </div>
                </fieldset>
              </details>
              {(validationError || ownershipPreview.isError) && (
                <p role="alert" className="trading-error">
                  {validationError ?? messageFor(ownershipPreview.error)}
                </p>
              )}
              {livePreview.isError && (
                <p role="alert" className="trading-error">
                  {messageFor(livePreview.error)}
                </p>
              )}
              {capability && !capability.allowed && (
                <button
                  type="button"
                  className="trading-capability-note"
                  onClick={() => setCapabilityDialog(capability)}
                >
                  <LockKeyhole aria-hidden="true" /> Verification is required to place this order.
                  View requirement.
                </button>
              )}
              <Estimate
                preview={livePreview.data}
                ownershipPreview={ownershipPreview.data}
                side={side}
                loading={livePreview.isFetching || ownershipPreview.isFetching}
              />
              {side === "BUY" && ownershipPreview.data?.cashShortfallMinor && (
                <p className="trading-error" role="alert">
                  You need approximately {formatGbpMinor(ownershipPreview.data.cashShortfallMinor)}{" "}
                  more available cash for this order.
                </p>
              )}
              <button
                type="submit"
                disabled={!orderInput || livePreview.isFetching}
                className="primary-action trading-submit"
              >
                Review {action.toLowerCase()} order
              </button>
            </form>
          ) : (
            <section>
              <div className="trading-section-heading">
                <span className="trading-section-icon">
                  <ShieldCheck aria-hidden="true" />
                </span>
                <div>
                  <p className="trading-eyebrow">Review</p>
                  <h2>Confirm your {action.toLowerCase()} order</h2>
                </div>
              </div>
              {review && (
                <dl className="trading-summary-grid trading-review-grid">
                  <Cell label="Asset" value={asset.data.details.title} />
                  <Cell label="Side" value={action} />
                  <Cell
                    label={side === "BUY" ? "Ownership requested" : "Ownership to sell"}
                    value={`${ownershipPreview.data?.requestedOwnershipPercent ?? ownershipPercent}%`}
                  />
                  <Cell
                    label={side === "BUY" ? "Resulting ownership" : "Remaining ownership"}
                    value={
                      side === "BUY"
                        ? ownershipPreview.data?.resultingOwnershipPercent
                          ? `${ownershipPreview.data.resultingOwnershipPercent}%`
                          : "Unavailable"
                        : ownershipPreview.data?.remainingOwnershipPercent
                          ? `${ownershipPreview.data.remainingOwnershipPercent}%`
                          : "Unavailable"
                    }
                  />
                  <Cell label="Ownership units" value={review.units} />
                  <Cell label="Limit price" value={formatGbpMinor(review.limitPriceMinor)} />
                  <Cell label="Order value" value={formatGbpMinor(review.grossMinor)} />
                  <Cell
                    label="Estimated market total"
                    value={
                      ownershipPreview.data?.estimatedCostMinor
                        ? formatGbpMinor(ownershipPreview.data.estimatedCostMinor)
                        : "Unavailable"
                    }
                  />
                  <Cell label="Authoritative fee preview" value={formatGbpMinor(review.feeMinor)} />
                  <Cell
                    label={side === "BUY" ? "Maximum cash reserved" : "Estimated proceeds"}
                    value={
                      side === "BUY"
                        ? review.reservationMinor
                          ? formatGbpMinor(review.reservationMinor)
                          : "Unavailable"
                        : formatGbpMinor(netProceeds ?? 0n)
                    }
                  />
                  <Cell label="Time in force" value={review.timeInForce} />
                </dl>
              )}
              <div className="trading-review-notice">
                <BookOpen aria-hidden="true" />
                <p>
                  <strong>Before you submit</strong>
                  <span>
                    Your limit order may fill fully, partially, or remain open. Final financial and
                    ownership effects are recorded by Slice’s trading and settlement authorities.
                  </span>
                </p>
              </div>
              {place.isError && (
                <p role="alert" className="trading-error">
                  {messageFor(place.error)}
                </p>
              )}
              <div className="trading-actions trading-review-actions">
                <button
                  type="button"
                  disabled={!orderInput || place.isPending}
                  onClick={() => orderInput && place.mutate(orderInput)}
                  className="primary-action"
                >
                  {place.isPending ? "Submitting…" : `Place ${action.toLowerCase()} order`}
                </button>
                <button
                  type="button"
                  onClick={() => setStage("configure")}
                  className="secondary-action"
                >
                  Edit order
                </button>
              </div>
            </section>
          )}
        </section>

        <aside className="trading-context-stack">
          <ContextCard
            title={side === "BUY" ? "Buying power" : "Your position"}
            icon={side === "BUY" ? <WalletCards /> : <Coins />}
          >
            {side === "BUY" ? (
              <dl className="trading-context-list">
                <ContextRow label="Available cash" value={formatGbpMinor(availableCash)} />
                <ContextRow
                  label="Ownership units already owned"
                  value={settledOwned.toLocaleString("en-GB")}
                />
                <ContextRow
                  label="Publicly available"
                  value={
                    !ownershipPreview.data
                      ? "Unavailable"
                      : `${formatAvailability(ownershipPreview.data.availableOwnershipPercent)} (${ownershipPreview.data.availableSlices} units)`
                  }
                />
                <ContextRow label="Minimum order" value="1 Slice" />
              </dl>
            ) : (
              <dl className="trading-context-list">
                <ContextRow
                  label="Ownership units owned"
                  value={settledOwned.toLocaleString("en-GB")}
                />
                <ContextRow
                  label="Reserved in open orders"
                  value={reservedOwned.toLocaleString("en-GB")}
                />
                <ContextRow
                  label="Available to sell"
                  value={availableOwned.toLocaleString("en-GB")}
                />
                <ContextRow
                  label="Average cost per Slice"
                  value={averageCost === null ? "Unavailable" : formatGbpMinor(averageCost)}
                />
              </dl>
            )}
          </ContextCard>
          <ContextCard title="Market snapshot" icon={<BookOpen />}>
            <div className="trading-book-head">
              <span>Ownership units</span>
              <span>Price</span>
            </div>
            <BookSide label="Asks" levels={orderBook.data?.asks.slice(0, 3)} tone="ask" />
            <div className="trading-spread">
              <span>Spread</span>
              <strong>{spreadLabel(bestBid, bestAsk)}</strong>
            </div>
            <BookSide label="Bids" levels={orderBook.data?.bids.slice(0, 3)} tone="bid" />
            {!orderBook.isLoading &&
              !orderBook.data?.asks.length &&
              !orderBook.data?.bids.length && (
                <p className="trading-empty-book">
                  No open book levels. The public reference price is used for prefill only.
                </p>
              )}
          </ContextCard>
          <div className="trading-authority-note">
            <ShieldCheck aria-hidden="true" />
            <p>
              <strong>Protected by Slice</strong>
              <span>
                Cash, ownership, fee and reservation checks are confirmed by the backend before
                submission.
              </span>
            </p>
          </div>
        </aside>
      </div>
      <CapabilityRequiredDialog
        decision={capabilityDialog}
        onClose={() => setCapabilityDialog(null)}
      />
    </main>
  );
}

function Estimate({
  preview,
  ownershipPreview,
  side,
  loading,
}: {
  preview?: TradingOrderPreview;
  ownershipPreview?: import("@/domain").OwnershipOrderPreview;
  side: TradingOrderSide;
  loading: boolean;
}) {
  return (
    <section className="trading-estimate" aria-live="polite">
      <div className="trading-estimate-heading">
        <Banknote aria-hidden="true" />
        <strong>Authoritative order preview</strong>
        {loading && <span>Checking…</span>}
      </div>
      <dl>
        <ContextRow
          label="Ownership requested"
          value={
            ownershipPreview?.requestedOwnershipPercent
              ? `${ownershipPreview.requestedOwnershipPercent}%`
              : "—"
          }
        />
        <ContextRow
          label="Ownership units"
          value={ownershipPreview?.requestedSlices ?? preview?.units ?? "—"}
        />
        <ContextRow
          label="Estimated average price"
          value={
            ownershipPreview?.estimatedAveragePriceMinor
              ? `${formatGbpMinor(ownershipPreview.estimatedAveragePriceMinor)} / Slice`
              : "—"
          }
        />
        {ownershipPreview && (
          <ContextRow
            label={
              side === "BUY" ? "If fully filled, available ownership" : "Ownership after full fill"
            }
            value={
              side === "BUY"
                ? ownershipPreview.projectedRemainingAvailableIfFullyFilled
                  ? `${ownershipPreview.projectedRemainingAvailableIfFullyFilled}% remaining`
                  : "Unavailable"
                : ownershipPreview.remainingOwnershipPercent
                  ? `${ownershipPreview.remainingOwnershipPercent}%`
                  : "Unavailable"
            }
          />
        )}
        <ContextRow
          label={side === "BUY" ? "Estimated total" : "Estimated proceeds"}
          value={
            ownershipPreview?.estimatedCostMinor
              ? formatGbpMinor(ownershipPreview.estimatedCostMinor)
              : preview
                ? formatGbpMinor(preview.grossMinor)
                : "—"
          }
        />
        <ContextRow
          label="Policy fee"
          value={
            ownershipPreview?.feeMinor
              ? formatGbpMinor(ownershipPreview.feeMinor)
              : preview
                ? formatGbpMinor(preview.feeMinor)
                : "—"
          }
        />
        <ContextRow
          label={side === "BUY" ? "Resulting ownership" : "Remaining ownership"}
          value={
            ownershipPreview
              ? side === "BUY"
                ? ownershipPreview.resultingOwnershipPercent
                  ? `${ownershipPreview.resultingOwnershipPercent}%`
                  : "Unavailable"
                : ownershipPreview.remainingOwnershipPercent
                  ? `${ownershipPreview.remainingOwnershipPercent}%`
                  : "Unavailable"
              : "—"
          }
        />
        {side === "BUY" && (
          <ContextRow
            label="Available cash"
            value={
              ownershipPreview?.availableCashMinor
                ? formatGbpMinor(ownershipPreview.availableCashMinor)
                : "Unavailable"
            }
          />
        )}
      </dl>
    </section>
  );
}

function ContextCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="trading-context-card">
      <header>
        <span>{icon}</span>
        <h2>{title}</h2>
      </header>
      {children}
    </section>
  );
}
function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
function BookSide({
  label,
  levels,
  tone,
}: {
  label: string;
  levels?: Array<{ units: number; pricePerUnit: { amount: number } }>;
  tone: "bid" | "ask";
}) {
  if (!levels?.length) return null;
  return (
    <div className={`trading-book-side is-${tone}`}>
      <p>{label}</p>
      {levels.map((level, index) => (
        <div key={`${level.pricePerUnit.amount}-${index}`}>
          <span>{level.units.toLocaleString("en-GB")}</span>
          <strong>{formatGbpMinor(BigInt(level.pricePerUnit.amount))}</strong>
        </div>
      ))}
    </div>
  );
}
function spreadLabel(
  bid: ReturnType<typeof bestOrderBookLevel>,
  ask: ReturnType<typeof bestOrderBookLevel>,
) {
  if (!bid || !ask) return "Unavailable";
  const spread = BigInt(ask.pricePerUnit.amount) - BigInt(bid.pricePerUnit.amount);
  return spread >= 0n ? formatGbpMinor(spread) : "Crossed book";
}
function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
function formatStatus(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}
function PageCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="trading-order-page page-shell">
      <section className="trading-result-card">
        <p className="trading-eyebrow">Trading</p>
        <h1>{title}</h1>
        <p>{body}</p>
      </section>
    </div>
  );
}
