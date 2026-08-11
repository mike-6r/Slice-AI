import type { LucideIcon } from "lucide-react";

/**
 * The single KPI icon primitive used by Wallet and Portfolio. The visual
 * contract intentionally lives with the established Wallet class so every
 * consumer gets the same tile geometry and Lucide SVG sizing.
 */
export function WalletKpiIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="wallet-kpi__icon" aria-hidden="true">
      <Icon />
    </span>
  );
}
