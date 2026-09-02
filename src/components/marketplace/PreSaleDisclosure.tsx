import { AlertTriangle, Clock3, LockKeyhole, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { PreSaleProjection } from "@/domain";
import "./pre-sale.css";

export const PRE_SALE_DISCLOSURE =
  "Slice has not yet physically received and verified this collectible. Your reservation remains conditional until physical intake, verification, and custody are complete. If the deadline is missed, your reserved funds will be released or refunded.";

export function formatPreSaleCountdown(deadlineAt: string | null | undefined, now = Date.now()) {
  if (!deadlineAt) return "Deadline pending";
  const remaining = new Date(deadlineAt).getTime() - now;
  if (remaining <= 0) return "Deadline passed";
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return days > 0 ? `${days}d ${hours}h remaining` : `${hours}h ${minutes}m remaining`;
}

const physicalLabel: Record<string, string> = {
  AWAITING_INTAKE: "Awaiting physical intake",
  IN_TRANSIT: "In transit to Slice",
  CARRIER_DELIVERED: "Carrier marked delivered",
  RECEIVED_BY_SLICE: "Received by Slice",
  VERIFIED: "Physical verification complete",
  CUSTODY_ESTABLISHED: "Custody established",
};

export function PreSaleDisclosure({
  preSale,
  formatMoney,
  compact = false,
}: {
  preSale: PreSaleProjection;
  formatMoney?: (minor: number, currency: string) => string;
  compact?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const price = Number(preSale.pricePerUnitMinor);
  return (
    <section className={`pre-sale-panel${compact ? " pre-sale-panel--compact" : ""}`} aria-label="Pre-Sale terms">
      <div className="pre-sale-panel__heading">
        <div>
          <span className="pre-sale-eyebrow"><span className="pre-sale-dot" /> Pre-Sale</span>
          <h3>Reserve before the market opens</h3>
        </div>
        <Clock3 aria-hidden="true" />
      </div>
      <div className="pre-sale-panel__facts">
        <div><span>Price per Slice</span><strong>{formatMoney && Number.isSafeInteger(price) ? formatMoney(price, preSale.currency) : `${preSale.currency} ${preSale.pricePerUnitMinor}`}</strong></div>
        <div><span>Available to reserve</span><strong>{Number(preSale.availableUnits).toLocaleString("en-GB")} Slices</strong></div>
        <div><span>Reservation closes</span><strong>{formatPreSaleCountdown(preSale.deadlineAt, now)}</strong></div>
      </div>
      <div className="pre-sale-panel__progress" aria-label={`${preSale.reservedPercentageBps / 100}% reserved`}>
        <span style={{ width: `${Math.min(100, preSale.reservedPercentageBps / 100)}%` }} />
      </div>
      <div className="pre-sale-panel__status"><ShieldCheck aria-hidden="true" /><span>{physicalLabel[preSale.physicalStatus] ?? preSale.physicalStatus}</span></div>
      {!compact ? <p className="pre-sale-panel__disclosure"><AlertTriangle aria-hidden="true" />{preSale.disclosure ?? PRE_SALE_DISCLOSURE}</p> : null}
      {!compact ? <p className="pre-sale-panel__lock"><LockKeyhole aria-hidden="true" /> Final ownership is created only after Slice receives, verifies, and secures the collectible.</p> : null}
    </section>
  );
}
