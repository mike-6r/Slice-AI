import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { InformationPage } from "./-information-page";
import { useAppServices } from "@/providers/AppServicesProvider";
import { queryKeys } from "@/queries/keys";

export const Route = createFileRoute("/fees")({
  head: () => ({ meta: [{ title: "Fees | Slice" }] }),
  component: FeesPage,
});

function FeesPage() {
  const services = useAppServices();
  const policy = useQuery({
    queryKey: queryKeys.providers.feePolicy,
    queryFn: services.providers.feePolicy,
  });
  const value = policy.data;
  const percent = (bps: number | undefined) =>
    bps === undefined ? "Current policy unavailable" : `${bps / 100}%`;
  return (
    <InformationPage
      content={{
        eyebrow: "Fees",
        title: "Clear pricing before you use Slice.",
        intro:
          "Current fees come from Slice's backend policy and are shown again in the relevant preview before you confirm.",
        sections: value
          ? [
              {
                title: "Deposits · Free",
                body: "Slice charges 0% to deposit funds. Any provider expense is handled separately and does not reduce your credited deposit.",
              },
              {
                title: `Trading · ${value.secondaryTrading.makerFeeBps === 0 && value.secondaryTrading.takerFeeBps === 0 ? "No trading fees" : `maker ${percent(value.secondaryTrading.makerFeeBps)} · taker ${percent(value.secondaryTrading.takerFeeBps)}`}`,
                body: "The current secondary-market policy is applied by the market and shown in the order preview before confirmation.",
              },
              {
                title: `Withdrawals · ${percent(value.withdrawal.sliceFeeBps)}`,
                body: "The amount you enter is the gross amount removed from your Slice wallet. The preview shows the Slice fee and the net amount sent to your payout destination.",
              },
              {
                title: `Initial Offerings · ${percent(value.initialOffering.feeBps)}`,
                body: "Collectors pay this fee from successfully sold offering proceeds. Investors are not charged an additional fee on top of the approved offering price.",
              },
              {
                title: "Policy notice",
                body: "Fees may change in the future with notice under Slice's current terms and policy architecture. Always review the latest preview before confirming.",
              },
            ]
          : [
              {
                title: "Policy loading",
                body: policy.isError
                  ? "The authoritative fee policy is temporarily unavailable. Do not rely on a fee estimate until it loads."
                  : "Loading the authoritative fee policy…",
              },
            ],
      }}
    />
  );
}
