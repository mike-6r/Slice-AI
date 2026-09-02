import { type ReactNode } from "react";

import { MainNavigation } from "@/components/layout/MainNavigation";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { useNotificationStream } from "@/notifications/use-notification-stream";
import { useRouterState } from "@tanstack/react-router";

export function AppShell({ children }: { children: ReactNode }) {
  const workspaceState = useRouterState({
    select: (state) =>
      state.location.pathname,
  });
  const reviewDetail = workspaceState.startsWith("/operations/submissions");
  const privateWorkspace =
    workspaceState === "/collector-workspace" ||
    workspaceState === "/admin" ||
    workspaceState.startsWith("/admin/");
  useNotificationStream("current", !privateWorkspace && !reviewDetail);
  if (reviewDetail)
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        {children}
      </div>
    );
  if (privateWorkspace)
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">{children}</div>
    );
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <MainNavigation />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
