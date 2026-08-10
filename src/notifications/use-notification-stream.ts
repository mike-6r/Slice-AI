import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiClient } from "@/api/http-client";
import { useSession } from "@/auth/use-session";
import { queryKeys } from "@/queries/keys";

/** Best-effort realtime companion to durable notification queries. */
export function useNotificationStream(userId = "current") {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useSession();
  useEffect(() => {
    if (!isAuthenticated) return;
    const abort = new AbortController();
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications(userId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unread });
    };
    const connect = () => {
      void new ApiClient()
        .stream(
          "/me/notifications/stream",
          (event) => {
            if (event.type === "notification.created") refresh();
          },
          abort.signal,
        )
        .catch(() => {
          if (!abort.signal.aborted) {
            refresh();
            reconnect = setTimeout(connect, 2_000);
          }
        });
    };
    connect();
    return () => {
      abort.abort();
      if (reconnect) clearTimeout(reconnect);
    };
  }, [isAuthenticated, queryClient, userId]);
}
