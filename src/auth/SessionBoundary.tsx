import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CircleAlert,
  LockKeyhole,
  LogIn,
  LoaderCircle,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import { ApiClient, API_ORIGIN } from "@/api/http-client";
import { runQaSessionHooks } from "@/auth/qa-session-hooks";
import { SLICE_LOGO_ASSET } from "@/components/layout/navigation-model";
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
  const restoreStatus = useSyncExternalStore(
    session.subscribe,
    session.restoreStatus,
    () => "restoring" as const,
  );
  const [delayed, setDelayed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(() => session.retryAfterSeconds());

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

  useEffect(() => {
    if (restoreStatus !== "restoring") {
      setDelayed(false);
      return;
    }
    const timer = window.setTimeout(() => setDelayed(true), 5500);
    return () => window.clearTimeout(timer);
  }, [restoreStatus]);

  useEffect(() => {
    if (restoreStatus !== "rate_limited") {
      setRetryAfterSeconds(0);
      return;
    }
    const update = () => setRetryAfterSeconds(session.retryAfterSeconds());
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [restoreStatus]);

  const retry = () => {
    if (retrying) return;
    setRetrying(true);
    void session.refresh(API_ORIGIN).finally(() => setRetrying(false));
  };

  const signInAgain = () => {
    session.clear();
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const returnTo = currentPath.startsWith("/") ? currentPath : "/";
    window.location.assign(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  };

  const needsRestoreScreen =
    authState === "initializing" ||
    restoreStatus === "restoring" ||
    restoreStatus === "failed" ||
    restoreStatus === "expired" ||
    restoreStatus === "offline" ||
    restoreStatus === "rate_limited";

  if (needsRestoreScreen) {
    return (
      <SessionRestoreScreen
        status={restoreStatus}
        delayed={delayed}
        retrying={retrying}
        retryAfterSeconds={retryAfterSeconds}
        onRetry={retry}
        onSignInAgain={signInAgain}
      />
    );
  }

  return children;
}

type SessionRestoreScreenProps = {
  status: ReturnType<typeof session.restoreStatus>;
  delayed: boolean;
  retrying: boolean;
  retryAfterSeconds: number;
  onRetry: () => void;
  onSignInAgain: () => void;
};

const restoreSteps = [
  "Verifying session",
  "Restoring workspace",
  "Loading permissions",
  "Preparing your portfolio",
] as const;

/** Branded, bounded restore state shown before the application is allowed to render. */
export function SessionRestoreScreen({
  status,
  delayed,
  retrying,
  retryAfterSeconds,
  onRetry,
  onSignInAgain,
}: SessionRestoreScreenProps) {
  const isRestoring = status === "restoring";
  const isExpired = status === "expired";
  const isOffline = status === "offline";
  const isRateLimited = status === "rate_limited";
  const isFailure = status === "failed" || isExpired || isOffline || isRateLimited;

  const title = isExpired
    ? "Your session has expired"
    : isOffline
      ? "You’re offline"
      : isRateLimited
        ? "Session restore is cooling down"
        : isFailure
          ? "We couldn’t restore your session"
          : "Restoring your secure session";
  const copy = isExpired
    ? "For your security, please sign in again to continue to your workspace."
    : isOffline
      ? "Reconnect to the internet, then try restoring your secure session again."
      : isRateLimited
        ? retryAfterSeconds > 0
          ? `Please wait ${retryAfterSeconds} seconds before trying again. Sign in again if you need immediate access.`
          : "The restore limit has cleared. You can try again once, manually."
        : isFailure
          ? "Your session may have expired, or we may have had trouble reconnecting. You can retry or sign in again."
          : delayed
            ? "This is taking a little longer than expected. We’re still working on it."
            : "We’re securely reconnecting your workspace, permissions, and active session. This usually takes just a few seconds.";

  return (
    <main className="session-restore-page" aria-labelledby="session-restore-title">
      <section
        className="session-restore-card"
        role="status"
        aria-live={isFailure ? "assertive" : "polite"}
      >
        <div className="session-restore-identity">
          <div className="session-restore-brand" aria-label="Slice">
            <img src={SLICE_LOGO_ASSET} alt="" />
            <span>SLICE</span>
          </div>
          <p className="session-restore-eyebrow">
            <LockKeyhole aria-hidden="true" size={13} /> Secure session
          </p>
        </div>
        <h1 id="session-restore-title" className="session-restore-title">
          {title}
        </h1>
        <p className="session-restore-copy">{copy}</p>

        {isRestoring && <div className="session-restore-loader" aria-label="Restoring session" />}

        <div className="session-restore-steps" aria-label="Session restore progress">
          {restoreSteps.map((step, index) => {
            const active = isRestoring && index === 0;
            const error = isFailure && index === 0;
            return (
              <div
                className={`session-restore-step${active ? " is-active" : ""}${error ? " is-error" : ""}`}
                key={step}
              >
                <span className="session-restore-step-icon" aria-hidden="true">
                  {error ? (
                    <CircleAlert size={16} />
                  ) : active ? (
                    <LoaderCircle size={16} />
                  ) : index === 0 && !isRestoring ? (
                    <Check size={16} />
                  ) : (
                    <span />
                  )}
                </span>
                <span>{step}</span>
                <span className="session-restore-step-state">
                  {error
                    ? "Needs attention"
                    : active
                      ? "In progress"
                      : index === 0 && !isRestoring
                        ? "Complete"
                        : "Pending"}
                </span>
              </div>
            );
          })}
        </div>

        {isRestoring && (
          <p className="session-restore-security">
            <LockKeyhole aria-hidden="true" size={14} /> Your session is being restored securely.
          </p>
        )}

        {isRestoring && delayed && (
          <div className="session-restore-help">
            <strong>Still restoring your session</strong>
            <span>
              Network conditions or an expired session can sometimes make this take longer.
            </span>
          </div>
        )}

        {(isFailure || (isRestoring && delayed)) && (
          <div className="session-restore-actions">
            {!isExpired && (
              <button
                className="collector-button collector-button--primary"
                type="button"
                onClick={onRetry}
                disabled={retrying || (isRateLimited && retryAfterSeconds > 0)}
              >
                {isOffline ? <WifiOff size={16} /> : <RefreshCw size={16} />}
                {retrying
                  ? "Trying again…"
                  : isOffline
                    ? "Try again"
                    : isRateLimited && retryAfterSeconds > 0
                      ? `Try again in ${retryAfterSeconds}s`
                      : "Retry restore"}
              </button>
            )}
            <button className="collector-button" type="button" onClick={onSignInAgain}>
              <LogIn size={16} /> Sign in again
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
