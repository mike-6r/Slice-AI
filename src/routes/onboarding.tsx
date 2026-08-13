import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  KeyRound,
  Mail,
  Phone,
  ShieldCheck,
  Smartphone,
  Fingerprint,
  ExternalLink,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useState } from "react";

import { ApiError, API_ORIGIN } from "@/api/http-client";
import { deriveOnboardingStage } from "@/auth/onboarding-state";
import { safeReturnIntent } from "@/auth/return-intent";
import { session } from "@/auth/session";
import { useSession } from "@/auth/use-session";
import { useAppServices } from "@/providers/AppServicesProvider";
import { queryKeys } from "@/queries/keys";

export const Route = createFileRoute("/onboarding")({
  validateSearch: (search: Record<string, unknown>) =>
    typeof search.returnTo === "string" ? { returnTo: safeReturnIntent(search.returnTo) } : {},
  head: () => ({ meta: [{ title: "Set up your account | Slice" }] }),
  component: OnboardingPage,
});

type Stage =
  "email" | "phone" | "phone-code" | "security" | "authenticator" | "recovery" | "finish";

function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { repositories } = useAppServices();
  const { isAuthenticated } = useSession();
  const returnTo = safeReturnIntent(Route.useSearch().returnTo);
  const [restoringSession, setRestoringSession] = useState(() => session.token() === null);
  const user = useQuery({
    queryKey: queryKeys.user.current,
    queryFn: repositories.users.getCurrentUser,
    enabled: isAuthenticated,
  });
  const email = useQuery({
    queryKey: queryKeys.account.email,
    queryFn: repositories.account.getEmailVerification,
    enabled: isAuthenticated,
  });
  const phone = useQuery({
    queryKey: queryKeys.account.phone,
    queryFn: repositories.account.getPhoneVerification,
    enabled: isAuthenticated,
  });
  const twoFactor = useQuery({
    queryKey: queryKeys.account.twoFactor,
    queryFn: repositories.account.getTwoFactor,
    enabled: isAuthenticated,
  });
  const compliance = useQuery({
    queryKey: ["providers", "compliance"],
    queryFn: repositories.providers.getCompliance,
    enabled: isAuthenticated && returnTo === "/list",
    refetchInterval: (query) =>
      query.state.data?.status === "PENDING" || query.state.data?.status === "REVIEW"
        ? 5_000
        : false,
  });
  const [stage, setStage] = useState<Stage>("email");
  const [bootstrapped, setBootstrapped] = useState(false);
  const [emailSkipped, setEmailSkipped] = useState(false);
  const [phoneSkipped, setPhoneSkipped] = useState(false);
  const [twoFactorSkipped, setTwoFactorSkipped] = useState(false);
  const [sentEmailAt, setSentEmailAt] = useState<string | null>(null);
  const [phoneResendAt, setPhoneResendAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [enrollment, setEnrollment] = useState<Awaited<
    ReturnType<typeof repositories.account.beginTwoFactorEnrollment>
  > | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!restoringSession) return;
    const source = import.meta.env.VITE_DATA_SOURCE ?? "api";
    if (source !== "api") {
      setRestoringSession(false);
      return;
    }
    void session.refresh(API_ORIGIN).finally(() => setRestoringSession(false));
  }, [restoringSession]);

  useEffect(() => {
    if (!restoringSession && !isAuthenticated)
      void navigate({ to: "/login", search: { returnTo } });
  }, [isAuthenticated, navigate, restoringSession, returnTo]);

  useEffect(() => {
    if (!sentEmailAt && !phoneResendAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [phoneResendAt, sentEmailAt]);

  useEffect(() => {
    if (bootstrapped || !user.data || !email.data || !phone.data || !twoFactor.data) return;
    setBootstrapped(true);
    setStage(
      deriveOnboardingStage(email.data.verified, phone.data.verified, twoFactor.data.enabled),
    );
  }, [bootstrapped, email.data, phone.data, twoFactor.data, user.data]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.user.current }),
      queryClient.invalidateQueries({ queryKey: queryKeys.account.email }),
      queryClient.invalidateQueries({ queryKey: queryKeys.account.phone }),
      queryClient.invalidateQueries({ queryKey: queryKeys.account.twoFactor }),
      queryClient.invalidateQueries({ queryKey: queryKeys.account.capabilities }),
    ]);
  };
  const emailSend = useMutation({
    mutationFn: repositories.account.sendEmailVerification,
    onSuccess: (result) => setSentEmailAt(result.resendAvailableAt),
  });
  const phoneSend = useMutation({
    mutationFn: repositories.account.sendPhoneVerification,
    onSuccess: (result) => {
      setPhoneResendAt(result.resendAvailableAt);
      setStage("phone-code");
    },
  });
  const phoneConfirm = useMutation({
    mutationFn: () => repositories.account.confirmPhoneVerification(phoneNumber, phoneCode),
    onSuccess: async () => {
      await refresh();
      setStage("security");
    },
  });
  const beginTotp = useMutation({
    mutationFn: repositories.account.beginTwoFactorEnrollment,
    onSuccess: (result) => {
      setEnrollment(result);
      setStage("authenticator");
    },
  });
  const confirmTotp = useMutation({
    mutationFn: () => repositories.account.confirmTwoFactorEnrollment(totpCode),
    onSuccess: async (result) => {
      setRecoveryCodes(result.recoveryCodes);
      await refresh();
      setStage("recovery");
    },
  });
  const startCompliance = useMutation({
    mutationFn: repositories.providers.startCompliance,
    onSuccess: (value) => {
      void queryClient.invalidateQueries({ queryKey: ["providers", "compliance"] });
      if (value.sessionUrl) window.open(value.sessionUrl, "_blank", "noopener,noreferrer");
    },
  });

  const loading =
    restoringSession ||
    (isAuthenticated && (!user.data || !email.data || !phone.data || !twoFactor.data));
  const resendRemaining = useMemo(() => secondsUntil(sentEmailAt, now), [now, sentEmailAt]);
  const phoneResendRemaining = useMemo(
    () => secondsUntil(phoneResendAt, now),
    [now, phoneResendAt],
  );
  if (restoringSession)
    return (
      <main className="onboarding-page">
        <section className="onboarding-card premium-surface" role="status">
          Restoring your secure session...
        </section>
      </main>
    );
  if (!isAuthenticated)
    return (
      <main className="onboarding-page">
        <OnboardingAccess />
      </main>
    );
  if (loading)
    return (
      <main className="onboarding-page">
        <section className="onboarding-card premium-surface" role="status">
          Loading your secure account setup...
        </section>
      </main>
    );

  const completed = {
    account: true,
    email: email.data!.verified,
    phone: phone.data!.verified,
    security: twoFactor.data!.enabled,
    finish: stage === "finish",
  };
  const active =
    stage === "phone-code"
      ? "phone"
      : stage === "authenticator" || stage === "recovery"
        ? "security"
        : stage;
  const mutationError = [
    emailSend.error,
    phoneSend.error,
    phoneConfirm.error,
    beginTotp.error,
    confirmTotp.error,
    startCompliance.error,
  ].find(Boolean);
  const currentError = error ?? (mutationError ? friendlyError(mutationError) : null);
  const emailAddress = user.data!.email;

  return (
    <main className="onboarding-page">
      <section className="onboarding-card premium-surface" aria-labelledby="onboarding-title">
        <div className="onboarding-brand">
          <span className="onboarding-brand__mark">
            <img src="/favicon.png" alt="" />
          </span>
          <strong>Slice</strong>
          <span>Secure setup</span>
        </div>
        <Progress active={active} completed={completed} />
        {currentError ? (
          <p className="form-error onboarding-error" role="alert">
            {currentError}
          </p>
        ) : null}
        {stage === "email" ? (
          <EmailStep
            email={emailAddress}
            verified={email.data!.verified}
            sentAt={sentEmailAt}
            resendRemaining={resendRemaining}
            sending={emailSend.isPending}
            onSend={() => {
              setError(null);
              emailSend.mutate();
            }}
            onCheck={async () => {
              setError(null);
              await refresh();
              if (
                queryClient.getQueryData<{ verified: boolean }>(queryKeys.account.email)?.verified
              )
                setStage("phone");
              else setError("Your email is not verified yet. Check your inbox and try again.");
            }}
            onSkip={() => {
              setEmailSkipped(true);
              setStage("phone");
            }}
          />
        ) : null}
        {stage === "phone" ? (
          <PhoneStep
            phone={phoneNumber}
            setPhone={setPhoneNumber}
            sending={phoneSend.isPending}
            onSend={() => {
              setError(null);
              phoneSend.mutate(phoneNumber);
            }}
            onSkip={() => {
              setPhoneSkipped(true);
              setStage("security");
            }}
          />
        ) : null}
        {stage === "phone-code" ? (
          <PhoneCodeStep
            code={phoneCode}
            setCode={setPhoneCode}
            phone={phoneNumber}
            verifying={phoneConfirm.isPending}
            resending={phoneSend.isPending}
            resendRemaining={phoneResendRemaining}
            onVerify={() => {
              setError(null);
              phoneConfirm.mutate();
            }}
            onResend={() => {
              setError(null);
              phoneSend.mutate(phoneNumber);
            }}
          />
        ) : null}
        {stage === "security" ? (
          <SecurityStep
            enabled={twoFactor.data!.enabled}
            starting={beginTotp.isPending}
            onBegin={() => {
              setError(null);
              beginTotp.mutate();
            }}
            onSkip={() => {
              setTwoFactorSkipped(true);
              setStage("finish");
            }}
          />
        ) : null}
        {stage === "authenticator" && enrollment ? (
          <AuthenticatorStep
            enrollment={enrollment}
            code={totpCode}
            setCode={setTotpCode}
            confirming={confirmTotp.isPending}
            onConfirm={() => {
              setError(null);
              confirmTotp.mutate();
            }}
            onBack={() => setStage("security")}
          />
        ) : null}
        {stage === "recovery" ? (
          <RecoveryStep codes={recoveryCodes} onSaved={() => setStage("finish")} />
        ) : null}
        {stage === "finish" ? (
          returnTo === "/list" ? (
            <CollectorOnboardingStep
              compliance={compliance.data?.status ?? "NOT_STARTED"}
              loading={compliance.isLoading || startCompliance.isPending}
              onVerify={() => startCompliance.mutate()}
              onStartListing={() => void navigate({ to: "/list" })}
            />
          ) : (
            <FinishStep
              emailVerified={email.data!.verified}
              emailSkipped={emailSkipped}
              phoneVerified={phone.data!.verified}
              phoneSkipped={phoneSkipped}
              twoFactorEnabled={twoFactor.data!.enabled}
              twoFactorSkipped={twoFactorSkipped}
              onContinue={() => void navigate({ to: returnTo as never })}
            />
          )
        ) : null}
      </section>
    </main>
  );
}

function CollectorOnboardingStep({
  compliance,
  loading,
  onVerify,
  onStartListing,
}: {
  compliance: "NOT_STARTED" | "PENDING" | "APPROVED" | "REVIEW" | "REJECTED";
  loading: boolean;
  onVerify: () => void;
  onStartListing: () => void;
}) {
  const verified = compliance === "APPROVED";
  const processing = compliance === "PENDING" || compliance === "REVIEW";
  const label = verified
    ? "Verification complete"
    : processing
      ? "Verification in progress"
      : compliance === "REJECTED"
        ? "Needs attention"
        : "Not started";
  return (
    <Step
      icon={<Fingerprint />}
      title="Become a Collector"
      eyebrow="Collector onboarding"
      lead="Complete the checks below before listing a physical collectible."
    >
      <ol className="onboarding-checklist">
        <li>
          <CheckCircle2 aria-hidden="true" />
          <span>
            <strong>Account</strong>
            <small>Complete</small>
          </span>
        </li>
        <li data-state={verified ? "complete" : "active"}>
          <Fingerprint aria-hidden="true" />
          <span>
            <strong>Identity Verification</strong>
            <small>{label}</small>
          </span>
          {verified ? (
            <span className="onboarding-status">✓</span>
          ) : (
            <button className="primary-action" type="button" disabled={loading} onClick={onVerify}>
              {loading
                ? "Opening…"
                : processing
                  ? "Continue Verification"
                  : compliance === "REJECTED"
                    ? "Try Verification Again"
                    : "Verify Identity"}
              <ExternalLink aria-hidden="true" />
            </button>
          )}
        </li>
        <li>
          <CheckCircle2 aria-hidden="true" />
          <span>
            <strong>Collector Profile</strong>
            <small>Complete your collectible-owner details next.</small>
          </span>
        </li>
        <li>
          <CheckCircle2 aria-hidden="true" />
          <span>
            <strong>Ready to List</strong>
            <small>Start your first submission when verification is complete.</small>
          </span>
        </li>
      </ol>
      <button
        className="primary-action onboarding-cta"
        type="button"
        disabled={!verified}
        onClick={onStartListing}
      >
        Start Listing
      </button>
      <p className="onboarding-field-help">
        Plaid status is confirmed by Slice&apos;s provider authority. Completing the Link flow alone
        does not mark you verified.
      </p>
    </Step>
  );
}

function OnboardingAccess() {
  return (
    <section className="onboarding-card premium-surface">
      <h1>Sign in to set up your account</h1>
      <p>Your onboarding progress is tied to your secure Slice session.</p>
      <Link className="primary-action onboarding-cta" to="/login">
        Log in
      </Link>
    </section>
  );
}

function Progress({
  active,
  completed,
}: {
  active: Exclude<Stage, "phone-code" | "authenticator" | "recovery">;
  completed: Record<"account" | "email" | "phone" | "security" | "finish", boolean>;
}) {
  const steps: Array<{ id: keyof typeof completed; label: string }> = [
    { id: "account", label: "Account" },
    { id: "email", label: "Email" },
    { id: "phone", label: "Phone" },
    { id: "security", label: "Security" },
    { id: "finish", label: "Finish" },
  ];
  return (
    <ol className="onboarding-progress" aria-label="Account setup progress">
      {steps.map((step, index) => (
        <li
          key={step.id}
          data-active={active === step.id}
          data-complete={completed[step.id]}
          aria-current={active === step.id ? "step" : undefined}
        >
          <span>{completed[step.id] ? <Check aria-hidden="true" /> : index + 1}</span>
          <small>{step.label}</small>
        </li>
      ))}
    </ol>
  );
}

function EmailStep({
  email,
  verified,
  sentAt,
  resendRemaining,
  sending,
  onSend,
  onCheck,
  onSkip,
}: {
  email: string;
  verified: boolean;
  sentAt: string | null;
  resendRemaining: number;
  sending: boolean;
  onSend: () => void;
  onCheck: () => void | Promise<void>;
  onSkip: () => void;
}) {
  return (
    <Step
      icon={<Mail />}
      title={verified ? "Your email is verified" : "Verify your email"}
      lead={
        verified ? (
          "Your verified email is ready for secure account access."
        ) : (
          <>
            We&apos;ll send a verification link to <strong>{email}</strong>.
          </>
        )
      }
    >
      <div className="onboarding-callout">
        <CheckCircle2 /> <span>Verification is only complete after the link is confirmed.</span>
      </div>
      {!verified ? (
        <>
          <button
            className="primary-action onboarding-cta"
            disabled={sending || resendRemaining > 0}
            onClick={onSend}
          >
            {sending
              ? "Sending..."
              : resendRemaining > 0
                ? `Resend email (${resendRemaining}s)`
                : sentAt
                  ? "Resend verification email"
                  : "Send verification email"}
          </button>
          <button className="onboarding-link" onClick={() => void onCheck()}>
            I&apos;ve verified my email
          </button>
          <button className="onboarding-link" onClick={onSkip}>
            Verify later
          </button>
        </>
      ) : (
        <button className="primary-action onboarding-cta" onClick={() => void onCheck()}>
          Continue
        </button>
      )}
    </Step>
  );
}

function PhoneStep({
  phone,
  setPhone,
  sending,
  onSend,
  onSkip,
}: {
  phone: string;
  setPhone: (value: string) => void;
  sending: boolean;
  onSend: () => void;
  onSkip: () => void;
}) {
  return (
    <Step
      icon={<Phone />}
      title="Add your phone"
      eyebrow="Optional"
      lead="Add a phone number for account recovery and important security alerts."
    >
      <label className="form-field" htmlFor="onboarding-phone">
        <span>Phone number</span>
        <input
          id="onboarding-phone"
          className="form-control"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="+44 7123 456789"
        />
      </label>
      <button
        className="primary-action onboarding-cta"
        disabled={sending || !phone.trim()}
        onClick={onSend}
      >
        {sending ? "Sending code..." : "Send code"}
      </button>
      <button className="onboarding-link" onClick={onSkip}>
        Skip for now
      </button>
    </Step>
  );
}

function PhoneCodeStep({
  phone,
  code,
  setCode,
  verifying,
  resending,
  resendRemaining,
  onVerify,
  onResend,
}: {
  phone: string;
  code: string;
  setCode: (value: string) => void;
  verifying: boolean;
  resending: boolean;
  resendRemaining: number;
  onVerify: () => void;
  onResend: () => void;
}) {
  return (
    <Step
      icon={<Smartphone />}
      title="Enter verification code"
      lead={
        <>
          Enter the six-digit code sent to <strong>{phone}</strong>.
        </>
      }
    >
      <label className="form-field" htmlFor="onboarding-phone-code">
        <span>Verification code</span>
        <input
          id="onboarding-phone-code"
          className="form-control onboarding-otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          placeholder="000000"
        />
      </label>
      <button
        className="primary-action onboarding-cta"
        disabled={verifying || code.length !== 6}
        onClick={onVerify}
      >
        {verifying ? "Verifying..." : "Verify phone"}
      </button>
      <button
        className="onboarding-link"
        disabled={resending || resendRemaining > 0}
        onClick={onResend}
      >
        {resending
          ? "Sending..."
          : resendRemaining > 0
            ? `Send a new code (${resendRemaining}s)`
            : "Send a new code"}
      </button>
    </Step>
  );
}

function SecurityStep({
  enabled,
  starting,
  onBegin,
  onSkip,
}: {
  enabled: boolean;
  starting: boolean;
  onBegin: () => void;
  onSkip: () => void;
}) {
  return (
    <Step
      icon={<ShieldCheck />}
      title={enabled ? "Your authenticator is enabled" : "Secure your account"}
      eyebrow="Recommended"
      lead="Add an authenticator app for stronger protection on account access and high-value actions."
    >
      <ul className="onboarding-checklist">
        <li>
          <Check /> Protect account access
        </li>
        <li>
          <Check /> Protect high-value actions
        </li>
        <li>
          <Check /> Save recovery codes for backup access
        </li>
      </ul>
      {enabled ? (
        <button className="primary-action onboarding-cta" onClick={onSkip}>
          Continue
        </button>
      ) : (
        <>
          <button className="primary-action onboarding-cta" disabled={starting} onClick={onBegin}>
            {starting ? "Preparing setup..." : "Set up authenticator"}
          </button>
          <button className="onboarding-link" onClick={onSkip}>
            Skip for now
          </button>
        </>
      )}
    </Step>
  );
}

function AuthenticatorStep({
  enrollment,
  code,
  setCode,
  confirming,
  onConfirm,
  onBack,
}: {
  enrollment: { issuer: string; accountLabel: string; manualEntryKey: string; otpauthUri: string };
  code: string;
  setCode: (value: string) => void;
  confirming: boolean;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const copyKey = async () => {
    await navigator.clipboard?.writeText(enrollment.manualEntryKey);
  };
  return (
    <Step
      icon={<KeyRound />}
      title="Set up authenticator app"
      lead="Scan this code with your authenticator app, or enter the setup key manually."
    >
      <div className="authenticator-setup">
        <QRCodeSVG value={enrollment.otpauthUri} size={164} level="M" includeMargin />
        <div>
          <p>
            <strong>1.</strong> Scan with an authenticator app.
          </p>
          <p>
            <strong>2.</strong> Or enter this key manually.
          </p>
          <code>{enrollment.manualEntryKey}</code>
          <button className="onboarding-copy" onClick={() => void copyKey()}>
            <Copy /> Copy setup key
          </button>
        </div>
      </div>
      <label className="form-field" htmlFor="onboarding-totp">
        <span>Six-digit authenticator code</span>
        <input
          id="onboarding-totp"
          className="form-control onboarding-otp"
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          placeholder="000000"
        />
      </label>
      <button
        className="primary-action onboarding-cta"
        disabled={confirming || code.length !== 6}
        onClick={onConfirm}
      >
        {confirming ? "Verifying..." : "Verify and enable"}
      </button>
      <button className="onboarding-link" onClick={onBack}>
        Back
      </button>
    </Step>
  );
}

function RecoveryStep({ codes, onSaved }: { codes: string[]; onSaved: () => void }) {
  const copyCodes = async () => {
    await navigator.clipboard?.writeText(codes.join("\n"));
  };
  const download = () => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([`${codes.join("\n")}\n`], { type: "text/plain" }));
    link.download = "slice-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <Step
      icon={<KeyRound />}
      title="Save your recovery codes"
      lead="These codes can be used if you lose access to your authenticator. They are shown only once."
    >
      <div className="recovery-codes">
        {codes.map((code) => (
          <code key={code}>{code}</code>
        ))}
      </div>
      <div className="recovery-actions">
        <button className="secondary-action" onClick={() => void copyCodes()}>
          <Copy /> Copy
        </button>
        <button className="secondary-action" onClick={download}>
          <Download /> Download
        </button>
      </div>
      <button className="primary-action onboarding-cta" onClick={onSaved}>
        I&apos;ve saved my codes
      </button>
    </Step>
  );
}

function FinishStep({
  emailVerified,
  emailSkipped,
  phoneVerified,
  phoneSkipped,
  twoFactorEnabled,
  twoFactorSkipped,
  onContinue,
}: {
  emailVerified: boolean;
  emailSkipped: boolean;
  phoneVerified: boolean;
  phoneSkipped: boolean;
  twoFactorEnabled: boolean;
  twoFactorSkipped: boolean;
  onContinue: () => void;
}) {
  return (
    <Step
      icon={<CheckCircle2 />}
      title="You're all set!"
      lead="Your account has been created successfully."
    >
      <ul className="onboarding-finish">
        <FinishItem
          complete={emailVerified}
          label={
            emailVerified
              ? "Email verified"
              : emailSkipped
                ? "Email — verify later"
                : "Email not verified"
          }
        />
        <FinishItem
          complete={phoneVerified}
          label={
            phoneVerified ? "Phone verified" : phoneSkipped ? "Phone skipped" : "Phone not added"
          }
        />
        <FinishItem
          complete={twoFactorEnabled}
          label={
            twoFactorEnabled
              ? "Authenticator enabled"
              : twoFactorSkipped
                ? "Authenticator not enabled"
                : "Authenticator not enabled"
          }
        />
      </ul>
      <button className="primary-action onboarding-cta" onClick={onContinue}>
        Continue to dashboard
      </button>
    </Step>
  );
}

function FinishItem({ complete, label }: { complete: boolean; label: string }) {
  return (
    <li data-complete={complete}>
      {complete ? <CheckCircle2 /> : <span aria-hidden="true">{"\u25cb"}</span>}
      {label}
    </li>
  );
}
function Step({
  icon,
  title,
  eyebrow,
  lead,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  eyebrow?: string;
  lead: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="onboarding-step">
      <span className="onboarding-step__icon">{icon}</span>
      {eyebrow ? <p className="page-kicker">{eyebrow}</p> : null}
      <h1 id="onboarding-title">{title}</h1>
      <p className="onboarding-step__lead">{lead}</p>
      <div className="onboarding-step__body">{children}</div>
    </div>
  );
}
function secondsUntil(value: string | null, now = Date.now()) {
  if (!value) return 0;
  return Math.max(0, Math.ceil((new Date(value).getTime() - now) / 1000));
}
function friendlyError(error: unknown) {
  if (!(error instanceof ApiError)) return "We could not complete that secure account action.";
  if (["EMAIL_DELIVERY_UNAVAILABLE", "PHONE_DELIVERY_UNAVAILABLE"].includes(error.code))
    return error.code.startsWith("EMAIL")
      ? "Email verification is temporarily unavailable."
      : "Phone verification delivery is unavailable.";
  if (error.code === "PHONE_VERIFICATION_INVALID")
    return "This verification code is invalid or has expired.";
  if (error.code === "PHONE_VERIFICATION_RESEND_COOLDOWN")
    return "A verification code was recently sent. Please wait before requesting another.";
  if (error.code === "RATE_LIMITED") return "Please wait before trying again.";
  return error.message;
}
