import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Boxes, LockKeyhole, PackageCheck, ShieldCheck, Sparkles } from "lucide-react";
import { isPreviewEnvironment } from "@/config/environment";
import { useAppServices } from "@/providers/AppServicesProvider";
import "@/styles/drops.css";

export const Route = createFileRoute("/drops")({
  beforeLoad: () => {
    if (!isPreviewEnvironment) throw redirect({ to: "/marketplace" });
  },
  head: () => ({
    meta: [
      { title: "Slice Drops | Vault-backed collector releases" },
      {
        name: "description",
        content:
          "Explore finite creator releases built from verified, secured collectibles in the Slice vault.",
      },
    ],
  }),
  component: DropsPage,
});

export function DropsPage() {
  const services = useAppServices();
  const drops = useQuery({
    queryKey: ["drops", "public"],
    queryFn: () => services.repositories.drops.listPublic(),
    staleTime: 20_000,
  });

  return (
    <main className="drops-shell">
      <section className="drops-hero">
        <div className="drops-frame">
          <span className="drops-kicker">Slice Preview · Drops foundation</span>
          <h1 className="drops-title">Creator releases, backed by real vault inventory.</h1>
          <p className="drops-lede">
            Every published Drop begins with verified collectibles already secured in Slice custody.
            Inventory is finite, ownership is checked at selection, and the underlying Asset remains
            the authority.
          </p>
          <div className="drops-actions">
            <a className="drop-button drop-button--primary" href="#available-drops">
              Explore Drops <Sparkles size={16} aria-hidden="true" />
            </a>
            <Link className="drop-button drop-button--secondary" to="/drop-studio">
              Open Drop Studio
            </Link>
          </div>
          <div className="drops-principles" aria-label="How Slice Drops work">
            <article>
              <PackageCheck aria-hidden="true" />
              <strong>Vault-backed</strong>
              <p>Only physically received, verified, and secured collectibles can enter a Drop.</p>
            </article>
            <article>
              <LockKeyhole aria-hidden="true" />
              <strong>Exclusively committed</strong>
              <p>
                An asset lock prevents selected inventory from entering another conflicting
                workflow.
              </p>
            </article>
            <article>
              <ShieldCheck aria-hidden="true" />
              <strong>Truthful by design</strong>
              <p>
                Unavailable values stay unavailable. No fake pricing, provider claims, odds, or draw
                results.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="drops-section" id="available-drops">
        <div className="drops-frame">
          <div className="drops-section-heading">
            <div>
              <span className="drops-kicker">Release floor</span>
              <h2>Published Drops</h2>
            </div>
            <p>
              Live inventory appears here only after creator submission and an authoritative admin
              readiness review.
            </p>
          </div>
          <div className="drop-grid">
            {drops.isLoading ? (
              <Empty title="Checking the vault" body="Loading published Drops…" />
            ) : null}
            {drops.isError ? (
              <Empty
                title="Drops are unavailable"
                body="The preview API could not load published Drops."
              />
            ) : null}
            {drops.data?.items.map((drop) => (
              <article className="drop-card" key={drop.id}>
                <div className="drop-card-body">
                  <div className="drop-card-top">
                    <span className="drop-status">{drop.state.replaceAll("_", " ")}</span>
                    <Boxes size={20} aria-hidden="true" />
                  </div>
                  <h3>{drop.name}</h3>
                  <p className="drop-card-copy">{drop.description}</p>
                  <ul className="drop-card-inventory" aria-label="Drop inventory preview">
                    {drop.inventory.slice(0, 3).map((asset) => (
                      <li key={asset.id}>{asset.title}</li>
                    ))}
                    {drop.inventory.length > 3 ? (
                      <li>+ {drop.inventory.length - 3} more verified assets</li>
                    ) : null}
                  </ul>
                  <div className="drop-card-meta">
                    <div>
                      <small>Creator</small>
                      <strong>{drop.creator.displayName}</strong>
                    </div>
                    <div>
                      <small>Remaining</small>
                      <strong>
                        {drop.remainingInventoryCount} / {drop.inventoryCount}
                      </strong>
                    </div>
                  </div>
                </div>
              </article>
            ))}
            {!drops.isLoading && !drops.isError && drops.data?.items.length === 0 ? (
              <Empty
                title="The first Drops are being assembled"
                body="No Drop is published yet. Draft and review work stays private until every readiness gate passes."
              />
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="drops-empty">
      <Boxes aria-hidden="true" />
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}
