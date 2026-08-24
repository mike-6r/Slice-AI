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
  BANK_ACCOUNT_REQUIRED: {
    title: "Connect a bank account to deposit",
    detail: "A verified UK bank mandate is required before Slice can request a GBP deposit.",
  },
  PAYOUT_ACCOUNT_REQUIRED: {
    title: "Complete payout setup to withdraw",
    detail: "Collector proceeds can be withdrawn after the connected payout account is ready.",
  },
  PAYOUT_ACCOUNT_REVIEW_REQUIRED: {
    title: "Payout setup is under review",
    detail: "You can withdraw collector proceeds after the payout account review is complete.",
  },
  TRADING_UNAVAILABLE: {
    title: "Trading is temporarily unavailable",
    detail: "Slice trading is currently unavailable in this environment.",
  },
  DEPOSITS_UNAVAILABLE: {
    title: "Deposits are temporarily unavailable",
    detail: "Deposits are currently disabled in this environment. No account step is missing.",
  },
  WITHDRAWALS_UNAVAILABLE: {
    title: "Withdrawals are not available for this account",
    detail: "This environment supports withdrawals for collector proceeds only.",
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
  BANK_ACCOUNT_REQUIRED: "Connect a bank account",
  PAYOUT_ACCOUNT_REQUIRED: "Continue payout setup",
  PAYOUT_ACCOUNT_REVIEW_REQUIRED: "View payout status",
  ACCOUNT_REVIEW_REQUIRED: "View account status",
};

const actionHref: Partial<Record<NonNullable<AccountCapability["reason"]>, string>> = {
  EMAIL_VERIFICATION_REQUIRED: "/account#security",
  PHONE_VERIFICATION_REQUIRED: "/account#security",
  TWO_FACTOR_REQUIRED: "/account#security",
  IDENTITY_VERIFICATION_REQUIRED: "/account#identity",
  COMPLIANCE_REVIEW_REQUIRED: "/account#identity",
  BANK_ACCOUNT_REQUIRED: "/wallet",
  PAYOUT_ACCOUNT_REQUIRED: "/wallet",
  PAYOUT_ACCOUNT_REVIEW_REQUIRED: "/wallet",
  ACCOUNT_REVIEW_REQUIRED: "/account",
};

const capabilityLabel = (value: AccountCapability["capability"]) =>
  value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const requirementLabel = (value: string) => {
  const labels: Record<string, string> = {
    EMAIL_VERIFICATION: "Email verification",
    PHONE_VERIFICATION: "Phone verification",
    TWO_FACTOR_AUTHENTICATION: "Two-factor authentication",
    IDENTITY_VERIFICATION: "Identity verification",
    BANK_ACCOUNT: "UK bank account",
    PAYOUT_ACCOUNT: "Payout account",
    ACCOUNT_STATUS: "Active account",
    FEATURE_AVAILABILITY: "Service availability",
    PROVIDER_AVAILABILITY: "Provider availability",
  };
  return labels[value] ?? value.toLowerCase().replaceAll("_", " ");
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
  const incomplete = decision.requirements.filter((requirement) => !requirement.satisfied);
  const completed = decision.requirements.filter((requirement) => requirement.satisfied);
  const visibleIncomplete =
    decision.status === "TEMPORARILY_UNAVAILABLE"
      ? incomplete.filter((requirement) => requirement.type !== "FEATURE_AVAILABILITY")
      : incomplete;
  const action = actionLabel[decision.reason];
  const href = actionHref[decision.reason];
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
        <p className="mt-4 text-sm font-semibold text-foreground">
          Requested feature: {capabilityLabel(decision.capability)}
        </p>
        {completed.length ? (
          <div className="mt-4 text-sm text-subtle">
            <strong className="text-foreground">Completed</strong>
            <ul className="mt-2 space-y-1">
              {completed.map((requirement) => (
                <li key={requirement.type}>✓ {requirementLabel(requirement.type)}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {visibleIncomplete.length ? (
          <div className="mt-4 text-sm text-subtle">
            <strong className="text-foreground">Next requirement</strong>
            <ul className="mt-2 space-y-1">
              {visibleIncomplete.map((requirement) => (
                <li key={requirement.type}>{requirementLabel(requirement.type)}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          {action && href ? (
            <a href={href} className="primary-action px-4 py-2 text-sm font-semibold text-background">
              {action}
            </a>
          ) : null}
          <button type="button" className="secondary-action px-4 py-2 text-sm" onClick={onClose}>
            Not now
          </button>
        </div>
      </section>
    </div>
  );
}
