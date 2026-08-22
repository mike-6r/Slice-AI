import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, KeyRound } from "lucide-react";
import { useState } from "react";

import { ApiClient, ApiError } from "@/api/http-client";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>) =>
    typeof search.token === "string" && search.token.length >= 40
      ? { token: search.token.slice(0, 256) }
      : { token: null },
  head: () => ({ meta: [{ title: "Reset password | Slice" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { token } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = Boolean(token) && password.length >= 12 && password === confirmation;

  return (
    <main className="auth-shell auth-shell--centered">
      <section className="auth-card auth-card--compact">
        {success ? (
          <>
            <CheckCircle2 className="auth-status-icon auth-status-icon--success" aria-hidden="true" />
            <h1>Password changed</h1>
            <p>Your password was updated and other signed-in sessions were revoked.</p>
            <Link className="auth-submit" to="/login">
              Return to log in
            </Link>
          </>
        ) : !token ? (
          <>
            <KeyRound className="auth-status-icon auth-status-icon--error" aria-hidden="true" />
            <h1>Reset link missing</h1>
            <p>Request a new password reset link from the Slice login page.</p>
            <Link className="auth-submit" to="/login">
              Return to log in
            </Link>
          </>
        ) : (
          <>
            <KeyRound className="auth-status-icon" aria-hidden="true" />
            <h1>Choose a new password</h1>
            <p>Use a strong password you do not use anywhere else. This link can only be used once.</p>
            <form
              className="mt-6 space-y-4 text-left"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!valid) return;
                setSubmitting(true);
                setError(null);
                try {
                  await new ApiClient().request("/auth/password-reset/confirm", {
                    method: "POST",
                    body: { token, newPassword: password },
                  });
                  setSuccess(true);
                } catch (reason) {
                  setError(
                    reason instanceof ApiError
                      ? reason.message
                      : "Unable to reset your password.",
                  );
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              <label className="form-field">
                <span>New password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="form-control"
                  minLength={12}
                  required
                />
              </label>
              <label className="form-field">
                <span>Confirm new password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  className="form-control"
                  minLength={12}
                  required
                />
              </label>
              {password && password.length < 12 ? (
                <p className="text-xs text-subtle">Use at least 12 characters.</p>
              ) : null}
              {confirmation && password !== confirmation ? (
                <p className="form-error">Passwords do not match.</p>
              ) : null}
              {error ? <p className="form-error" role="alert">{error}</p> : null}
              <button
                className="auth-submit w-full disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!valid || submitting}
              >
                {submitting ? "Updating password…" : "Update password"}
              </button>
              <button
                type="button"
                className="w-full text-sm text-subtle hover:text-foreground"
                onClick={() => navigate({ to: "/login" })}
              >
                Cancel
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
