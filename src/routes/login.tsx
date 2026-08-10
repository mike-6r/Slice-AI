import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { ApiClient, ApiError } from "@/api/http-client";
import { safeReturnIntent } from "@/auth/return-intent";
import { session } from "@/auth/session";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) =>
    typeof search.returnTo === "string" ? { returnTo: safeReturnIntent(search.returnTo) } : {},
  head: () => ({
    meta: [
      { title: "Log in | Slice" },
      { name: "description", content: "Sign in to your Slice account." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const returnTo = safeReturnIntent(Route.useSearch().returnTo);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showRecovery, setShowRecovery] = useState(false);
  const [twoFactorChallenge, setTwoFactorChallenge] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const valid = /.+@.+\..+/.test(email) && password.length > 0;
  return (
    <div className="auth-shell">
      <section className="auth-intro self-center">
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-accent">
          Account access
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-[-.05em]">
          One Slice account for collecting and investing.
        </h1>
        <p className="mt-4 max-w-md text-sm leading-6 text-subtle">
          Sign in securely with your Slice account.
        </p>
        <p className="mt-6 rounded-lg border border-border bg-surface/60 p-4 text-sm leading-6 text-subtle">
          Your session uses a secure HttpOnly refresh cookie. Your access credential is kept only in
          memory.
        </p>
      </section>
      <section className="auth-card">
        <h2 className="font-display text-2xl font-bold tracking-[-.04em]">Log in</h2>
        <p className="mt-2 text-sm text-subtle">
          Use the email address and password for your Slice account.
        </p>
        <form
          className="mt-7 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!valid) return;
            setSubmitting(true);
            setError(null);
            try {
              const result = await new ApiClient().request<
                | { accessToken: string }
                | { requiresTwoFactor: true; challenge: string; expiresAt: string }
              >("/auth/login", {
                method: "POST",
                body: { email, password },
              });
              if ("requiresTwoFactor" in result) {
                setTwoFactorChallenge(result.challenge);
                return;
              }
              session.set(result.accessToken);
              navigate({ to: returnTo as never });
            } catch (reason) {
              setError(reason instanceof ApiError ? reason.message : "Unable to sign in.");
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <div className="form-field">
            <label htmlFor="email" className="text-sm font-medium">
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="form-control"
            />
          </div>
          <div className="form-field">
            <div className="flex justify-between">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <button
                type="button"
                onClick={() => setShowRecovery((value) => !value)}
                className="text-sm text-accent hover:underline"
              >
                Forgot password?
              </button>
            </div>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Your password"
              className="form-control"
            />
          </div>
          {showRecovery && (
            <div
              role="status"
              className="rounded-md border border-sky/20 bg-sky/5 p-3 text-sm text-subtle"
            >
              Account recovery will connect to email and identity-verification services in a future
              phase.
            </div>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button
            disabled={!valid}
            className="primary-action w-full rounded-md px-4 py-3 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        {twoFactorChallenge ? (
          <form
            className="mt-5 space-y-4 rounded-lg border border-border bg-surface/50 p-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setSubmitting(true);
              setError(null);
              try {
                const result = await new ApiClient().request<{ accessToken: string }>(
                  "/auth/2fa/verify",
                  {
                    method: "POST",
                    body: useRecoveryCode
                      ? { challenge: twoFactorChallenge, recoveryCode: twoFactorCode }
                      : { challenge: twoFactorChallenge, code: twoFactorCode },
                  },
                );
                session.set(result.accessToken);
                navigate({ to: returnTo as never });
              } catch (reason) {
                setError(
                  reason instanceof ApiError
                    ? reason.message
                    : "Unable to verify the authentication code.",
                );
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <h3 className="font-semibold">Two-factor authentication</h3>
            <p className="text-sm text-subtle">
              Enter a code from your authenticator app or a saved recovery code.
            </p>
            <label className="form-field text-sm font-medium">
              {useRecoveryCode ? "Recovery code" : "Authenticator code"}
              <input
                type="text"
                inputMode={useRecoveryCode ? "text" : "numeric"}
                autoComplete="one-time-code"
                value={twoFactorCode}
                onChange={(event) => setTwoFactorCode(event.target.value)}
                className="form-control mt-2"
                required
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setUseRecoveryCode((value) => !value);
                setTwoFactorCode("");
              }}
              className="text-sm text-accent hover:underline"
            >
              {useRecoveryCode ? "Use an authenticator code" : "Use a recovery code"}
            </button>
            <button
              disabled={!twoFactorCode || submitting}
              className="primary-action w-full rounded-md px-4 py-3 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "Verifying…" : "Verify and sign in"}
            </button>
          </form>
        ) : null}
        <p className="mt-5 text-center text-sm text-subtle">
          New to Slice?{" "}
          <Link
            to="/signup"
            search={{ returnTo }}
            className="font-semibold text-accent hover:underline"
          >
            Create an account
          </Link>
        </p>
      </section>
    </div>
  );
}
