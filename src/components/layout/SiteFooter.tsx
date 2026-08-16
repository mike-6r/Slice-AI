import { Link } from "@tanstack/react-router";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";

import { useSession } from "@/auth/use-session";
import { Wordmark } from "@/components/layout/MainNavigation";
import { CurrencySelector } from "@/currency/CurrencySelector";
import { isBetaEnvironment } from "@/config/environment";

type FooterRoute =
  "/marketplace" | "/collectors" | "/about" | "/how-it-works" | "/security" | "/help" | "/fees";

type FooterLink = { label: string; to: FooterRoute };

/**
 * Every destination is an implemented first-party route. Unsupported market filters,
 * social accounts, legal documents, and marketing email signup intentionally stay absent.
 */
export const FOOTER_ROUTE_AUDIT = {
  markets: [{ label: "All Assets", to: "/marketplace" }],
  collectors: [{ label: "Collectors", to: "/collectors" }],
  company: [
    { label: "About Slice", to: "/about" },
    { label: "How It Works", to: "/how-it-works" },
    { label: "Security", to: "/security" },
  ],
  support: [
    { label: "Help Centre", to: "/help" },
    { label: "Fees", to: "/fees" },
  ],
} as const satisfies Record<string, readonly FooterLink[]>;

function FooterColumn({ title, links }: { title: string; links: readonly FooterLink[] }) {
  return (
    <nav aria-label={`${title} links`} className="slice-footer__column">
      <h2>{title}</h2>
      <ul>
        {links.map((link) => (
          <li key={link.label}>
            <Link to={link.to} className="slice-footer__link">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SiteFooter() {
  const { isAuthenticated } = useSession();
  const updates = isAuthenticated
    ? { to: "/notifications" as const, label: "View notifications" }
    : { to: "/login" as const, label: "Log in for updates" };

  return (
    <footer className="slice-footer">
      <div className="site-shell">
        <div className="slice-footer__surface">
          <div className="slice-footer__upper">
            <section className="slice-footer__brand" aria-label="Slice">
              <Wordmark />
              <p className="slice-footer__positioning">
                The social investment platform for authenticated collectible assets.
              </p>
              <p className="slice-footer__brand-note">
                Discover published assets, explore the collector community, and manage your Slice
                account in one place.
              </p>
              {isBetaEnvironment ? (
                <p className="slice-footer__brand-note">
                  Live Beta — test funds only. No illustrative market data is shown.
                </p>
              ) : null}
              <CurrencySelector className="slice-footer__currency" />
            </section>

            <div className="slice-footer__links" aria-label="Footer navigation">
              <FooterColumn title="Markets" links={FOOTER_ROUTE_AUDIT.markets} />
              <FooterColumn title="Collectors" links={FOOTER_ROUTE_AUDIT.collectors} />
              <FooterColumn title="Company" links={FOOTER_ROUTE_AUDIT.company} />
              <FooterColumn title="Support" links={FOOTER_ROUTE_AUDIT.support} />
            </div>

            <aside className="slice-footer__updates" aria-labelledby="footer-updates-title">
              <span className="slice-footer__updates-icon" aria-hidden="true">
                <Mail />
              </span>
              <div>
                <h2 id="footer-updates-title">Stay in the loop</h2>
                <p>
                  {isAuthenticated
                    ? "Review your authenticated account and market notifications in one place."
                    : "Sign in to view account and market notifications."}
                </p>
              </div>
              <Link to={updates.to} className="slice-footer__updates-cta">
                {updates.label} <ArrowRight aria-hidden="true" />
              </Link>
            </aside>
          </div>

          <div className="slice-footer__lower">
            <div className="slice-footer__copyright">
              <span>&copy; {new Date().getFullYear()} Slice. All rights reserved.</span>
              <span className="slice-footer__trust-line">
                <LockKeyhole aria-hidden="true" /> Built with secure account and financial controls.
              </span>
            </div>
            <aside className="slice-footer__security-card" aria-label="Security information">
              <span aria-hidden="true">
                <LockKeyhole />
              </span>
              <div>
                <strong>Secure by design</strong>
                <p>Account actions use server-side security controls.</p>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </footer>
  );
}
