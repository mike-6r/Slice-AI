import { createFileRoute } from "@tanstack/react-router";
import { TradingOrderForm } from "@/components/trading/TradingOrderForm";

export const Route = createFileRoute("/buy/$id")({
  head: () => ({ meta: [{ title: "Buy order | Slice" }] }),
  component: BuyOrderPage,
});

function BuyOrderPage() {
  const { id } = Route.useParams();
  return <TradingOrderForm assetSlug={id} side="BUY" />;
}
