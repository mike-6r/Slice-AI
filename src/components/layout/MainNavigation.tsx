import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  BriefcaseBusiness,
  ClipboardCheck,
  ChevronDown,
  CircleUserRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings2,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { logout, logoutAll } from "@/auth/actions";
import { useSession } from "@/auth/use-session";
import { MarketTicker } from "@/components/layout/MarketTicker";
import { useAppServices } from "@/providers/AppServicesProvider";
import { queryKeys } from "@/queries/keys";
import {
  canAccessAdmin,
  canAccessCollectorWorkspace,
  canAccessStaffWorkspace,
} from "@/auth/workspace-access";
import { primaryNavigationFor, SLICE_LOGO_ASSET } from "./navigation-model";

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      aria-label="Slice — home"
      className={`flex shrink-0 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${className ?? ""}`}
    >
      <img src={SLICE_LOGO_ASSET} alt="" aria-hidden="true" className="size-7 object-contain" />
      <span className="font-display text-[22px] font-bold tracking-[-0.06em] text-foreground">
        Slice
      </span>
    </Link>
  );
}

export function MainNavigation() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [endingSession, setEndingSession] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const mobileProfileRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useSession();
  const services = useAppServices();
  const primaryNavigation = primaryNavigationFor(isAuthenticated);
  const unread = useQuery({
    queryKey: queryKeys.notifications.unread,
    queryFn: () => services.repositories.notifications.getUnreadCount(),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
  const currentUser = useQuery({
    queryKey: queryKeys.user.current,
    queryFn: () => services.repositories.users.getCurrentUser(),
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!accountOpen && !mobileOpen && !searchOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountOpen(false);
        setMobileOpen(false);
        setSearchOpen(false);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [accountOpen, mobileOpen, searchOpen]);

  useEffect(() => {
    if (!accountOpen) return;
    const closeOnPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !mobileProfileRef.current?.contains(target))
        setAccountOpen(false);
    };
    document.addEventListener("mousedown", closeOnPointerDown);
    return () => document.removeEventListener("mousedown", closeOnPointerDown);
  }, [accountOpen]);

  const submitSearch = () => {
    setSearchOpen(false);
    setMobileOpen(false);
    void navigate({ to: "/marketplace", search: { q: query.trim() || undefined } });
  };
  const endSession = async (allDevices: boolean) => {
    setEndingSession(true);
    try {
      await (allDevices ? logoutAll() : logout());
      queryClient.clear();
      setAccountOpen(false);
      setMobileOpen(false);
      void navigate({ to: "/" });
    } finally {
      setEndingSession(false);
    }
  };
  const initials = initialsFor(currentUser.data?.profile.displayName, currentUser.data?.email);
  const roles = currentUser.data?.roles ?? [];

  return (
    <header className="main-navigation sticky top-0 z-50 border-b border-border shadow-[0_10px_36px_rgba(0,0,0,0.18)]">
      <MarketTicker />
      <div className="site-shell flex h-[66px] items-center gap-3 xl:gap-5">
        <button
          type="button"
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
          className="header-icon grid size-10 shrink-0 place-items-center rounded-lg text-foreground xl:hidden"
        >
          {mobileOpen ? (
            <X className="size-5" aria-hidden="true" />
          ) : (
            <Menu className="size-5" aria-hidden="true" />
          )}
        </button>
        <Wordmark />

        <nav aria-label="Primary" className="hidden min-w-0 items-center gap-0.5 xl:flex">
          {primaryNavigation.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              activeProps={{ className: "nav-link nav-link--active text-foreground" }}
              className="nav-link whitespace-nowrap rounded-md px-2.5 py-2 text-[13px] font-medium text-subtle 2xl:px-3"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <SearchForm
          query={query}
          setQuery={setQuery}
          submit={submitSearch}
          className="mx-auto hidden min-w-0 max-w-[280px] flex-1 xl:block 2xl:max-w-[336px]"
        />
        <button
          type="button"
          aria-label="Search assets, sets, collectors"
          onClick={() => setSearchOpen(true)}
          className="header-icon ml-auto grid size-9 place-items-center rounded-lg text-subtle xl:hidden"
        >
          <Search className="size-[18px]" aria-hidden="true" />
        </button>

        <div className="ml-auto hidden shrink-0 items-center gap-1.5 xl:flex">
          <HeaderActions
            authenticated={isAuthenticated}
            unread={unread.data ?? 0}
            accountOpen={accountOpen}
            setAccountOpen={setAccountOpen}
            endingSession={endingSession}
            endSession={endSession}
            initials={initials}
            name={currentUser.data?.profile.displayName}
            email={currentUser.data?.email}
            roles={roles}
            menuRef={menuRef}
          />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 xl:hidden">
          {isAuthenticated ? (
            <>
              <NotificationButton unread={unread.data ?? 0} />
              <ProfileButton initials={initials} open={accountOpen} setOpen={setAccountOpen} />
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="whitespace-nowrap px-1.5 py-2 text-[13px] font-medium text-subtle hover:text-foreground"
              >
                Log in
              </Link>
              <Link
                to="/signup"
                className="primary-action whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-semibold text-background"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>

      {searchOpen && (
        <div className="border-t border-border bg-background px-4 py-3 xl:hidden">
          <SearchForm
            query={query}
            setQuery={setQuery}
            submit={submitSearch}
            className="site-shell"
            autoFocus
          />
        </div>
      )}
      {accountOpen && isAuthenticated && (
        <div ref={mobileProfileRef}>
          <ProfileMenu
            className="absolute right-4 top-[72px] xl:hidden"
            initials={initials}
            name={currentUser.data?.profile.displayName}
            email={currentUser.data?.email}
            roles={roles}
            endingSession={endingSession}
            endSession={endSession}
            close={() => setAccountOpen(false)}
          />
        </div>
      )}
      {mobileOpen && (
        <div className="border-t border-border bg-surface/98 px-4 py-4 shadow-card xl:hidden">
          <nav aria-label="Mobile" className="site-shell grid gap-1">
            {primaryNavigation.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                activeOptions={{ exact: item.to === "/" }}
                onClick={() => setMobileOpen(false)}
                activeProps={{ className: "bg-elevated text-foreground" }}
                className="rounded-lg px-3 py-3 text-sm font-medium text-subtle"
              >
                {item.label}
              </Link>
            ))}
            {isAuthenticated && (
              <>
                <Link
                  to="/dashboard"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-3 text-sm font-medium text-subtle"
                >
                  Dashboard
                </Link>
                {canAccessAdmin(currentUser.data?.roles ?? []) && (
                  <Link
                    to="/admin"
                    search={{ section: "control" }}
                    onClick={() => setMobileOpen(false)}
                    className="rounded-lg px-3 py-3 text-sm font-medium text-subtle"
                  >
                    Admin Console
                  </Link>
                )}
                {canAccessStaffWorkspace(roles) && (
                  <Link
                    to="/staff"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-lg px-3 py-3 text-sm font-medium text-subtle"
                  >
                    Staff Dashboard
                  </Link>
                )}
                {canAccessCollectorWorkspace(roles) && (
                  <Link
                    to="/collector-workspace"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-lg px-3 py-3 text-sm font-medium text-subtle"
                  >
                    Collector Workspace
                  </Link>
                )}
                <Link
                  to="/account"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-3 text-sm font-medium text-subtle"
                >
                  Account
                </Link>
                <Link
                  to="/list"
                  onClick={() => setMobileOpen(false)}
                  className="primary-action mt-2 inline-flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-semibold text-background"
                >
                  <Plus className="size-4" aria-hidden="true" /> List an Asset
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

function SearchForm({
  query,
  setQuery,
  submit,
  className,
  autoFocus = false,
}: {
  query: string;
  setQuery: (value: string) => void;
  submit: () => void;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className={className}
    >
      <label className="relative block">
        <span className="sr-only">Search assets, sets, collectors</span>
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          autoFocus={autoFocus}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search assets, sets, collectors..."
          className="h-10 w-full rounded-lg border border-border bg-surface/80 pl-10 pr-3 text-xs text-foreground transition placeholder:text-muted focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/15"
        />
      </label>
    </form>
  );
}

function HeaderActions({
  authenticated,
  unread,
  accountOpen,
  setAccountOpen,
  endingSession,
  endSession,
  initials,
  name,
  email,
  roles,
  menuRef,
}: {
  authenticated: boolean;
  unread: number;
  accountOpen: boolean;
  setAccountOpen: (open: boolean) => void;
  endingSession: boolean;
  endSession: (allDevices: boolean) => Promise<void>;
  initials: string;
  name?: string;
  email?: string;
  roles: readonly string[];
  menuRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (!authenticated)
    return (
      <>
        <Link
          to="/login"
          className="whitespace-nowrap rounded-md px-2.5 py-2 text-[13px] font-medium text-subtle transition-colors hover:text-foreground"
        >
          Log in
        </Link>
        <Link
          to="/signup"
          className="primary-action whitespace-nowrap rounded-lg px-4 py-2.5 text-[13px] font-semibold text-background"
        >
          Sign up
        </Link>
      </>
    );
  return (
    <>
      <NotificationButton unread={unread} />
      <div ref={menuRef} className="relative ml-1">
        <ProfileButton initials={initials} open={accountOpen} setOpen={setAccountOpen} />
        {accountOpen && (
          <ProfileMenu
            initials={initials}
            name={name}
            email={email}
            roles={roles}
            endingSession={endingSession}
            endSession={endSession}
            close={() => setAccountOpen(false)}
          />
        )}
      </div>
      <Link
        to="/list"
        className="primary-action ml-1 inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-4 text-xs font-semibold text-background"
      >
        <Plus className="size-4" aria-hidden="true" /> List an Asset
      </Link>
    </>
  );
}

function NotificationButton({ unread }: { unread: number }) {
  return (
    <Link
      to="/notifications"
      aria-label="Notifications"
      className="header-icon header-notification-button relative grid size-9 shrink-0 place-items-center rounded-lg text-subtle"
    >
      <Bell className="size-[18px]" aria-hidden="true" />
      {unread > 0 && (
        <span className="header-icon__badge" aria-label={`${unread} unread notifications`}>
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
function ProfileButton({
  initials,
  open,
  setOpen,
}: {
  initials: string;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-label="Account menu"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      className="header-icon flex items-center gap-1 rounded-full py-1 pl-1 pr-1.5 text-subtle"
    >
      <span
        aria-hidden="true"
        className="grid size-8 place-items-center rounded-full border border-border-strong bg-surface text-[11px] font-bold text-foreground"
      >
        {initials}
      </span>
      <ChevronDown className="size-3.5" aria-hidden="true" />
    </button>
  );
}
function ProfileMenu({
  initials,
  name,
  email,
  roles,
  endingSession,
  endSession,
  close,
  className = "",
}: {
  initials: string;
  name?: string;
  email?: string;
  roles: readonly string[];
  endingSession: boolean;
  endSession: (allDevices: boolean) => Promise<void>;
  close: () => void;
  className?: string;
}) {
  return (
    <div
      className={`right-0 z-50 w-[260px] rounded-xl border border-border-strong bg-elevated p-2 shadow-card ${className || "absolute top-11"}`}
      role="menu"
      aria-label="Account menu"
    >
      <div className="flex items-center gap-3 px-2.5 py-3">
        <span className="grid size-11 place-items-center rounded-full border border-border-strong bg-surface text-sm font-bold">
          {initials}
        </span>
        <div className="min-w-0">
          <strong className="block truncate text-sm">{name ?? "Your Slice account"}</strong>
          <span className="block truncate text-xs text-subtle">
            {email ?? "Account details loading"}
          </span>
        </div>
      </div>
      <div className="border-t border-border py-1">
        <ProfileMenuLink
          to="/dashboard"
          icon={<LayoutDashboard />}
          label="Dashboard"
          close={close}
        />
        {canAccessAdmin(roles) && (
          <ProfileMenuLink
            to="/admin"
            icon={<BriefcaseBusiness />}
            label="Admin Console"
            close={close}
          />
        )}
        {canAccessStaffWorkspace(roles) && (
          <ProfileMenuLink
            to="/staff"
            icon={<BriefcaseBusiness />}
            label="Staff Dashboard"
            close={close}
          />
        )}
        {canAccessCollectorWorkspace(roles) && (
          <ProfileMenuLink
            to="/collector-workspace"
            icon={<ClipboardCheck />}
            label="Collector Workspace"
            close={close}
          />
        )}
        <ProfileMenuLink to="/account" icon={<CircleUserRound />} label="Account" close={close} />
        <ProfileMenuLink
          to="/wallet"
          icon={<WalletCards />}
          label="Wallet & verification"
          close={close}
        />
        <ProfileMenuLink
          to="/account#profile"
          icon={<Settings2 />}
          label="Settings"
          close={close}
        />
      </div>
      <div className="border-t border-border pt-1">
        <button
          type="button"
          disabled={endingSession}
          onClick={() => void endSession(false)}
          className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left text-sm font-medium text-negative hover:bg-negative/10 disabled:opacity-50"
        >
          <LogOut className="size-4" aria-hidden="true" /> Log out
        </button>
        <button
          type="button"
          disabled={endingSession}
          onClick={() => void endSession(true)}
          className="w-full rounded-lg px-2.5 py-2 text-left text-xs text-subtle hover:bg-surface disabled:opacity-50"
        >
          Log out all devices
        </button>
      </div>
    </div>
  );
}
function ProfileMenuLink({
  to,
  icon,
  label,
  close,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  close: () => void;
}) {
  return (
    <Link
      to={to as never}
      onClick={close}
      className="flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm text-subtle hover:bg-surface hover:text-foreground"
    >
      <span className="text-muted">{icon}</span>
      {label}
    </Link>
  );
}
function initialsFor(name?: string, email?: string) {
  const source = name?.trim() || email?.split("@")[0] || "S";
  const initials = source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
  return initials || "S";
}
