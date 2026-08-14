import { useSyncExternalStore } from "react";

import { session } from "./session";

export function useSession() {
  const token = useSyncExternalStore(session.subscribe, session.token, () => null);
  const state = useSyncExternalStore(session.subscribe, session.state, () => "anonymous" as const);
  return {
    isAuthenticated: token !== null,
    isInitializing: state === "initializing",
    state,
  };
}
