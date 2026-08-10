import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BriefcaseBusiness, ClipboardCheck, FolderKanban } from "lucide-react";

import { canAccessStaffWorkspace, staffWorkspaceLinks } from "@/auth/workspace-access";
import { RoleWorkspaceGuard } from "@/components/auth/RoleWorkspaceGuard";
import { useAppServices } from "@/providers/AppServicesProvider";
import { queryKeys } from "@/queries/keys";

export const Route = createFileRoute("/staff")({ component: StaffWorkspacePage });

function StaffWorkspacePage() {
  return (
    <RoleWorkspaceGuard allows={canAccessStaffWorkspace} title="Staff workspace">
      <StaffWorkspace />
    </RoleWorkspaceGuard>
  );
}

function StaffWorkspace() {
  const services = useAppServices();
  const user = useQuery({
    queryKey: queryKeys.user.current,
    queryFn: () => services.repositories.users.getCurrentUser(),
    staleTime: 60_000,
  });
  const links = staffWorkspaceLinks(user.data?.roles ?? []);

  return (
    <main className="page-shell py-10">
      <header className="max-w-3xl">
        <p className="page-kicker">Staff workspace</p>
        <h1 className="page-title mt-3">Operations workspaces</h1>
        <p className="mt-3 text-subtle">
          Your investor dashboard remains separate. Choose an operational workspace your
          server-authorised role permits.
        </p>
      </header>
      <section className="mt-8 grid gap-5 md:grid-cols-2" aria-label="Staff workspaces">
        {links.canReviewSubmissions && (
          <WorkspaceCard
            to="/collector-workspace"
            icon={<ClipboardCheck aria-hidden="true" />}
            title="Submission review"
            detail="Review submissions assigned through the authorised collector workflow."
            action="Open collector workspace"
          />
        )}
        {links.canManageAssetLifecycle && (
          <WorkspaceCard
            to="/operations/assets"
            icon={<FolderKanban aria-hidden="true" />}
            title="Asset lifecycle"
            detail="Open permitted valuation, custody, coverage and publication work."
            action="Open asset operations"
          />
        )}
        {!links.canReviewSubmissions && !links.canManageAssetLifecycle && (
          <section className="rounded-2xl border border-border bg-elevated p-6 md:col-span-2">
            <BriefcaseBusiness className="size-7 text-accent" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-semibold">No cases in your queue.</h2>
            <p className="mt-2 max-w-xl text-sm text-subtle">
              This account has a staff role, but no customer-facing operational queue is available
              for that role in the Slice client.
            </p>
          </section>
        )}
      </section>
    </main>
  );
}

function WorkspaceCard({
  to,
  icon,
  title,
  detail,
  action,
}: {
  to: "/collector-workspace" | "/operations/assets";
  icon: React.ReactNode;
  title: string;
  detail: string;
  action: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-elevated p-6">
      <span className="grid size-11 place-items-center rounded-xl bg-accent/10 text-accent">
        {icon}
      </span>
      <h2 className="mt-5 text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-subtle">{detail}</p>
      <Link to={to} className="mt-6 inline-flex text-sm font-semibold text-accent hover:underline">
        {action}
      </Link>
    </section>
  );
}
