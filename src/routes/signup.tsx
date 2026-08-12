import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ApiError } from "@/api/http-client";
import signupCollectibleDisplay from "@/assets/signup-collectible-display.png";
import { TurnstileWidget } from "@/components/auth/TurnstileWidget";
import { safeReturnIntent } from "@/auth/return-intent";
import { session } from "@/auth/session";
import { useSession } from "@/auth/use-session";
import { useAppServices } from "@/providers/AppServicesProvider";
import { queryKeys } from "@/queries/keys";
import { signupSchema, usernameSchema } from "@/validation/schemas";

export const Route = createFileRoute("/signup")({
  validateSearch: (search: Record<string, unknown>) =>
    typeof search.returnTo === "string" ? { returnTo: safeReturnIntent(search.returnTo) } : {},
  head: () => ({
    meta: [
      { title: "Create an account | Slice" },
      { name: "description", content: "Create your secure Slice account." },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const { repositories } = useAppServices();
  const { isAuthenticated } = useSession();
  const returnTo = safeReturnIntent(Route.useSearch().returnTo);
  const policy = useQuery({
    queryKey: queryKeys.auth.signupPolicy,
    queryFn: repositories.auth.getSignupPolicy,
    staleTime: 5 * 60_000,
  });
  const idempotencyKey = useRef<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameAvailability, setUsernameAvailability] = useState<
    "idle" | "checking" | "available" | "unavailable"
  >("idle");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [captchaUnavailable, setCaptchaUnavailable] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated) void navigate({ to: "/onboarding", search: { returnTo } });
  }, [isAuthenticated, navigate, returnTo]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const parsed = signupSchema.safeParse({
      displayName,
      username,
      email,
      password,
      confirmPassword,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the account details and try again.");
      return;
    }
    const currentPolicy = policy.data;
    if (!currentPolicy) {
      setError("Account creation is temporarily unavailable.");
      return;
    }
    if (currentPolicy.captcha.required && !captchaToken.trim()) {
      setError("Complete signup verification before creating your account.");
      return;
    }
    if (currentPolicy.consent.required && !consentAccepted) {
      setError(
        "Please accept the current Terms of Service and Privacy Policy to create an account.",
      );
      return;
    }
    if (
      currentPolicy.consent.required &&
      (!currentPolicy.consent.termsVersion || !currentPolicy.consent.privacyVersion)
    ) {
      setError("Account creation is temporarily unavailable.");
      return;
    }
    setSubmitting(true);
    try {
      idempotencyKey.current ??= crypto.randomUUID();
      const result = await repositories.auth.signup(
        {
          displayName: parsed.data.displayName,
          username: parsed.data.username,
          email: parsed.data.email,
          password: parsed.data.password,
          ...(currentPolicy.captcha.required ? { captchaToken: captchaToken.trim() } : {}),
          ...(currentPolicy.consent.required
            ? {
                consent: {
                  termsAccepted: true as const,
                  privacyAccepted: true as const,
                  termsVersion: currentPolicy.consent.termsVersion!,
                  privacyVersion: currentPolicy.consent.privacyVersion!,
                },
              }
            : {}),
        },
        idempotencyKey.current,
      );
      session.set(result.accessToken);
      await navigate({ to: "/onboarding", search: { returnTo } });
    } catch (reason) {
      setError(signupError(reason));
      if (
        reason instanceof ApiError &&
        ["CAPTCHA_VERIFICATION_FAILED", "CAPTCHA_UNAVAILABLE"].includes(reason.code)
      ) {
        setCaptchaToken("");
        setCaptchaResetKey((value) => value + 1);
      }
      if (reason instanceof ApiError && reason.code !== "NETWORK_ERROR")
        idempotencyKey.current = null;
    } finally {
      setSubmitting(false);
    }
  };

  const captchaProviderUnavailable = Boolean(
    policy.data?.captcha.required && !policy.data.captcha.localTest && !policy.data.captcha.siteKey,
  );

  return (
    <div className="signup-page">
      <section className="signup-hero" aria-labelledby="signup-heading">
        <p className="page-kicker">Slice</p>
        <h1 id="signup-heading" className="signup-hero__title">
          Create your <span>account</span>
        </h1>
        <p className="signup-hero__copy">
          Join Slice and own a piece of authenticated collectibles.
        </p>
        <ul className="signup-benefits" aria-label="Slice account benefits">
          <Benefit
            icon={<Sparkles />}
            title="Authenticated assets"
            detail="Explore published collectible records."
          />
          <Benefit
            icon={<TrendingUp />}
            title="Your portfolio"
            detail="Track the ownership and cash records available to you."
          />
          <Benefit
            icon={<LockKeyhole />}
            title="Secure by design"
            detail="Use protected sessions and optional authenticator security."
          />
          <Benefit
            icon={<UserRound />}
            title="One account"
            detail="Manage your Slice profile and account preferences."
          />
        </ul>
        <div className="signup-collectible" aria-hidden="true">
          <img src={signupCollectibleDisplay} alt="" decoding="async" />
        </div>
      </section>

      <section className="signup-card premium-surface" aria-labelledby="signup-form-heading">
        <h2 id="signup-form-heading">Create your account</h2>
        <p>Use your own email address. Verification happens after your account is created.</p>
        <form className="signup-form" onSubmit={(event) => void submit(event)} noValidate>
          <TextField
            id="signup-display-name"
            label="Display name"
            autoComplete="name"
            value={displayName}
            onChange={setDisplayName}
            placeholder="Your display name"
          />
          <UsernameField
            value={username}
            onChange={(value) => {
              setUsername(value);
              setUsernameAvailability("idle");
            }}
            onCheck={async () => {
              const parsed = usernameSchema.safeParse(username);
              if (!parsed.success) {
                setUsernameAvailability("unavailable");
                return;
              }
              setUsernameAvailability("checking");
              try {
                const result = await repositories.auth.usernameAvailability(parsed.data);
                setUsernameAvailability(result.available ? "available" : "unavailable");
              } catch {
                setUsernameAvailability("idle");
              }
            }}
            availability={usernameAvailability}
          />
          <TextField
            id="signup-email"
            label="Email address"
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
          />
          <PasswordField
            id="signup-password"
            label="Password"
            value={password}
            onChange={setPassword}
            visible={showPassword}
            onVisibleChange={setShowPassword}
          />
          <PasswordRules password={password} />
          <PasswordField
            id="signup-confirm-password"
            label="Confirm password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            visible={showConfirmPassword}
            onVisibleChange={setShowConfirmPassword}
            mismatch={Boolean(confirmPassword && password !== confirmPassword)}
          />

          {policy.isLoading ? (
            <p className="signup-note" role="status">
              Loading secure signup requirements...
            </p>
          ) : null}
          {policy.isError ? (
            <p className="form-error" role="alert">
              Account creation is temporarily unavailable.
            </p>
          ) : null}
          {policy.data?.captcha.required ? (
            policy.data.captcha.localTest ? (
              <TextField
                id="signup-captcha"
                label="Local signup verification proof"
                value={captchaToken}
                onChange={setCaptchaToken}
                placeholder="Enter the configured local proof"
                help="This local development environment requires a valid test proof."
              />
            ) : !captchaProviderUnavailable ? (
              <TurnstileWidget
                siteKey={policy.data.captcha.siteKey!}
                resetKey={captchaResetKey}
                onToken={setCaptchaToken}
                onUnavailable={() => setCaptchaUnavailable(true)}
              />
            ) : (
              <div className="signup-unavailable" role="status">
                <ShieldCheck aria-hidden="true" />
                <span>
                  {captchaProviderUnavailable || captchaUnavailable
                    ? "Account creation is temporarily unavailable."
                    : "Complete the configured signup verification to continue."}
                </span>
              </div>
            )
          ) : null}
          {policy.data?.consent.required ? (
            <label className="signup-consent">
              <input
                type="checkbox"
                checked={consentAccepted}
                onChange={(event) => setConsentAccepted(event.target.checked)}
              />
              <span>
                I agree to the current Terms of Service and acknowledge the Privacy Policy.
              </span>
            </label>
          ) : null}
          {error ? (
            <p role="alert" className="form-error">
              {error}
            </p>
          ) : null}
          <button
            disabled={
              submitting ||
              policy.isLoading ||
              policy.isError ||
              captchaProviderUnavailable ||
              captchaUnavailable
            }
            className="primary-action signup-submit"
          >
            {submitting ? "Creating account..." : "Create account"}
          </button>
        </form>
        <p className="signup-login-link">
          Already have an account?{" "}
          <Link to="/login" search={{ returnTo }}>
            Log in
          </Link>
        </p>
      </section>
    </div>
  );
}

function TextField({
  id,
  label,
  type = "text",
  autoComplete,
  value,
  onChange,
  placeholder,
  help,
}: {
  id: string;
  label: string;
  type?: string;
  autoComplete?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  help?: string;
}) {
  return (
    <label className="form-field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="form-control"
      />
      {help ? <small>{help}</small> : null}
    </label>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  visible,
  onVisibleChange,
  mismatch,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
  mismatch?: boolean;
}) {
  return (
    <label className="form-field" htmlFor={id}>
      <span>{label}</span>
      <span className="password-input">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={mismatch}
          className="form-control"
          placeholder="At least 12 characters"
        />
        <button
          type="button"
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={() => onVisibleChange(!visible)}
        >
          {visible ? <EyeOff /> : <Eye />}
        </button>
      </span>
      {mismatch ? <small className="text-destructive">Passwords do not match.</small> : null}
    </label>
  );
}

function UsernameField({
  value,
  onChange,
  onCheck,
  availability,
}: {
  value: string;
  onChange: (value: string) => void;
  onCheck: () => void;
  availability: "idle" | "checking" | "available" | "unavailable";
}) {
  return (
    <label className="form-field" htmlFor="signup-username">
      <span>Username</span>
      <span className="username-input">
        <b aria-hidden="true">@</b>
        <input
          id="signup-username"
          autoComplete="username"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onCheck}
          placeholder="card_collector"
          className="form-control"
          required
        />
      </span>
      <small className={availability === "available" ? "text-accent" : undefined}>
        {availability === "checking"
          ? "Checking username…"
          : availability === "available"
            ? "Username available"
            : availability === "unavailable" && value
              ? "Username unavailable, too short, or invalid."
              : "3–30 characters. Letters, numbers and underscores."}
      </small>
    </label>
  );
}

function PasswordRules({ password }: { password: string }) {
  const satisfied = password.length >= 12;
  return (
    <p className="password-rule" data-satisfied={satisfied}>
      {" "}
      <ShieldCheck aria-hidden="true" />{" "}
      {satisfied ? "Password meets the 12-character minimum." : "Use at least 12 characters."}
    </p>
  );
}

function Benefit({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <li>
      <span className="signup-benefits__icon">{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
    </li>
  );
}

function signupError(reason: unknown) {
  if (!(reason instanceof ApiError)) return "Unable to create your account. Please try again.";
  if (reason.code === "EMAIL_ALREADY_REGISTERED")
    return "An account already exists for this email address.";
  if (reason.code === "USERNAME_UNAVAILABLE") return "That username is already taken.";
  if (reason.code === "CAPTCHA_UNAVAILABLE") return "Account creation is temporarily unavailable.";
  if (reason.code === "CAPTCHA_VERIFICATION_FAILED")
    return "Signup verification could not be completed.";
  if (reason.code === "RATE_LIMITED") return "Please wait before trying account creation again.";
  return reason.message;
}
