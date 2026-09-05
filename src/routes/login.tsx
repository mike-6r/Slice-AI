import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { KeyRound, Mail, MessageSquareText, ShieldCheck, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";

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
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoverySubmitted, setRecoverySubmitted] = useState(false);
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);
  const [twoFactorChallenge, setTwoFactorChallenge] = useState<string | null>(null);
  const [twoFactorMethod, setTwoFactorMethod] = useState<"TOTP" | "SMS" | null>(null);
  const [twoFactorPhone, setTwoFactorPhone] = useState<string | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const valid = /.+@.+\..+/.test(email) && password.length > 0;
  const recoveryValid = /.+@.+\..+/.test(recoveryEmail);
  useEffect(() => {
    if (!resendAvailableAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [resendAvailableAt]);
  const resendSeconds = resendAvailableAt
    ? Math.max(0, Math.ceil((new Date(resendAvailableAt).getTime() - now) / 1000))
    : 0;
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
                | {
                    requiresTwoFactor: true;
                    challenge: string;
                    method: "TOTP" | "SMS";
                    phone: string | null;
                    expiresAt: string;
                    resendAvailableAt: string | null;
                  }
              >("/auth/login", {
                method: "POST",
                body: { email, password },
              });
              if ("requiresTwoFactor" in result) {
                setTwoFactorChallenge(result.challenge);
                setTwoFactorMethod(result.method);
                setTwoFactorPhone(result.phone);
                setResendAvailableAt(result.resendAvailableAt);
                setTwoFactorCode("");
                setUseRecoveryCode(false);
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
                onClick={() => {
                  setShowRecovery((value) => !value);
                  setRecoveryEmail(email);
                  setRecoverySubmitted(false);
                }}
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
              className="space-y-3 rounded-md border border-sky/20 bg-sky/5 p-4 text-sm text-subtle"
            >
              <div>
                <p className="font-semibold text-foreground">Reset your password</p>
                <p className="mt-1 leading-5">
                  Enter your email and we&apos;ll send a reset link if the account is eligible.
                </p>
              </div>
              <input
                type="email"
                autoComplete="email"
                value={recoveryEmail}
                onChange={(event) => {
                  setRecoveryEmail(event.target.value);
                  setRecoverySubmitted(false);
                }}
                placeholder="you@example.com"
                aria-label="Recovery email address"
                className="form-control"
              />
              <button
                type="button"
                disabled={!recoveryValid || recoverySubmitting}
                className="secondary-action w-full rounded-md px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                onClick={async () => {
                  setRecoverySubmitting(true);
                  setError(null);
                  try {
                    await new ApiClient().request("/auth/password-reset/request", {
                      method: "POST",
                      body: { email: recoveryEmail },
                    });
                    setRecoverySubmitted(true);
                  } catch (reason) {
                    setError(
                      reason instanceof ApiError
                        ? reason.message
                        : "Unable to request a password reset.",
                    );
                  } finally {
                    setRecoverySubmitting(false);
                  }
                }}
              >
                {recoverySubmitting ? "Sending…" : "Send reset link"}
              </button>
              {recoverySubmitted ? (
                <p className="text-xs leading-5 text-accent" aria-live="polite">
                  If an eligible account exists, reset instructions are on the way.
                </p>
              ) : null}
            </div>
          )}
          {error && !twoFactorChallenge && (
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
            className="login-two-factor mt-5"
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
            <div className="login-two-factor__header">
              <span className="login-two-factor__icon" aria-hidden="true">
                <ShieldCheck />
              </span>
              <div>
                <p className="login-two-factor__eyebrow">Step 2 of 2 · Secure sign-in</p>
                <h3>Verify it&apos;s you</h3>
                <p>
                  Choose the code source for this sign-in. Your password was accepted; your account
                  still needs a second factor.
                </p>
              </div>
            </div>
            <div className="login-factor-grid" aria-label="Verification methods">
              <div className="login-factor-card is-selected">
                <span className="login-factor-card__icon" aria-hidden="true">
                  {twoFactorMethod === "SMS" ? <Smartphone /> : <KeyRound />}
                </span>
                <span>
                  <strong>{twoFactorMethod === "SMS" ? "Text message" : "Authenticator app"}</strong>
                  <small>
                    {twoFactorMethod === "SMS"
                      ? `Code sent to ${twoFactorPhone ?? "your verified phone"}.`
                      : "Use the six-digit code shown in your authenticator app."}
                  </small>
                </span>
                <em>Active method</em>
              </div>
              <button
                type="button"
                className={`login-factor-card ${useRecoveryCode ? "is-selected" : ""}`}
                onClick={() => {
                  setUseRecoveryCode(true);
                  setTwoFactorCode("");
                }}
              >
                <span className="login-factor-card__icon" aria-hidden="true">
                  <KeyRound />
                </span>
                <span>
                  <strong>Recovery code</strong>
                  <small>Use one of your saved backup codes.</small>
                </span>
                {useRecoveryCode ? <em>Selected</em> : null}
              </button>
              <div className="login-factor-card is-unavailable">
                <span className="login-factor-card__icon" aria-hidden="true">
                  <Mail />
                </span>
                <span>
                  <strong>Email confirmation</strong>
                  <small>Email verification is separate from sign-in 2FA.</small>
                </span>
                <em>Unavailable</em>
              </div>
            </div>
            <label className="form-field text-sm font-medium">
              <span>{useRecoveryCode ? "Recovery code" : twoFactorMethod === "SMS" ? "SMS code" : "Authenticator code"}</span>
              <input
                type="text"
                inputMode={useRecoveryCode ? "text" : "numeric"}
                autoComplete="one-time-code"
                value={twoFactorCode}
                onChange={(event) =>
                  setTwoFactorCode(
                    useRecoveryCode
                      ? event.target.value
                      : event.target.value.replace(/\D/g, "").slice(0, 6),
                  )
                }
                className="form-control mt-2"
                required
                autoFocus
              />
            </label>
            {useRecoveryCode ? (
              <button
                type="button"
                onClick={() => {
                  setUseRecoveryCode(false);
                  setTwoFactorCode("");
                }}
                className="login-two-factor__switch"
              >
                <MessageSquareText aria-hidden="true" /> Use your {twoFactorMethod === "SMS" ? "SMS" : "authenticator"} code instead
              </button>
            ) : null}
            {twoFactorMethod === "SMS" && !useRecoveryCode ? (
              <button
                type="button"
                className="login-two-factor__resend text-sm text-accent hover:underline disabled:opacity-50"
                disabled={resendSeconds > 0 || submitting}
                onClick={async () => {
                  try {
                    const result = await new ApiClient().request<{ resendAvailableAt: string }>(
                      "/auth/2fa/resend",
                      {
                        method: "POST",
                        body: { challenge: twoFactorChallenge },
                      },
                    );
                    setResendAvailableAt(result.resendAvailableAt);
                  } catch (reason) {
                    setError(
                      reason instanceof ApiError
                        ? reason.message
                        : "Unable to resend the SMS code.",
                    );
                  }
                }}
              >
                {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : "Resend SMS code"}
              </button>
              ) : null}
            {error && twoFactorChallenge ? (
              <p role="alert" className="login-two-factor__error">
                {error}
              </p>
            ) : null}
            <button
              disabled={!twoFactorCode || submitting}
              className="primary-action login-two-factor__submit w-full rounded-md px-4 py-3 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-40"
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
