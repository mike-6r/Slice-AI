import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";

import { ApiClient, API_ORIGIN } from "@/api/http-client";
import { runQaSessionHooks } from "@/auth/qa-session-hooks";
import { clearPrivateQueries } from "./private-cache";
import { session } from "./session";

/** Restores a cookie-backed session once and removes account data when that session ends. */
export function SessionBoundary({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const authState = useSyncExternalStore(
    session.subscribe,
    session.state,
    () => "initializing" as const,
  );

  useEffect(() => {
    if ((import.meta.env.VITE_DATA_SOURCE ?? "api") === "api") {
      const accessTokenExpired = runQaSessionHooks({
        expireAccessToken: () => session.set("qa-expired-access-token"),
        safeGet: (path) => new ApiClient().get(path),
      });
      if (!accessTokenExpired) {
        void session.refresh(API_ORIGIN);
      }
    }
    return session.subscribe(() => {
      if (session.token() !== null) return;
      clearPrivateQueries(queryClient);
    });
  }, [queryClient]);

  if (authState === "initializing") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-sm text-subtle" role="status">
          Restoring your secure session…
        </p>
      </main>
    );
  }

  return children;
}
