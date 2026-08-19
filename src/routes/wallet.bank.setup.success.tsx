import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Clock3, ShieldAlert } from "lucide-react";
import { useEffect } from "react";

import { ApiError } from "@/api/http-client";
import { useSession } from "@/auth/use-session";
import { useAppServices } from "@/providers/AppServicesProvider";

export const Route = createFileRoute("/wallet/bank/setup/success")({
  validateSearch: (search: Record<string, unknown>) => ({
    sessionId: typeof search.session_id === "string" ? search.session_id.slice(0, 256) : null,
  }),
  head: () => ({ meta: [{ title: "Bank setup | Slice" }] }),
  component: BankSetupSuccessPage,
});

function BankSetupSuccessPage() {
  const services = useAppServices();
  const { isAuthenticated } = useSession();
  const { sessionId } = Route.useSearch();
  const completion = useMutation({
    mutationFn: (checkoutSessionId: string) =>
      services.providers.completeBankLink({ checkoutSessionId }),
  });

  useEffect(() => {
    if (
      isAuthenticated &&
      sessionId &&
      !completion.isPending &&
      !completion.isSuccess &&
      !completion.error
    ) {
      completion.mutate(sessionId);
    }
  }, [completion, isAuthenticated, sessionId]);

  const errorMessage =
    completion.error instanceof ApiError
      ? completion.error.message
      : "We could not confirm the bank setup. You can return to your wallet and try again.";

  return (
    <main className="auth-shell auth-shell--centered">
      <section className="auth-card auth-card--compact">
        {completion.isSuccess ? (
          <>
            <CheckCircle2
              className="auth-status-icon auth-status-icon--success"
              aria-hidden="true"
            />
            <h1>UK bank connected</h1>
            <p>Your bank mandate is saved securely and can be used for GBP funding.</p>
            <Link className="auth-submit" to="/wallet">
              Return to wallet
            </Link>
          </>
        ) : completion.isPending ? (
          <>
            <Clock3 className="auth-status-icon" aria-hidden="true" />
            <h1>Confirming your bank setup</h1>
            <p>
              We’re securely checking the completed Stripe session. Please keep this window open.
            </p>
          </>
        ) : (
          <>
            <ShieldAlert className="auth-status-icon auth-status-icon--error" aria-hidden="true" />
            <h1>Bank setup needs attention</h1>
            <p>
              {!isAuthenticated
                ? "Sign in again to finish connecting your bank."
                : sessionId
                  ? errorMessage
                  : "The Stripe return link is missing its session."}
            </p>
            <Link className="auth-submit" to="/wallet">
              Return to wallet
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
