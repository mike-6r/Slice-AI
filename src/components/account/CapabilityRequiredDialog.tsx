import { Link } from "@tanstack/react-router";
import type { AccountCapability } from "@/domain";

const copy: Record<NonNullable<AccountCapability["reason"]>, { title: string; detail: string }> = {
  EMAIL_VERIFICATION_REQUIRED: {
    title: "Verify your email to continue",
    detail: "Email verification is required before you can use this action.",
  },
  PHONE_VERIFICATION_REQUIRED: {
    title: "Verify your phone to continue",
    detail: "Phone verification is required for this action.",
  },
  TWO_FACTOR_REQUIRED: {
    title: "Enable two-factor authentication",
    detail: "Two-factor authentication is required to protect this action.",
  },
  IDENTITY_VERIFICATION_REQUIRED: {
    title: "Complete identity verification",
    detail: "Identity verification is required before this financial action can continue.",
  },
  COMPLIANCE_REVIEW_REQUIRED: {
    title: "Verification is under review",
    detail: "This action is unavailable until the current verification review is complete.",
  },
  ACCOUNT_RESTRICTED: {
    title: "This action is unavailable",
    detail: "Contact support if you believe your account has been restricted in error.",
  },
  ACCOUNT_DEACTIVATED: {
    title: "Your account is deactivated",
    detail: "This action is unavailable while your account is deactivated.",
  },
  ACCOUNT_DELETION_PENDING: {
    title: "Account deletion is in progress",
    detail: "This action is unavailable while your account deletion request is active.",
  },
  ACCOUNT_REVIEW_REQUIRED: {
    title: "Account review required",
    detail: "This action will be available after your account review is complete.",
  },
  FEATURE_DISABLED: {
    title: "This feature is unavailable",
    detail: "This feature is temporarily unavailable. Please try again later.",
  },
};

const actionLabel: Partial<Record<NonNullable<AccountCapability["reason"]>, string>> = {
  EMAIL_VERIFICATION_REQUIRED: "Verify email",
  PHONE_VERIFICATION_REQUIRED: "Verify phone",
  TWO_FACTOR_REQUIRED: "Set up two-factor authentication",
  IDENTITY_VERIFICATION_REQUIRED: "Continue identity verification",
  COMPLIANCE_REVIEW_REQUIRED: "View verification status",
};

export function CapabilityRequiredDialog({
  decision,
  onClose,
}: {
  decision: AccountCapability | null;
  onClose: () => void;
}) {
  if (!decision?.reason) return null;
  const content = copy[decision.reason];
  const returnTo = typeof window === "undefined" ? "/" : window.location.pathname;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/75 p-4 backdrop-blur-sm"
      role="presentation"
    >
      <section
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="capability-required-title"
      >
        <p className="page-kicker">Account access</p>
        <h2 id="capability-required-title" className="mt-2 font-display text-2xl font-bold">
          {content.title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-subtle">{content.detail}</p>
        {decision.requirements.length > 1 ? (
          <ul className="mt-4 space-y-2 text-sm text-subtle">
            {decision.requirements.map((requirement) => (
              <li key={requirement.type}>
                {requirement.satisfied ? "Complete:" : "Required:"}{" "}
                {requirement.type.replaceAll("_", " ").toLowerCase()}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/onboarding"
            search={{ returnTo }}
            className="primary-action px-4 py-2 text-sm font-semibold text-background"
          >
            {actionLabel[decision.reason] ?? "Continue setup"}
          </Link>
          <button type="button" className="secondary-action px-4 py-2 text-sm" onClick={onClose}>
            Not now
          </button>
        </div>
      </section>
    </div>
  );
}
