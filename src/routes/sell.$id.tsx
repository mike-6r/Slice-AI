import { createFileRoute } from "@tanstack/react-router";
import { TradingOrderForm } from "@/components/trading/TradingOrderForm";

export const Route = createFileRoute("/sell/$id")({
  head: () => ({ meta: [{ title: "Sell order | Slice" }] }),
  component: SellOrderPage,
});

function SellOrderPage() {
  const { id } = Route.useParams();
  return <TradingOrderForm assetSlug={id} side="SELL" />;
}
