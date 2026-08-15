import { type ReactNode } from "react";

import { MainNavigation } from "@/components/layout/MainNavigation";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { useNotificationStream } from "@/notifications/use-notification-stream";
import { useRouterState } from "@tanstack/react-router";

export function AppShell({ children }: { children: ReactNode }) {
  const collectorWorkspace = useRouterState({
    select: (state) =>
      state.location.pathname === "/collector-workspace" ||
      state.location.pathname === "/admin" ||
      state.location.pathname.startsWith("/admin/") ||
      state.location.pathname.startsWith("/operations/submissions"),
  });
  useNotificationStream("current", !collectorWorkspace);
  if (collectorWorkspace)
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
