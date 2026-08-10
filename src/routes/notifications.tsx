import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Bell, CheckCheck, CircleDot } from "lucide-react";
import { ApiError } from "@/api/http-client";
import { useSession } from "@/auth/use-session";
import { recordQaRollback } from "@/auth/qa-harness";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { useAppServices } from "@/providers/AppServicesProvider";
const currentUser = "current" as never;
export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "Notifications | Slice" }] }),
  component: Notifications,
});
function Notifications() {
  const services = useAppServices();
  const client = useQueryClient();
  const { isAuthenticated } = useSession();
  const key = ["notifications", "current"];
  const list = useQuery({
    queryKey: key,
    queryFn: () => services.repositories.notifications.listNotifications(currentUser),
    enabled: isAuthenticated,
  });
  const refresh = () => void client.invalidateQueries({ queryKey: key });
  const read = useMutation({
    mutationFn: (id: string) => services.repositories.notifications.markRead(id),
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<typeof list.data>(key);
      if (previous)
        client.setQueryData(
          key,
          previous.map((item) =>
            item.id === id ? { ...item, readAt: new Date().toISOString() } : item,
          ),
        );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
      recordQaRollback();
    },
    onSuccess: () => toast.success("Notification marked as read."),
    onSettled: refresh,
  });
  const readAll = useMutation({
    mutationFn: () => services.repositories.notifications.markAllRead(),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<typeof list.data>(key);
      if (previous)
        client.setQueryData(
          key,
          previous.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
        );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
      recordQaRollback();
    },
    onSuccess: () => toast.success("Notifications marked as read."),
    onSettled: refresh,
  });
  const authRequired =
    !isAuthenticated || (list.error instanceof ApiError && list.error.status === 401);
  const unread = list.data?.filter((item) => !item.readAt).length ?? 0;
  return (
    <main className="page-shell max-w-3xl py-10 sm:py-12">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-accent">
            Notifications
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-[-.05em]">
            Updates, in one place.
          </h1>
          <p className="mt-3 text-sm text-subtle">
            Only notifications from your authenticated account are shown.
          </p>
        </div>
        <button
          type="button"
          disabled={readAll.isPending || !list.data?.length}
          onClick={() => readAll.mutate()}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold hover:bg-elevated"
        >
          <CheckCheck className="size-4" />
          Mark all read
        </button>
      </header>
      {!authRequired && list.isLoading ? (
        <section className="customer-state mt-7 space-y-3" aria-label="Loading notifications">
          <div className="customer-skeleton h-16" />
          <div className="customer-skeleton h-16" />
          <div className="customer-skeleton h-16" />
        </section>
      ) : authRequired ? (
        <section className="customer-state mt-7 text-center">
          <h2 className="text-lg font-semibold">Sign in to see notifications</h2>
          <p className="mt-2 text-sm text-subtle">
            Notification history is private to your authenticated account.
          </p>
        </section>
      ) : list.isError ? (
        <section className="customer-state mt-7 text-center">
          <h2 className="text-lg font-semibold">Notifications unavailable</h2>
          <p className="mt-2 text-sm text-subtle">Try again to load your durable updates.</p>
          <button
            type="button"
            className="mt-4 font-semibold text-accent"
            onClick={() => void list.refetch()}
          >
            Retry
          </button>
        </section>
      ) : list.data?.length ? (
        <div className="mt-7 overflow-hidden rounded-xl border border-border bg-elevated">
          {list.data.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={Boolean(item.readAt) || read.isPending}
              onClick={() => read.mutate(item.id)}
              className="flex w-full gap-3 border-b border-border p-4 text-left last:border-0 hover:bg-surface"
            >
              <span className={item.readAt ? "mt-1 text-muted" : "mt-1 text-accent"}>
                {item.readAt ? <Bell className="size-4" /> : <CircleDot className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex justify-between gap-3">
                  <span className="font-semibold">{item.title}</span>
                  <span className="shrink-0 text-xs text-muted">{formatDate(item.createdAt)}</span>
                </span>
                <span className="mt-1 block text-sm leading-6 text-subtle">{item.body}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <section className="customer-state mt-7 text-center">
          <Bell className="mx-auto size-6 text-accent" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-semibold">You have no notifications</h2>
          <p className="mt-2 text-sm text-subtle">
            Durable updates about your account and activity will appear here.
          </p>
        </section>
      )}
      <p className="mt-4 text-center text-xs text-muted">
        {unread} unread update{unread === 1 ? "" : "s"}
      </p>
    </main>
  );
}
