import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, MailWarning } from "lucide-react";
import { useEffect } from "react";

import { ApiError } from "@/api/http-client";
import { useAppServices } from "@/providers/AppServicesProvider";

export const Route = createFileRoute("/verify-email")({
  validateSearch: (search: Record<string, unknown>) =>
    typeof search.token === "string" && search.token.length >= 40
      ? { token: search.token.slice(0, 256) }
      : { token: null },
  head: () => ({ meta: [{ title: "Verify email | Slice" }] }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { repositories } = useAppServices();
  const { token } = Route.useSearch();
  const confirmation = useMutation({
    mutationFn: repositories.account.confirmEmailVerification,
  });

  useEffect(() => {
    if (token && !confirmation.isPending && !confirmation.isSuccess && !confirmation.error)
      confirmation.mutate(token);
  }, [confirmation, token]);

  return (
    <main className="auth-shell auth-shell--centered">
      <section className="auth-card auth-card--compact">
        {confirmation.isSuccess ? (
          <>
            <CheckCircle2
              className="auth-status-icon auth-status-icon--success"
              aria-hidden="true"
            />
            <h1>Email verified</h1>
            <p>Your email address is verified. You can now continue to your Slice account.</p>
            <Link className="auth-submit" to="/onboarding">
              Continue setup
            </Link>
          </>
        ) : confirmation.isPending ? (
          <>
            <MailWarning className="auth-status-icon" aria-hidden="true" />
            <h1>Verifying your email</h1>
            <p>Please wait while we securely confirm this link.</p>
          </>
        ) : (
          <>
            <MailWarning className="auth-status-icon auth-status-icon--error" aria-hidden="true" />
            <h1>We could not verify this email</h1>
            <p>
              {confirmation.error instanceof ApiError
                ? confirmation.error.message
                : "This link is missing, invalid, or has expired."}
            </p>
            <Link className="auth-submit" to="/login">
              Return to log in
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
