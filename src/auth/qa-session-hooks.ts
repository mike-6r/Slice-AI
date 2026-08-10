import { markQaParallelGetsCompleted, qaSearchFlag, recordQaExpiredToken } from "@/auth/qa-harness";

type QaSessionActions = {
  expireAccessToken: () => void;
  safeGet: (path: string) => Promise<unknown>;
};

/** Runs only the local QA session probes, keeping production session behavior untouched. */
export function runQaSessionHooks({ expireAccessToken, safeGet }: QaSessionActions) {
  if (!qaSearchFlag("qa_expire_token")) return false;

  recordQaExpiredToken();
  expireAccessToken();
  if (qaSearchFlag("qa_parallel_gets")) {
    void Promise.all([safeGet("/me/watchlist"), safeGet("/me/notifications")]).then(
      markQaParallelGetsCompleted,
    );
  }
  return true;
}
