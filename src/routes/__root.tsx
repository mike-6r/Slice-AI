import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";
import { ArrowUpRight, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";

import appCss from "../styles.css?url";
import investorUxCss from "../investor-ux.css?url";
import collectorsDirectoryCss from "../styles/collectors-directory.css?url";
import collectorStorefrontCss from "../styles/collector-storefront.css?url";
import { QaHarnessBoundary } from "@/auth/QaHarnessBoundary";
import { SessionBoundary } from "@/auth/SessionBoundary";
import { AppShell } from "@/components/layout/AppShell";
import { Toaster } from "@/components/ui/sonner";
import { AppServicesProvider } from "@/providers/AppServicesProvider";
import { CurrencyProvider } from "@/currency/CurrencyProvider";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <main className="slice-recovery" aria-labelledby="slice-recovery-title">
      <div className="slice-recovery__glow slice-recovery__glow--one" aria-hidden="true" />
      <div className="slice-recovery__glow slice-recovery__glow--two" aria-hidden="true" />
      <section className="slice-recovery__panel" role="alert">
        <div className="slice-recovery__signal" aria-hidden="true">
          <div className="slice-recovery__orbit slice-recovery__orbit--outer" />
          <div className="slice-recovery__orbit slice-recovery__orbit--inner" />
          <div className="slice-recovery__beacon">
            <TriangleAlert strokeWidth={1.8} />
          </div>
          <span className="slice-recovery__coordinate">RECOVERY / 01</span>
        </div>
        <div className="slice-recovery__content">
          <div className="slice-recovery__eyebrow">
            <span />
            Slice system recovery
          </div>
          <h1 id="slice-recovery-title">A small detour, not a dead end.</h1>
          <p>
            This view lost its connection while loading. Your account remains intact, and retrying
            will not automatically repeat a previous action.
          </p>
          <div className="slice-recovery__steps" aria-label="Recovery details">
            <div>
              <ShieldCheck aria-hidden="true" />
              <span>
                <strong>Account state protected</strong>
                <small>No data is changed by this recovery screen.</small>
              </span>
            </div>
            <div>
              <RefreshCw aria-hidden="true" />
              <span>
                <strong>Safe to retry</strong>
                <small>Reload this view or return to the main exchange.</small>
              </span>
            </div>
          </div>
          <div className="slice-recovery__actions">
          <button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="slice-recovery__retry"
          >
            <RefreshCw aria-hidden="true" />
            Retry this view
          </button>
          <a
            href="/"
            className="slice-recovery__home"
          >
            Return to Slice
            <ArrowUpRight aria-hidden="true" />
          </a>
          </div>
          <p className="slice-recovery__footnote">
            If this repeats, return to Slice and try the action again from a fresh page.
          </p>
        </div>
      </section>
    </main>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Slice — The Exchange for Authenticated Collectibles" },
      {
        name: "description",
        content:
          "Built for Collectors. Powered by Investors. Own and trade verified ownership in the world's rarest collectible assets.",
      },
      { property: "og:title", content: "Slice — The Exchange for Authenticated Collectibles" },
      {
        property: "og:description",
        content:
          "Own and trade verified ownership in the world's rarest collectible assets. Verified, vaulted, transparently priced.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: investorUxCss },
      { rel: "stylesheet", href: collectorsDirectoryCss },
      { rel: "stylesheet", href: collectorStorefrontCss },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <QaHarnessBoundary />
      <SessionBoundary>
        <AppServicesProvider>
          <CurrencyProvider>
            <AppShell>
              <Outlet />
            </AppShell>
            <Toaster />
          </CurrencyProvider>
        </AppServicesProvider>
      </SessionBoundary>
    </QueryClientProvider>
  );
}
