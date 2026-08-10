import { type ReactNode } from "react";

import { MainNavigation } from "@/components/layout/MainNavigation";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { useNotificationStream } from "@/notifications/use-notification-stream";

export function AppShell({ children }: { children: ReactNode }) {
  useNotificationStream();
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
