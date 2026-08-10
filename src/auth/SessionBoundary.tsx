import { useQueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";

import { ApiClient, API_ORIGIN } from "@/api/http-client";
import { runQaSessionHooks } from "@/auth/qa-session-hooks";
import { clearPrivateQueries } from "./private-cache";
import { session } from "./session";

/** Restores a cookie-backed session once and removes account data when that session ends. */
export function SessionBoundary({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

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

  return children;
}
