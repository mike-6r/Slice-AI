import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bell,
  BellRing,
  Check,
  CheckCheck,
  ClipboardCheck,
  MessageCircle,
  PackageCheck,
  ReceiptText,
  TrendingUp,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { ApiError } from "@/api/http-client";
import { useSession } from "@/auth/use-session";
import { recordQaRollback } from "@/auth/qa-harness";
import { toast } from "sonner";
import type { Notification } from "@/domain";
import { formatDate } from "@/lib/format";
import { useAppServices } from "@/providers/AppServicesProvider";
import { queryKeys } from "@/queries/keys";

const currentUser = "current" as never;

type NotificationFilter = "ALL" | "UNREAD";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "Notifications | Slice" }] }),
  component: Notifications,
});

function Notifications() {
  const services = useAppServices();
  const client = useQueryClient();
  const { isAuthenticated } = useSession();
  const [filter, setFilter] = useState<NotificationFilter>("ALL");
  const key = ["notifications", "current"];
  const unreadKey = queryKeys.notifications.unread;
  const list = useQuery({
    queryKey: key,
    queryFn: () => services.repositories.notifications.listNotifications(currentUser),
    enabled: isAuthenticated,
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: key });
    void client.invalidateQueries({ queryKey: unreadKey });
  };
  const read = useMutation({
    mutationFn: (id: string) => services.repositories.notifications.markRead(id),
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: key });
      await client.cancelQueries({ queryKey: unreadKey });
      const previous = client.getQueryData<typeof list.data>(key);
      const previousUnread = client.getQueryData<number>(unreadKey);
      const wasUnread = previous?.some((item) => item.id === id && !item.readAt) ?? false;
      if (previous)
        client.setQueryData(
          key,
          previous.map((item) =>
            item.id === id ? { ...item, readAt: new Date().toISOString() } : item,
          ),
        );
      if (wasUnread && typeof previousUnread === "number")
        client.setQueryData(unreadKey, Math.max(0, previousUnread - 1));
      return { previous, previousUnread };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
      if (typeof context?.previousUnread === "number")
        client.setQueryData(unreadKey, context.previousUnread);
      recordQaRollback();
    },
    onSuccess: () => toast.success("Notification marked as read."),
    onSettled: refresh,
  });
  const readAll = useMutation({
    mutationFn: () => services.repositories.notifications.markAllRead(),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: key });
      await client.cancelQueries({ queryKey: unreadKey });
      const previous = client.getQueryData<typeof list.data>(key);
      const previousUnread = client.getQueryData<number>(unreadKey);
      if (previous)
        client.setQueryData(
          key,
          previous.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
        );
      client.setQueryData(unreadKey, 0);
      return { previous, previousUnread };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
      if (typeof context?.previousUnread === "number")
        client.setQueryData(unreadKey, context.previousUnread);
      else void client.invalidateQueries({ queryKey: unreadKey });
      recordQaRollback();
    },
    onSuccess: () => toast.success("Notifications marked as read."),
    onSettled: refresh,
  });
  const authRequired =
    !isAuthenticated || (list.error instanceof ApiError && list.error.status === 401);
  const unread = list.data?.filter((item) => !item.readAt).length ?? 0;
  const notifications = list.data ?? [];
  const visibleNotifications =
    filter === "UNREAD" ? notifications.filter((item) => !item.readAt) : notifications;

  return (
    <main className="notifications-page">
      <div className="page-shell notifications-shell">
        <header className="notifications-hero">
          <div className="notifications-hero__copy">
            <p className="notifications-hero__eyebrow">
              <BellRing aria-hidden="true" /> Account updates
            </p>
            <h1>Everything worth knowing.</h1>
            <p>
              Your private record of account, wallet, market and collectible activity—newest first.
            </p>
          </div>
          <div className="notifications-hero__actions">
            <dl className="notifications-hero__summary" aria-label="Notification summary">
              <div>
                <dt>Unread</dt>
                <dd>{unread}</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{notifications.length}</dd>
              </div>
            </dl>
            <button
              type="button"
              disabled={readAll.isPending || unread === 0}
              onClick={() => readAll.mutate()}
              className="notifications-hero__read-all"
            >
              <CheckCheck aria-hidden="true" />
              {readAll.isPending ? "Marking read…" : "Mark all read"}
            </button>
          </div>
        </header>

        {!authRequired && list.isLoading ? (
          <NotificationsLoading />
        ) : authRequired ? (
          <NotificationState
            title="Sign in to see your updates"
            detail="Notification history is private to your authenticated account."
          />
        ) : list.isError ? (
          <NotificationState
            title="Notifications are unavailable"
            detail="Try again to load your durable account updates."
            action={
              <button type="button" onClick={() => void list.refetch()}>
                Try again
              </button>
            }
          />
        ) : notifications.length ? (
          <section className="notifications-inbox" aria-label="Account notifications">
            <div className="notifications-inbox__toolbar">
              <div>
                <p className="notifications-inbox__eyebrow">Your inbox</p>
                <h2>{filter === "UNREAD" ? "Unread updates" : "All updates"}</h2>
              </div>
              <div className="notifications-filter" role="tablist" aria-label="Notification filter">
                {(
                  [
                    ["ALL", `All ${notifications.length}`],
                    ["UNREAD", `Unread ${unread}`],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={filter === value}
                    className={filter === value ? "is-active" : ""}
                    onClick={() => setFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {visibleNotifications.length ? (
              <div className="notifications-inbox__list">
                {visibleNotifications.map((item) => (
                  <NotificationRow
                    key={item.id}
                    item={item}
                    isMutating={read.isPending}
                    onRead={() => read.mutate(item.id)}
                  />
                ))}
              </div>
            ) : (
              <NotificationState
                compact
                title="You’re all caught up"
                detail="There are no unread updates right now."
              />
            )}
          </section>
        ) : (
          <NotificationState
            icon={<Bell aria-hidden="true" />}
            title="Your inbox is clear"
            detail="Durable updates about your account and activity will appear here."
          />
        )}
      </div>
    </main>
  );
}

function NotificationRow({
  item,
  isMutating,
  onRead,
}: {
  item: Notification;
  isMutating: boolean;
  onRead: () => void;
}) {
  const presentation = notificationPresentation(item);
  const Icon = presentation.icon;
  const unread = !item.readAt;
  const title = notificationTitle(item, presentation.title);
  return (
    <button
      type="button"
      disabled={!unread || isMutating}
      onClick={onRead}
      className={`notifications-inbox__row ${unread ? "is-unread" : "is-read"}`}
      aria-label={
        unread
          ? `${presentation.title}. ${title}. Mark this notification as read.`
          : `${presentation.title}. ${title}. Read.`
      }
    >
      <span className={`notifications-inbox__icon is-${presentation.tone}`} aria-hidden="true">
        <Icon />
      </span>
      <span className="notifications-inbox__copy">
        <span className="notifications-inbox__meta">
          <span>{presentation.title}</span>
          <time dateTime={item.createdAt}>{notificationDate(item.createdAt)}</time>
        </span>
        <strong>{title}</strong>
        <span className="notifications-inbox__body">{item.body}</span>
      </span>
      <span className="notifications-inbox__state" aria-hidden="true">
        {unread ? <span>New</span> : <Check />}
      </span>
    </button>
  );
}

function NotificationsLoading() {
  return (
    <section
      className="notifications-inbox notifications-inbox--loading"
      aria-label="Loading notifications"
    >
      <div className="notifications-inbox__toolbar">
        <div>
          <p className="notifications-inbox__eyebrow">Your inbox</p>
          <h2>Loading updates</h2>
        </div>
      </div>
      <div className="notifications-inbox__list">
        {[1, 2, 3, 4].map((item) => (
          <div className="notifications-skeleton" key={item} />
        ))}
      </div>
    </section>
  );
}

function NotificationState({
  icon,
  title,
  detail,
  action,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  detail: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <section className={`notifications-state${compact ? " is-compact" : ""}`}>
      {icon ? <span className="notifications-state__icon">{icon}</span> : null}
      <div>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
      {action ? <div className="notifications-state__action">{action}</div> : null}
    </section>
  );
}

function notificationPresentation(item: Notification): {
  title: string;
  tone: "wallet" | "market" | "collectible" | "orders" | "community" | "account";
  icon: LucideIcon;
} {
  const source = `${item.type} ${item.title} ${item.body}`.toUpperCase();
  if (/(DEPOSIT|WITHDRAWAL|WALLET|PORTFOLIO)/.test(source)) {
    return { title: "Wallet & portfolio", tone: "wallet", icon: WalletCards };
  }
  if (/(SUBMISSION|COLLECTIBLE|INTAKE|CUSTODY|VAULT)/.test(source)) {
    return { title: "Collectibles", tone: "collectible", icon: ClipboardCheck };
  }
  if (/(ORDER|RESERVATION|OFFER|PROPOSAL|EXECUTION)/.test(source)) {
    return { title: "Orders & offers", tone: "orders", icon: ReceiptText };
  }
  if (/(PRICE|MARKET|WATCHLIST)/.test(source)) {
    return { title: "Market watch", tone: "market", icon: TrendingUp };
  }
  if (/(DISCUSSION|COMMENT|REPLY)/.test(source)) {
    return { title: "Community", tone: "community", icon: MessageCircle };
  }
  return { title: "Account", tone: "account", icon: PackageCheck };
}

function notificationTitle(item: Notification, fallback: string) {
  const title = item.title.trim();
  if (/^[A-Z_\s]+$/.test(title)) return `${fallback} update`;
  return title;
}

function notificationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDate(value);

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDifference = Math.round((startOfToday - startOfDate) / 86_400_000);

  if (dayDifference === 0) return "Today";
  if (dayDifference === 1) return "Yesterday";
  return formatDate(date);
}
