import type { QueryClient, QueryKey } from "@tanstack/react-query";

const PRIVATE_QUERY_ROOTS = new Set(["watchlist", "notifications", "portfolio", "wallet"]);

export const isPrivateQueryKey = (queryKey: QueryKey) =>
  typeof queryKey[0] === "string" && PRIVATE_QUERY_ROOTS.has(queryKey[0]);

export const clearPrivateQueries = (queryClient: QueryClient) =>
  queryClient.removeQueries({ predicate: (query) => isPrivateQueryKey(query.queryKey) });
