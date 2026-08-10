import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bookmark, Search } from "lucide-react";
import { ApiError } from "@/api/http-client";
import { useSession } from "@/auth/use-session";
import { recordQaRollback } from "@/auth/qa-harness";
import { useAppServices } from "@/providers/AppServicesProvider";
const currentUser = "current" as never;
export const Route = createFileRoute("/watchlist")({
  head: () => ({ meta: [{ title: "Watchlist | Slice" }] }),
  component: Watchlist,
});
function Watchlist() {
  const services = useAppServices();
  const client = useQueryClient();
  const { isAuthenticated } = useSession();
  const list = useQuery({
    queryKey: ["watchlist", "current"],
    queryFn: () => services.ownership.watchlist(currentUser),
    enabled: isAuthenticated,
  });
  const remove = useMutation({
    mutationFn: (id: string) => services.ownership.toggleWatchlist(currentUser, id as never),
    onMutate: async (assetId) => {
      await client.cancelQueries({ queryKey: ["watchlist", "current"] });
      const previous = client.getQueryData<typeof list.data>(["watchlist", "current"]);
      if (previous) {
        client.setQueryData(["watchlist", "current"], {
          ...previous,
          assetIds: previous.assetIds.filter((id) => id !== assetId),
        });
      }
      return { previous };
    },
    onError: (_error, _assetId, context) => {
      if (context?.previous) client.setQueryData(["watchlist", "current"], context.previous);
      recordQaRollback();
    },
    onSettled: () => void client.invalidateQueries({ queryKey: ["watchlist", "current"] }),
  });
  const authRequired =
    !isAuthenticated || (list.error instanceof ApiError && list.error.status === 401);
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[.16em] text-accent">Watchlist</p>
      <div className="mt-2 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-[-.05em]">
            Assets you are following.
          </h1>
          <p className="mt-3 text-sm text-subtle">
            Saved assets are tied to your authenticated Slice account.
          </p>
        </div>
        <Link
          to="/marketplace"
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold hover:bg-elevated"
        >
          <Search className="size-4" />
          Discover markets
        </Link>
      </div>
      {!authRequired && list.isLoading ? (
        <p className="mt-7">Loading watchlist…</p>
      ) : authRequired ? (
        <p className="mt-7">Sign in to view your watchlist.</p>
      ) : list.isError ? (
        <div className="mt-7">
          <p>Watchlist unavailable.</p>
          <button type="button" onClick={() => void list.refetch()}>
            Retry
          </button>
        </div>
      ) : list.data?.assetIds.length ? (
        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {list.data.assetIds.map((assetId) => (
            <article key={assetId} className="rounded-xl border border-border bg-elevated p-4">
              <Bookmark className="text-accent" aria-hidden="true" />
              <p className="mt-3 font-semibold">Saved asset</p>
              <p className="text-sm text-subtle">{assetId}</p>
              <button
                type="button"
                className="mt-4 text-sm font-semibold text-subtle hover:text-foreground"
                disabled={remove.isPending}
                onClick={() => remove.mutate(assetId)}
              >
                Remove
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-7">Your watchlist is clear.</p>
      )}
    </div>
  );
}
