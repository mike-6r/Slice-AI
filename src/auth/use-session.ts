import { useSyncExternalStore } from "react";

import { session } from "./session";

export function useSession() {
  const token = useSyncExternalStore(session.subscribe, session.token, () => null);
  return { isAuthenticated: token !== null };
}
