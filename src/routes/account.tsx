import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bell,
  Building2,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Download,
  KeyRound,
  Landmark,
  LockKeyhole,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { ApiError } from "@/api/http-client";
import { useSession } from "@/auth/use-session";
import type { AccountCapability, BankConnection } from "@/domain";
import { useAppServices } from "@/providers/AppServicesProvider";
import { CurrencySelector } from "@/currency/CurrencySelector";
import type { SupportedCurrency } from "@/data/repositories";
import { queryKeys } from "@/queries/keys";
import { accountStatusLabel, initialsFor, memberSinceLabel } from "./-account-presentation";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: "Account Center | Slice" }] }),
  validateSearch: (search): { sessions?: "all"; discordLink?: string } => ({
    ...(search.sessions === "all" ? { sessions: "all" as const } : {}),
    ...(typeof search.discordLink === "string" ? { discordLink: search.discordLink } : {}),
  }),
  component: AccountPageForTest,
});

const errorCopy = (
  error: unknown,
  fallback = "We could not complete that action. Please retry.",
) =>
  error instanceof ApiError && error.code === "RECENT_AUTH_REQUIRED"
    ? "For your security, sign in again and retry this action."
    : error instanceof ApiError
      ? error.message
      : fallback;
const date = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
      )
    : "Not available";

export function AccountPageForTest() {
  const { sessions: sessionsView, discordLink } = Route.useSearch();
  const { isAuthenticated } = useSession();
  const services = useAppServices();
  const client = useQueryClient();
  const enabled = isAuthenticated;
  const user = useQuery({
    queryKey: queryKeys.user.current,
    queryFn: services.repositories.users.getCurrentUser,
    enabled,
  });
  const email = useQuery({
    queryKey: queryKeys.account.email,
    queryFn: services.repositories.account.getEmailVerification,
    enabled,
  });
  const phone = useQuery({
    queryKey: queryKeys.account.phone,
    queryFn: services.repositories.account.getPhoneVerification,
    enabled,
  });
  const twoFactor = useQuery({
    queryKey: queryKeys.account.twoFactor,
    queryFn: services.repositories.account.getTwoFactor,
    enabled,
  });
  const capabilities = useQuery({
    queryKey: queryKeys.account.capabilities,
    queryFn: services.account.capabilities,
    enabled,
  });
  const sessions = useQuery({
    queryKey: queryKeys.account.sessions,
    queryFn: services.repositories.account.listSessions,
    enabled,
  });
  const preferences = useQuery({
    queryKey: queryKeys.account.preferences,
    queryFn: services.repositories.account.getPreferences,
    enabled,
  });
  const notificationPreferences = useQuery({
    queryKey: queryKeys.account.notificationPreferences,
    queryFn: services.repositories.account.getNotificationPreferences,
    enabled,
  });
  const activity = useQuery({
    queryKey: queryKeys.account.activity(),
    queryFn: () => services.repositories.account.getActivity({ limit: 10 }),
    enabled,
  });
  const deletion = useQuery({
    queryKey: queryKeys.account.deletion,
    queryFn: services.repositories.account.getDeletionRequest,
    enabled,
  });
  const banks = useQuery({
    queryKey: queryKeys.providers.bankConnections,
    queryFn: services.providers.bankConnections,
    enabled,
  });
  const discord = useQuery({
    queryKey: queryKeys.user.discordLink,
    queryFn: services.repositories.users.getDiscordLink,
    enabled,
  });
  const consumeDiscordLink = useMutation({
    mutationFn: services.repositories.users.consumeDiscordBotLink,
    onSuccess: () => {
      refresh();
      globalThis.history.replaceState({}, "", "/account");
    },
  });
  const [consumedChallenge, setConsumedChallenge] = useState<string | null>(null);
  useEffect(() => {
    if (!discordLink || discordLink === consumedChallenge) return;
    setConsumedChallenge(discordLink);
    void consumeDiscordLink.mutateAsync(discordLink).catch(() => undefined);
  }, [consumeDiscordLink, consumedChallenge, discordLink]);
  const refresh = () => void client.invalidateQueries({ queryKey: ["account"] });
  const showAllSessions = sessionsView === "all";

  if (!isAuthenticated || (user.error instanceof ApiError && user.error.status === 401))
    return <AccessRequired />;
  if (user.isLoading) return <Loading />;
  if (!user.data) return <PageError retry={() => void user.refetch()} />;
  const linkedCount =
    Number(Boolean(discord.data?.connected)) +
    (banks.data?.filter((bank) => bank.status === "CONNECTED").length ?? 0);
  return (
    <main className="account-page">
      <div className="page-shell account-shell">
        <header className="account-heading" id="overview">
          <p className="page-kicker">Account</p>
          <h1>Account Center</h1>
          <p>Manage your account, security, preferences and activity in one place.</p>
          <span className="account-standing">
            <CheckCircle2 aria-hidden="true" />
            {accountStatusLabel(user.data.accountStatus)}
          </span>
        </header>
        <div className="account-layout">
          <AccountSidebar />
          <div className="account-content">
            <section className="account-kpis" aria-label="Account status">
              <Kpi
                icon={<UserRound />}
                label="Account role"
                value={user.data.roles.map(accountStatusLabel).join(", ") || "Member"}
                detail={accountStatusLabel(user.data.accountStatus)}
              />
              <Kpi
                icon={<Mail />}
                label="Email verification"
                value={email.data?.verified ? "Verified" : "Not verified"}
                detail={user.data.email}
              />
              <Kpi
                icon={<ShieldCheck />}
                label="Two-factor auth"
                value={twoFactor.data?.enabled ? "Enabled" : "Not enabled"}
                detail={
                  twoFactor.data?.enabledAt
                    ? `Enabled ${date(twoFactor.data.enabledAt)}`
                    : "Add an authenticator app"
                }
              />
              <Kpi
                icon={<Building2 />}
                label="Linked accounts"
                value={`${linkedCount} connected`}
                detail={linkedCount ? "Discord and bank connections" : "No accounts connected"}
              />
            </section>
            <div className="account-center-grid">
              <ProfilePanel
                user={user.data}
                onUpdated={() =>
                  void client.invalidateQueries({ queryKey: queryKeys.user.current })
                }
              />
              <SecurityPanel email={email} phone={phone} twoFactor={twoFactor} refresh={refresh} />
              <AccountAccessPanel query={capabilities} />
              <SessionsPanel sessions={sessions} refresh={refresh} showAll={showAllSessions} />
              <LinkedPanel
                banks={banks}
                discord={discord}
                refresh={refresh}
                botLinkError={consumeDiscordLink.error}
                botLinkPending={consumeDiscordLink.isPending}
              />
              <PreferencesPanel query={preferences} refresh={refresh} />
              <NotificationPreferencesPanel query={notificationPreferences} refresh={refresh} />
              <ActivityPanel query={activity} />
              <DataPanel refresh={refresh} />
              <DangerPanel deletion={deletion} refresh={refresh} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function AccountAccessPanel({
  query,
}: {
  query: UseQueryResult<{ capabilities: AccountCapability[] }>;
}) {
  const shown = ["PLACE_BUY_ORDER", "DEPOSIT_FUNDS", "WITHDRAW_FUNDS"] as const;
  return (
    <Panel
      id="access"
      title="Security & access"
      detail="Your available features are based on your live account and verification state."
      className="account-panel--access"
    >
      {query.isLoading ? <p className="text-sm text-subtle">Checking available features…</p> : null}
      {query.isError ? (
        <p className="text-sm text-subtle">Feature access could not be loaded right now.</p>
      ) : null}
      {query.data ? (
        <ul className="account-access-list">
          {shown.map((capability) => {
            const item = query.data!.capabilities.find((entry) => entry.capability === capability);
            return (
              <li key={capability}>
                <span className="account-security-icon" aria-hidden="true">
                  {item?.allowed ? (
                    <CheckCircle2 aria-hidden="true" />
                  ) : (
                    <CircleAlert aria-hidden="true" />
                  )}
                </span>
                <div>
                  <strong>{capabilityLabel(capability)}</strong>
                  <small>{capabilityRequirement(item)}</small>
                </div>
                <span className={item?.allowed ? "account-good" : "account-blocked"}>
                  {item?.allowed ? "Available" : "Blocked"}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      <Link to="/onboarding" className="account-panel-link">
        Continue account setup
      </Link>
    </Panel>
  );
}

function capabilityLabel(capability: AccountCapability["capability"]) {
  return capability
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function capabilityRequirement(item: AccountCapability | undefined) {
  if (!item) return "Capability unavailable";
  if (item.allowed) return "No additional verification required";

  const missing = item.requirements.filter((requirement) => !requirement.satisfied);
  if (missing.length) {
    return `${missing.map((requirement) => capabilityRequirementLabel(requirement.type)).join(" + ")} required`;
  }
  return item.reason ? capabilityRequirementLabel(item.reason) : "Requirements not met";
}

function capabilityRequirementLabel(value: string) {
  const labels: Record<string, string> = {
    EMAIL_VERIFICATION: "Email verification",
    PHONE_VERIFICATION: "Phone verification",
    TWO_FACTOR_AUTHENTICATION: "Two-factor authentication",
    IDENTITY_VERIFICATION: "Identity verification",
    ACCOUNT_STATUS: "Active account",
    FEATURE_AVAILABILITY: "Feature availability",
    EMAIL_VERIFICATION_REQUIRED: "Email verification required",
    PHONE_VERIFICATION_REQUIRED: "Phone verification required",
    TWO_FACTOR_REQUIRED: "Two-factor authentication required",
    IDENTITY_VERIFICATION_REQUIRED: "Identity verification required",
    COMPLIANCE_REVIEW_REQUIRED: "Compliance review required",
    ACCOUNT_RESTRICTED: "Account restricted",
    ACCOUNT_DEACTIVATED: "Account deactivated",
    ACCOUNT_DELETION_PENDING: "Account deletion pending",
    ACCOUNT_REVIEW_REQUIRED: "Account review required",
    FEATURE_DISABLED: "Feature unavailable",
  };
  if (labels[value]) return labels[value];
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace("two factor", "two-factor")
    .replace("identity verification", "identity verification")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function AccountSidebar() {
  const items = [
    ["Overview", "#overview"],
    ["Profile", "#profile"],
    ["Security", "#security"],
    ["Sessions", "#sessions"],
    ["Linked Accounts", "#linked"],
    ["Preferences", "#preferences"],
    ["Notifications", "#notification-preferences"],
    ["Activity", "#activity"],
    ["Your Data", "#data"],
  ];
  return (
    <aside className="account-sidebar" aria-label="Account center navigation">
      <p className="account-sidebar__section">Account Center</p>
      <nav>
        {items.map(([label, href], index) => (
          <a
            key={href}
            className={`account-sidebar__item ${index === 0 ? "is-active" : ""}`}
            href={href}
          >
            {label}
          </a>
        ))}
        <p className="account-sidebar__section account-sidebar__section--danger">Danger zone</p>
        <a className="account-sidebar__item account-sidebar__item--danger" href="#danger">
          Deactivate account
        </a>
        <a className="account-sidebar__item account-sidebar__item--danger" href="#danger">
          Request deletion
        </a>
      </nav>
    </aside>
  );
}
function Kpi({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="account-kpi">
      <span className="account-kpi__icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}
function Panel({
  id,
  title,
  detail,
  children,
  className = "",
}: {
  id: string;
  title: string;
  detail?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`account-panel ${className}`} id={id}>
      <header className="account-panel__heading">
        <h2>{title}</h2>
        {detail ? <p>{detail}</p> : null}
      </header>
      {children}
    </section>
  );
}

function ProfilePanel({
  user,
  onUpdated,
}: {
  user: Awaited<
    ReturnType<ReturnType<typeof useAppServices>["repositories"]["users"]["getCurrentUser"]>
  >;
  onUpdated: () => void;
}) {
  const { repositories } = useAppServices();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user.profile.displayName);
  const [username, setUsername] = useState(user.profile.username ?? "");
  const nextUsernameChange = usernameChangeEligibleAt(user.profile.usernameChangedAt);
  const usernameLocked = Boolean(user.profile.username && nextUsernameChange);
  const update = useMutation({
    mutationFn: repositories.users.updateCurrentProfile,
    onSuccess: () => {
      onUpdated();
      setEditing(false);
    },
  });
  return (
    <Panel
      id="profile"
      title="Profile"
      detail="Your private profile information."
      className="account-panel--profile"
    >
      <div className="account-panel__heading-row">
        <span />
        <button
          type="button"
          className="account-inline-button"
          onClick={() => setEditing(!editing)}
        >
          {editing ? "Cancel" : user.profile.username ? "Edit profile" : "Choose username"}
        </button>
      </div>
      <div className="account-profile-grid">
        <div className="account-avatar" aria-label="Profile initials">
          {initialsFor(user.profile.displayName, user.email)}
        </div>
        {editing ? (
          <form
            className="account-profile-form"
            onSubmit={(event) => {
              event.preventDefault();
              update.mutate({ displayName, username: username || undefined });
            }}
          >
            <label>
              Display name
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                required
              />
            </label>
            <label>
              Username
              <span className="account-username-input">
                <b aria-hidden="true">@</b>
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Choose username"
                  disabled={usernameLocked}
                  required={!user.profile.username}
                />
              </span>
              <small>
                {usernameLocked
                  ? `You can change your username again on ${usernameDateLabel(nextUsernameChange!)}.`
                  : "3–30 characters. Letters, numbers and underscores."}
              </small>
            </label>
            <button className="account-primary" disabled={update.isPending}>
              {update.isPending ? "Saving…" : "Save profile"}
            </button>
            {update.error ? <p className="account-form-error">{errorCopy(update.error)}</p> : null}
          </form>
        ) : (
          <dl>
            <Definition label="Display name" value={user.profile.displayName} />
            <Definition
              label="Username"
              value={user.profile.username ? `@${user.profile.username}` : "Not set"}
              muted={!user.profile.username}
            />
            <Definition label="Email" value={user.email} />
            <Definition label="Phone" value="Manage in Security" muted />
            <Definition label="Member since" value={memberSinceLabel(user.createdAt)} />
            <Definition label="Country" value={user.profile.countryCode} />
            <Definition label="Timezone" value={user.profile.timezone} />
          </dl>
        )}
      </div>
    </Panel>
  );
}

function usernameChangeEligibleAt(changedAt: string | null) {
  if (!changedAt) return null;
  const eligible = new Date(changedAt);
  eligible.setUTCDate(eligible.getUTCDate() + 30);
  return eligible > new Date() ? eligible : null;
}

function usernameDateLabel(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

function SecurityPanel({
  email,
  phone,
  twoFactor,
  refresh,
}: {
  email: ReturnType<typeof useQuery<{ verified: boolean; verifiedAt: string | null }>>;
  phone: ReturnType<
    typeof useQuery<{ phone: string | null; verified: boolean; verifiedAt: string | null }>
  >;
  twoFactor: ReturnType<typeof useQuery<{ enabled: boolean; enabledAt: string | null }>>;
  refresh: () => void;
}) {
  const { repositories } = useAppServices();
  const [mode, setMode] = useState<"password" | "phone" | "twofactor" | "codes" | null>(null);
  const sendEmail = useMutation({
    mutationFn: repositories.account.sendEmailVerification,
    onSuccess: refresh,
  });
  return (
    <Panel
      id="security"
      title="Security"
      detail="Protect your account with verified contact details and two-factor authentication."
      className="account-panel--security"
    >
      <div className="account-security-list">
        <SecurityRow
          icon={<LockKeyhole />}
          label="Password"
          value="Use a strong, unique password"
          action="Change"
          onClick={() => setMode("password")}
        />
        <SecurityRow
          icon={<Mail />}
          label="Email verification"
          value={email.data?.verified ? "Verified" : "Not verified"}
          action={email.data?.verified ? undefined : sendEmail.isPending ? "Sending…" : "Verify"}
          onClick={email.data?.verified ? undefined : () => sendEmail.mutate()}
          good={email.data?.verified}
        />
        <SecurityRow
          icon={<Phone />}
          label="Phone verification"
          value={phone.data?.verified ? (phone.data.phone ?? "Verified") : "Not verified"}
          action="Manage"
          onClick={() => setMode("phone")}
          good={phone.data?.verified}
        />
        <SecurityRow
          icon={<ShieldCheck />}
          label="Two-factor authentication"
          value={twoFactor.data?.enabled ? "Authenticator app enabled" : "Not enabled"}
          action={twoFactor.data?.enabled ? "Manage" : "Enable"}
          onClick={() => setMode("twofactor")}
          good={twoFactor.data?.enabled}
        />
        <SecurityRow
          icon={<KeyRound />}
          label="Recovery codes"
          value={twoFactor.data?.enabled ? "Regenerate if needed" : "Enable two-factor first"}
          action={twoFactor.data?.enabled ? "Regenerate" : undefined}
          onClick={() => setMode("codes")}
        />
      </div>
      {sendEmail.error ? (
        <p className="account-form-error">
          {errorCopy(sendEmail.error, "Email verification delivery is currently unavailable.")}
        </p>
      ) : null}
      {mode === "password" ? <PasswordDialog close={() => setMode(null)} /> : null}
      {mode === "phone" ? <PhoneDialog close={() => setMode(null)} refresh={refresh} /> : null}
      {mode === "twofactor" ? (
        <TwoFactorDialog
          enabled={Boolean(twoFactor.data?.enabled)}
          close={() => setMode(null)}
          refresh={refresh}
        />
      ) : null}
      {mode === "codes" ? <RecoveryDialog close={() => setMode(null)} /> : null}
    </Panel>
  );
}
function SecurityRow({
  icon,
  label,
  value,
  action,
  onClick,
  good,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  action?: string;
  onClick?: () => void;
  good?: boolean;
}) {
  return (
    <div className="account-security-row">
      <span className="account-security-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <strong>{label}</strong>
        <small>{value}</small>
      </div>
      {good ? <CheckCircle2 className="account-good-icon" aria-label="Verified" /> : null}
      {action ? (
        <button type="button" className="account-inline-button" onClick={onClick}>
          {action}
        </button>
      ) : null}
    </div>
  );
}
function PasswordDialog({ close }: { close: () => void }) {
  const { repositories } = useAppServices();
  const [currentPassword, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const mutation = useMutation({
    mutationFn: repositories.account.changePassword,
    onSuccess: close,
  });
  return (
    <Dialog title="Change password" close={close}>
      <form
        className="account-dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (next === confirm) mutation.mutate({ currentPassword, newPassword: next });
        }}
      >
        <label>
          Current password
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </label>
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </label>
        {next && confirm && next !== confirm ? (
          <p className="account-form-error">Passwords do not match.</p>
        ) : null}
        {mutation.error ? <p className="account-form-error">{errorCopy(mutation.error)}</p> : null}
        <button className="account-primary" disabled={mutation.isPending || next !== confirm}>
          {mutation.isPending ? "Changing…" : "Change password"}
        </button>
        <p className="account-dialog-note">
          Other signed-in devices will be revoked after a successful password change.
        </p>
      </form>
    </Dialog>
  );
}
function PhoneDialog({ close, refresh }: { close: () => void; refresh: () => void }) {
  const { repositories } = useAppServices();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const send = useMutation({
    mutationFn: repositories.account.sendPhoneVerification,
    onSuccess: () => setSent(true),
  });
  const confirm = useMutation({
    mutationFn: () => repositories.account.confirmPhoneVerification(phone, code),
    onSuccess: () => {
      refresh();
      close();
    },
  });
  return (
    <Dialog title="Verify phone number" close={close}>
      <form
        className="account-dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (sent) confirm.mutate();
          else send.mutate(phone);
        }}
      >
        <label>
          Phone number
          <input
            type="tel"
            autoComplete="tel"
            placeholder="+44…"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </label>
        {sent ? (
          <label>
            Six-digit code
            <input
              inputMode="numeric"
              pattern="[0-9]{6}"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </label>
        ) : null}
        {send.error || confirm.error ? (
          <p className="account-form-error">
            {errorCopy(
              send.error ?? confirm.error,
              "Phone verification delivery is currently unavailable.",
            )}
          </p>
        ) : null}
        <button className="account-primary" disabled={send.isPending || confirm.isPending}>
          {sent
            ? confirm.isPending
              ? "Confirming…"
              : "Confirm phone"
            : send.isPending
              ? "Sending…"
              : "Send code"}
        </button>
        {sent ? (
          <button type="button" className="account-text-button" onClick={() => send.mutate(phone)}>
            Resend code
          </button>
        ) : null}
      </form>
    </Dialog>
  );
}
function TwoFactorDialog({
  enabled,
  close,
  refresh,
}: {
  enabled: boolean;
  close: () => void;
  refresh: () => void;
}) {
  const { repositories } = useAppServices();
  const [enrollment, setEnrollment] = useState<{
    issuer: string;
    accountLabel: string;
    manualEntryKey: string;
    otpauthUri: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const begin = useMutation({
    mutationFn: repositories.account.beginTwoFactorEnrollment,
    onSuccess: setEnrollment,
  });
  const confirm = useMutation({
    mutationFn: () => repositories.account.confirmTwoFactorEnrollment(code),
    onSuccess: ({ recoveryCodes }) => {
      setRecovery(recoveryCodes);
      refresh();
    },
  });
  const disable = useMutation({
    mutationFn: () => repositories.account.disableTwoFactor({ code }),
    onSuccess: () => {
      refresh();
      close();
    },
  });
  if (recovery)
    return (
      <Dialog
        title="Save recovery codes"
        close={() => {
          setRecovery(null);
          close();
        }}
      >
        <p className="account-dialog-note">
          These codes are shown once. Store them somewhere safe before continuing.
        </p>
        <pre className="account-recovery-codes">{recovery.join("\n")}</pre>
        <button
          className="account-primary"
          onClick={() => {
            setRecovery(null);
            close();
          }}
        >
          I saved these codes
        </button>
      </Dialog>
    );
  if (enabled)
    return (
      <Dialog title="Disable two-factor authentication" close={close}>
        <form
          className="account-dialog-form"
          onSubmit={(e) => {
            e.preventDefault();
            disable.mutate();
          }}
        >
          <p className="account-dialog-note">
            Enter a current authenticator code to disable two-factor authentication.
          </p>
          <label>
            Authenticator code
            <input
              inputMode="numeric"
              pattern="[0-9]{6}"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </label>
          {disable.error ? <p className="account-form-error">{errorCopy(disable.error)}</p> : null}
          <button className="account-danger-button" disabled={disable.isPending}>
            Disable two-factor authentication
          </button>
        </form>
      </Dialog>
    );
  return (
    <Dialog title="Set up two-factor authentication" close={close}>
      {!enrollment ? (
        <>
          <p className="account-dialog-note">
            Generate a setup key, add it to an authenticator app, then confirm its six-digit code.
          </p>
          <button
            className="account-primary"
            onClick={() => begin.mutate()}
            disabled={begin.isPending}
          >
            {begin.isPending ? "Preparing…" : "Start setup"}
          </button>
          {begin.error ? <p className="account-form-error">{errorCopy(begin.error)}</p> : null}
        </>
      ) : (
        <form
          className="account-dialog-form"
          onSubmit={(e) => {
            e.preventDefault();
            confirm.mutate();
          }}
        >
          <p className="account-dialog-note">Account: {enrollment.accountLabel}</p>
          <code className="account-manual-key">{enrollment.manualEntryKey}</code>
          <a className="account-text-button" href={enrollment.otpauthUri}>
            Open authenticator app
          </a>
          <label>
            Authenticator code
            <input
              inputMode="numeric"
              pattern="[0-9]{6}"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </label>
          {confirm.error ? <p className="account-form-error">{errorCopy(confirm.error)}</p> : null}
          <button className="account-primary" disabled={confirm.isPending}>
            Confirm and enable
          </button>
        </form>
      )}
    </Dialog>
  );
}
function RecoveryDialog({ close }: { close: () => void }) {
  const { repositories } = useAppServices();
  const [codes, setCodes] = useState<string[] | null>(null);
  const mutation = useMutation({
    mutationFn: repositories.account.regenerateRecoveryCodes,
    onSuccess: ({ recoveryCodes }) => setCodes(recoveryCodes),
  });
  return (
    <Dialog title="Regenerate recovery codes" close={close}>
      {codes ? (
        <>
          <p className="account-dialog-note">
            Your old unused codes are now invalid. Save these new codes now.
          </p>
          <pre className="account-recovery-codes">{codes.join("\n")}</pre>
          <button className="account-primary" onClick={close}>
            I saved these codes
          </button>
        </>
      ) : (
        <>
          <p className="account-dialog-note">This invalidates existing unused recovery codes.</p>
          {mutation.error ? (
            <p className="account-form-error">{errorCopy(mutation.error)}</p>
          ) : null}
          <button
            className="account-primary"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Generating…" : "Regenerate codes"}
          </button>
        </>
      )}
    </Dialog>
  );
}

function SessionsPanel({
  sessions,
  refresh,
  showAll,
}: {
  sessions: ReturnType<
    typeof useQuery<{
      sessions: Array<{
        reference: string;
        currentSession: boolean;
        createdAt: string;
        lastUsedAt: string;
        expiresAt: string;
        deviceLabel: string | null;
      }>;
    }>
  >;
  refresh: () => void;
  showAll: boolean;
}) {
  const { repositories } = useAppServices();
  const revoke = useMutation({
    mutationFn: repositories.account.revokeSession,
    onSuccess: refresh,
  });
  const revokeOthers = useMutation({
    mutationFn: repositories.account.revokeOtherSessions,
    onSuccess: refresh,
  });
  const ordered = sessions.data?.sessions ? orderSessions(sessions.data.sessions) : [];
  const visible = showAll ? ordered : ordered.slice(0, 3);
  return (
    <Panel
      id="sessions"
      title="Sessions & devices"
      detail={
        showAll
          ? "All signed-in sessions on your account."
          : "A summary of signed-in sessions on your account."
      }
      className="account-panel--sessions"
    >
      <div className="account-session-actions">
        <button
          type="button"
          className="account-text-button"
          onClick={() => revokeOthers.mutate()}
          disabled={revokeOthers.isPending}
        >
          Log out all other devices
        </button>
      </div>
      {sessions.isLoading ? (
        <Rows />
      ) : sessions.error ? (
        <Retry detail="Unable to load sessions." retry={() => void sessions.refetch()} />
      ) : ordered.length ? (
        <ul className="account-session-list">
          {visible.map((item) => (
            <li key={item.reference}>
              <Smartphone aria-hidden="true" />
              <div>
                <strong>{item.deviceLabel ?? "Browser session"}</strong>
                <small>
                  {item.currentSession ? "This device · " : ""}Last active {date(item.lastUsedAt)}
                </small>
              </div>
              {item.currentSession ? (
                <span className="account-good">Current</span>
              ) : (
                <button
                  type="button"
                  className="account-inline-button"
                  onClick={() => revoke.mutate(item.reference)}
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="account-empty">No active sessions found.</p>
      )}
      {!showAll && ordered.length > 3 ? (
        <a href="/account?sessions=all#sessions" className="account-text-button">
          View all sessions →
        </a>
      ) : null}
      {showAll ? (
        <a href="/account#overview" className="account-text-button">
          Back to account overview
        </a>
      ) : null}
      {revoke.error || revokeOthers.error ? (
        <p className="account-form-error">{errorCopy(revoke.error ?? revokeOthers.error)}</p>
      ) : null}
    </Panel>
  );
}
function orderSessions<T extends { currentSession: boolean; lastUsedAt: string }>(sessions: T[]) {
  const current = sessions.filter((item) => item.currentSession);
  const other = sessions
    .filter((item) => !item.currentSession)
    .sort((left, right) => Date.parse(right.lastUsedAt) - Date.parse(left.lastUsedAt));
  return [...current, ...other];
}
type DiscordLink = {
  connected: boolean;
  configured: boolean;
  username: string | null;
  displayName: string | null;
  linkedAt: string | null;
};
type DeletionRequest = {
  status: string;
  requestedAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  blockedReason: string | null;
  canCancel: boolean;
};
function LinkedPanel({
  banks,
  discord,
  refresh,
  botLinkError,
  botLinkPending,
}: {
  banks: UseQueryResult<BankConnection[], Error>;
  discord: UseQueryResult<DiscordLink, Error>;
  refresh: () => void;
  botLinkError: unknown;
  botLinkPending: boolean;
}) {
  const { repositories } = useAppServices();
  const disconnect = useMutation({
    mutationFn: repositories.users.disconnectDiscordLink,
    onSuccess: refresh,
  });
  const connect = useMutation({
    mutationFn: repositories.users.beginDiscordLink,
    onSuccess: ({ authorizationUrl }) => globalThis.location.assign(authorizationUrl),
  });
  return (
    <Panel
      id="linked"
      title="Linked accounts"
      detail="Connected services expose only safe identifying details."
      className="account-panel--linked"
    >
      {banks.isLoading ? (
        <Rows />
      ) : banks.data?.length ? (
        <ul className="account-linked-list">
          {banks.data.map((bank) => (
            <li key={bank.id}>
              <Landmark aria-hidden="true" />
              <div>
                <strong>{bank.institutionName ?? bank.accountName ?? "Connected bank"}</strong>
                <small>{bank.accountMask ? `•••• ${bank.accountMask}` : bank.accountType}</small>
              </div>
              <Link to="/wallet" className="account-inline-button">
                Manage
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="account-empty">
          <Building2 aria-hidden="true" /> No bank accounts connected.{" "}
          <Link to="/wallet" className="account-text-button">
            Connect a bank in Wallet
          </Link>
        </div>
      )}
      <div className="account-linked-list">
        <div className="account-linked-row">
          <MessageCircle aria-hidden="true" />
          <div>
            <strong>Discord</strong>
            <small>
              {discord.data?.connected
                ? (discord.data.displayName ?? discord.data.username ?? "Connected")
                : discord.data?.configured
                  ? "Not connected"
                  : "Discord connection is unavailable in this environment."}
            </small>
          </div>
          {discord.data?.connected ? (
            <button className="account-inline-button" onClick={() => disconnect.mutate()}>
              Disconnect
            </button>
          ) : (
            <button
              className="account-inline-button"
              disabled={!discord.data?.configured}
              onClick={() => connect.mutate()}
            >
              Connect
            </button>
          )}
        </div>
        {botLinkPending ? <small>Connecting your Discord account securely…</small> : null}
        {botLinkError ? (
          <small className="account-form-error">
            {errorCopy(
              botLinkError,
              "This Discord link could not be completed. Return to Discord and try again.",
            )}
          </small>
        ) : null}
      </div>
    </Panel>
  );
}
function PreferencesPanel({
  query,
  refresh,
}: {
  query: ReturnType<
    typeof useQuery<{
      timezone: string;
      locale: "en-GB" | "en-US";
      preferredCurrency: SupportedCurrency;
    }>
  >;
  refresh: () => void;
}) {
  const { repositories } = useAppServices();
  const [timezone, setTimezone] = useState("");
  const update = useMutation({
    mutationFn: repositories.account.updatePreferences,
    onSuccess: refresh,
  });
  const current = query.data;
  return (
    <Panel
      id="preferences"
      title="Preferences"
      detail="Choose your display currency. Ledger balances and order submissions remain authoritative in GBP."
      className="account-panel--preferences"
    >
      {query.isLoading ? (
        <Rows />
      ) : current ? (
        <form
          className="account-preferences-form"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({ timezone: timezone || current.timezone });
          }}
        >
          <label>
            Timezone
            <input
              value={timezone || current.timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
          </label>
          <p>
            <strong>Regional format</strong>
            <span>{current.locale}</span>
          </p>
          <CurrencySelector className="account-currency-selector" />
          <button className="account-primary" disabled={update.isPending}>
            Save preferences
          </button>
          {update.error ? (
            <small className="account-form-error">{errorCopy(update.error)}</small>
          ) : null}
        </form>
      ) : (
        <Retry detail="Unable to load preferences." retry={() => void query.refetch()} />
      )}
    </Panel>
  );
}
function NotificationPreferencesPanel({
  query,
  refresh,
}: {
  query: ReturnType<
    typeof useQuery<{
      preferences: Array<{
        topic: "ORDER_UPDATES" | "PORTFOLIO_UPDATES";
        channel: "IN_APP";
        enabled: boolean;
      }>;
    }>
  >;
  refresh: () => void;
}) {
  const { repositories } = useAppServices();
  const update = useMutation({
    mutationFn: repositories.account.updateNotificationPreferences,
    onSuccess: refresh,
  });
  const topicCopy = {
    ORDER_UPDATES: {
      title: "Order & transaction updates",
      detail: "Private in-app updates for your orders and executions.",
    },
    PORTFOLIO_UPDATES: {
      title: "Portfolio & wallet activity",
      detail: "Private in-app updates for settled deposits and withdrawals.",
    },
  } as const;
  return (
    <Panel
      id="notification-preferences"
      title="Notifications"
      detail="Control optional in-app notifications. Security notices cannot be disabled here."
      className="account-panel--notifications"
    >
      {query.isLoading ? (
        <Rows />
      ) : query.error ? (
        <Retry
          detail="Unable to load notification preferences."
          retry={() => void query.refetch()}
        />
      ) : (
        <div className="account-notification-list">
          {query.data?.preferences.map((preference) => {
            const copy = topicCopy[preference.topic];
            return (
              <label key={preference.topic} className="account-notification-row">
                <span>
                  <strong>{copy.title}</strong>
                  <small>{copy.detail}</small>
                </span>
                <input
                  type="checkbox"
                  checked={preference.enabled}
                  disabled={update.isPending}
                  onChange={(event) =>
                    update.mutate(
                      query.data.preferences.map((item) =>
                        item.topic === preference.topic
                          ? { topic: item.topic, enabled: event.target.checked }
                          : { topic: item.topic, enabled: item.enabled },
                      ),
                    )
                  }
                />
              </label>
            );
          })}
          {update.error ? (
            <small className="account-form-error">{errorCopy(update.error)}</small>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
function ActivityPanel({
  query,
}: {
  query: ReturnType<
    typeof useQuery<{
      items: Array<{
        reference: string;
        type: string;
        title: string;
        description: string;
        createdAt: string;
      }>;
      nextCursor: string | null;
    }>
  >;
}) {
  return (
    <Panel
      id="activity"
      title="Account activity"
      detail="Customer-safe security and account events."
      className="account-panel--activity"
    >
      {query.isLoading ? (
        <Rows />
      ) : query.error ? (
        <Retry detail="Unable to load account activity." retry={() => void query.refetch()} />
      ) : query.data?.items.length ? (
        <ul className="account-activity-list">
          {query.data.items.map((item) => (
            <li key={item.reference}>
              <Clock3 aria-hidden="true" />
              <div>
                <strong>{item.title}</strong>
                <small>{item.description}</small>
              </div>
              <time>{date(item.createdAt)}</time>
            </li>
          ))}
        </ul>
      ) : (
        <p className="account-empty">No recent account activity.</p>
      )}
    </Panel>
  );
}
function DataPanel({ refresh }: { refresh: () => void }) {
  const { repositories } = useAppServices();
  const [ready, setReady] = useState(false);
  const request = useMutation({
    mutationFn: repositories.account.requestDataExport,
    onSuccess: ({ data }) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "slice-account-export.json";
      link.click();
      URL.revokeObjectURL(url);
      setReady(true);
      refresh();
    },
  });
  return (
    <Panel
      id="data"
      title="Your data"
      detail="Request one comprehensive account data export."
      className="account-panel--data"
    >
      <div className="account-data-row">
        <Download aria-hidden="true" />
        <div>
          <strong>Account data export</strong>
          <small>Includes the customer-safe data held for your account.</small>
        </div>
        <button
          className="account-inline-button"
          onClick={() => request.mutate()}
          disabled={request.isPending}
        >
          {request.isPending ? "Preparing…" : ready ? "Download again" : "Request export"}
        </button>
      </div>
      {request.error ? <p className="account-form-error">{errorCopy(request.error)}</p> : null}
    </Panel>
  );
}
function DangerPanel({
  deletion,
  refresh,
}: {
  deletion: UseQueryResult<DeletionRequest | null, Error>;
  refresh: () => void;
}) {
  const { repositories } = useAppServices();
  const [mode, setMode] = useState<"deactivate" | "delete" | null>(null);
  const cancel = useMutation({
    mutationFn: repositories.account.cancelDeletion,
    onSuccess: refresh,
  });
  return (
    <Panel
      id="danger"
      title="Danger zone"
      detail="Irreversible account actions require confirmation."
      className="account-panel--danger"
    >
      <div className="account-danger-row">
        <CircleAlert aria-hidden="true" />
        <div>
          <strong>Deactivate account</strong>
          <small>Your sessions will be revoked. Financial records are retained.</small>
        </div>
        <button className="account-danger-button" onClick={() => setMode("deactivate")}>
          Deactivate
        </button>
      </div>
      <div className="account-danger-row">
        <Trash2 aria-hidden="true" />
        <div>
          <strong>Request account deletion</strong>
          <small>
            {deletion.data
              ? `Status: ${accountStatusLabel(deletion.data.status)}`
              : "This creates a request; it does not instantly delete records."}
          </small>
        </div>
        {deletion.data?.canCancel ? (
          <button className="account-inline-button" onClick={() => cancel.mutate()}>
            Cancel request
          </button>
        ) : (
          <button className="account-danger-button" onClick={() => setMode("delete")}>
            Request deletion
          </button>
        )}
      </div>
      {deletion.data?.blockedReason ? (
        <p className="account-form-error">
          Your request is blocked until: {accountStatusLabel(deletion.data.blockedReason)}.
        </p>
      ) : null}
      {cancel.error ? <p className="account-form-error">{errorCopy(cancel.error)}</p> : null}
      {mode ? <LifecycleDialog kind={mode} close={() => setMode(null)} refresh={refresh} /> : null}
    </Panel>
  );
}
function LifecycleDialog({
  kind,
  close,
  refresh,
}: {
  kind: "deactivate" | "delete";
  close: () => void;
  refresh: () => void;
}) {
  const { repositories } = useAppServices();
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: async () => {
      if (kind === "deactivate")
        await repositories.account.deactivate({ reason: reason || undefined });
      else await repositories.account.requestDeletion({ reason: reason || undefined });
    },
    onSuccess: () => {
      refresh();
      close();
    },
  });
  const title = kind === "deactivate" ? "Deactivate account" : "Request account deletion";
  return (
    <Dialog title={title} close={close}>
      <form
        className="account-dialog-form"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <p className="account-dialog-note">
          {kind === "deactivate"
            ? "This restricts access and revokes active sessions. Your financial and account history remain preserved."
            : "This submits a durable deletion request for review. It is not an instant hard delete."}
        </p>
        <label>
          Reason (optional)
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        {mutation.error ? <p className="account-form-error">{errorCopy(mutation.error)}</p> : null}
        <button className="account-danger-button" disabled={mutation.isPending}>
          {mutation.isPending ? "Submitting…" : title}
        </button>
      </form>
    </Dialog>
  );
}
function Definition({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={muted ? "is-muted" : ""}>{value}</dd>
    </div>
  );
}
function Dialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  return (
    <div className="account-dialog-backdrop" role="presentation">
      <section className="account-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button type="button" onClick={close} aria-label="Close dialog">
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function Retry({ detail, retry }: { detail: string; retry: () => void }) {
  return (
    <p className="account-empty">
      {detail}{" "}
      <button className="account-text-button" onClick={retry}>
        Retry
      </button>
    </p>
  );
}
function Rows() {
  return (
    <div className="account-rows-loading" aria-label="Loading account data">
      <span />
      <span />
      <span />
    </div>
  );
}
function Loading() {
  return (
    <main className="page-shell py-16">
      <div className="account-kpis">
        <Rows />
        <Rows />
        <Rows />
        <Rows />
      </div>
    </main>
  );
}
function AccessRequired() {
  return (
    <main className="page-shell py-16">
      <section className="customer-state text-center">
        <UserRound className="mx-auto size-8 text-accent" />
        <p className="page-kicker mt-5">Account</p>
        <h1 className="page-title mt-3">Sign in to view your account</h1>
        <p className="mt-4 text-subtle">
          Account information is private to your authenticated session.
        </p>
        <Link
          to="/login"
          className="primary-action mt-6 inline-flex rounded-lg px-5 py-3 text-sm font-semibold text-background"
        >
          Sign in
        </Link>
      </section>
    </main>
  );
}
function PageError({ retry }: { retry: () => void }) {
  return (
    <main className="page-shell py-16">
      <section className="customer-state text-center">
        <h1 className="page-title">Account unavailable</h1>
        <p className="mt-3 text-subtle">Your account details could not be loaded safely.</p>
        <button className="account-primary mt-5" onClick={retry}>
          Retry
        </button>
      </section>
    </main>
  );
}
