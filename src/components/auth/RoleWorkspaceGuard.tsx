import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useSession } from "@/auth/use-session";
import { useAppServices } from "@/providers/AppServicesProvider";
import { queryKeys } from "@/queries/keys";

export function RoleWorkspaceGuard({
  allows,
  title,
  children,
}: {
  allows: (roles: readonly string[]) => boolean;
  title: string;
  children: ReactNode;
}) {
  const { isAuthenticated } = useSession();
  const services = useAppServices();
  const user = useQuery({
    queryKey: queryKeys.user.current,
    queryFn: () => services.repositories.users.getCurrentUser(),
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  if (!isAuthenticated) return <WorkspaceState title={`${title} sign-in required`} login />;
  if (user.isLoading) return <WorkspaceState title={`Loading ${title.toLowerCase()}`} />;
  if (user.isError || !user.data || !allows(user.data.roles))
    return <WorkspaceState title={`${title} access required`} />;
  return <>{children}</>;
}

function WorkspaceState({ title, login = false }: { title: string; login?: boolean }) {
  return (
    <main className="page-shell py-16">
      <section className="customer-state mx-auto max-w-xl text-center">
        <p className="page-kicker">Private workspace</p>
        <h1 className="page-title mt-3">{title}</h1>
        <p className="mx-auto mt-4 max-w-md text-subtle">
          {login
            ? "Sign in to continue to this private Slice workspace."
            : "Your account does not have the server-authorised role required for this workspace."}
        </p>
        <Link
          to={login ? "/login" : "/dashboard"}
          className="primary-action mt-6 inline-flex rounded-lg px-5 py-3 text-sm font-semibold text-background"
        >
          {login ? "Log in" : "Back to dashboard"}
        </Link>
      </section>
    </main>
  );
}
