import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiClient, ApiError } from "@/api/http-client";
import { useSession } from "@/auth/use-session";
import { queryKeys } from "@/queries/keys";

/** Best-effort realtime companion to durable notification queries. */
const activeStreams = new Set<string>();
// Realtime is opt-in. Durable notification queries remain authoritative, and
// staging keeps the stream feature disabled until the deployment enables it.
const realtimeEnabled = import.meta.env.VITE_REALTIME_ENABLED === "true";

export function useNotificationStream(userId = "current", enabled = true) {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useSession();
  useEffect(() => {
    if (!enabled || !realtimeEnabled || !isAuthenticated || activeStreams.has(userId)) return;
    activeStreams.add(userId);
    const abort = new AbortController();
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let fallbackRefreshed = false;
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications(userId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unread });
    };
    const scheduleReconnect = (status?: number, code?: string) => {
      // Realtime is an optional deployment feature. When it is intentionally
      // disabled, durable notification queries remain the source of truth and
      // retrying only creates noisy 503s in the browser and API logs.
      if (code === "FEATURE_DISABLED") return;
      if (abort.signal.aborted || attempts >= 5) return;
      const exponentialDelay = Math.min(60_000, 1_000 * 2 ** attempts);
      const delay = status === 503 ? Math.max(15_000, exponentialDelay) : exponentialDelay;
      attempts += 1;
      reconnect = setTimeout(connect, delay);
    };
    const connect = () => {
      void new ApiClient()
        .stream(
          "/me/notifications/stream",
          (event) => {
            attempts = 0;
            if (event.type === "notification.created") refresh();
          },
          abort.signal,
        )
        .then(() => scheduleReconnect())
        .catch((error: unknown) => {
          if (!abort.signal.aborted) {
            if (!fallbackRefreshed) {
              fallbackRefreshed = true;
              refresh();
            }
            scheduleReconnect(
              error instanceof ApiError ? error.status : undefined,
              error instanceof ApiError ? error.code : undefined,
            );
          }
        });
    };
    connect();
    return () => {
      abort.abort();
      if (reconnect) clearTimeout(reconnect);
      activeStreams.delete(userId);
    };
  }, [enabled, isAuthenticated, queryClient, userId]);
}
