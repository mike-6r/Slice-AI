import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AssetId, TimeRange, UserId } from "@/domain";
import { useAppServices } from "@/providers/AppServicesProvider";
import { queryKeys } from "./keys";

const STALE_TIME = 30_000;
export const useAssets = (input?: { category?: string; query?: string }) => {
  const s = useAppServices();
  return useQuery({
    queryKey: [...queryKeys.assets.all, input] as const,
    queryFn: () => s.assets.list(input),
    staleTime: STALE_TIME,
    placeholderData: keepPreviousData,
  });
};
export const useAsset = (id: AssetId) => {
  const s = useAppServices();
  return useQuery({
    queryKey: queryKeys.assets.detail(id),
    queryFn: () => s.assets.get(id),
    staleTime: STALE_TIME,
  });
};
export const useFeaturedAssets = () => {
  const s = useAppServices();
  return useQuery({
    queryKey: queryKeys.assets.featured,
    queryFn: s.assets.featured,
    staleTime: STALE_TIME,
  });
};
export const useTrendingAssets = () => {
  const s = useAppServices();
  return useQuery({
    queryKey: queryKeys.assets.trending,
    queryFn: s.assets.trending,
    staleTime: STALE_TIME,
  });
};
export const useMarketSummary = () => {
  const s = useAppServices();
  return useQuery({
    queryKey: queryKeys.market.summary,
    queryFn: s.market.summary,
    staleTime: STALE_TIME,
  });
};
export const useMarketMovers = () => {
  const s = useAppServices();
  return useQuery({
    queryKey: queryKeys.market.movers,
    queryFn: s.market.movers,
    staleTime: STALE_TIME,
  });
};
export const usePriceHistory = (id: AssetId, range: TimeRange) => {
  const s = useAppServices();
  return useQuery({
    queryKey: queryKeys.market.history(id, range),
    queryFn: () => s.market.priceHistory(id, range),
    staleTime: STALE_TIME,
    placeholderData: keepPreviousData,
  });
};
export const useOrderBook = (id: AssetId) => {
  const s = useAppServices();
  return useQuery({
    queryKey: queryKeys.market.orderBook(id),
    queryFn: () => s.market.orderBook(id),
    staleTime: 5_000,
  });
};
export const usePortfolio = () => {
  const s = useAppServices();
  return useQuery({
    queryKey: queryKeys.portfolio.summary,
    queryFn: s.portfolio.portfolio,
    staleTime: STALE_TIME,
  });
};
export const usePortfolioHoldings = () => {
  const s = useAppServices();
  return useQuery({
    queryKey: queryKeys.portfolio.holdings,
    queryFn: s.portfolio.holdings,
    staleTime: STALE_TIME,
  });
};
export const usePortfolioLots = () => {
  const s = useAppServices();
  return useQuery({
    queryKey: queryKeys.portfolio.lots,
    queryFn: s.portfolio.lots,
    staleTime: STALE_TIME,
  });
};
export const usePortfolioTransactions = (cursor?: string) => {
  const s = useAppServices();
  return useQuery({
    queryKey: queryKeys.portfolio.transactions(cursor),
    queryFn: () => s.portfolio.transactions({ cursor }),
    staleTime: STALE_TIME,
  });
};
export const useCollectors = () => {
  const s = useAppServices();
  return useQuery({
    queryKey: queryKeys.collectors.all,
    queryFn: s.collectors.list,
    staleTime: STALE_TIME,
  });
};
export const useCollector = (id: UserId) => {
  const s = useAppServices();
  return useQuery({
    queryKey: queryKeys.collectors.detail(id),
    queryFn: () => s.collectors.get(id),
    staleTime: STALE_TIME,
  });
};
export const useWatchlist = (userId: UserId) => {
  const s = useAppServices();
  return useQuery({
    queryKey: queryKeys.watchlist(userId),
    queryFn: () => s.ownership.watchlist(userId),
    staleTime: STALE_TIME,
  });
};
export const useNotifications = (userId: UserId) => {
  const s = useAppServices();
  return useQuery({
    queryKey: queryKeys.notifications(userId),
    queryFn: () => s.repositories.notifications.listNotifications(userId),
    staleTime: STALE_TIME,
  });
};
export const useWallet = (userId: UserId) => {
  const s = useAppServices();
  return useQuery({
    queryKey: queryKeys.wallet(userId),
    queryFn: () => s.wallet.balances(userId),
    staleTime: STALE_TIME,
  });
};
export const useDiscussions = (assetId: AssetId) => {
  const s = useAppServices();
  return useQuery({
    queryKey: queryKeys.discussions(assetId),
    queryFn: () => s.community.discussions(assetId),
    staleTime: STALE_TIME,
  });
};
export const useSaleProposal = (id: string) => {
  const s = useAppServices();
  return useQuery({
    queryKey: queryKeys.proposal(id),
    queryFn: () => s.community.proposal(id),
    staleTime: STALE_TIME,
  });
};
export function useToggleWatchlist(userId: UserId) {
  const s = useAppServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (assetId: AssetId) => s.ownership.toggleWatchlist(userId, assetId),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.watchlist(userId) }),
  });
}
