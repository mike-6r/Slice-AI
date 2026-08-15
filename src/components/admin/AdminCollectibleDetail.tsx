import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Image as ImageIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useAppServices } from "@/providers/AppServicesProvider";
import type { AdminCollectibleDetail as Detail } from "@/data/repositories";
import "@/styles/admin-collectible-detail.css";

const tabs = ["overview", "physical", "valuation", "ownership", "market", "history"] as const;
type DetailTab = (typeof tabs)[number];

export function AdminCollectibleDetail({
  assetId,
  tab,
  onTab,
  onBack,
}: {
  assetId: string;
  tab?: string;
  onTab: (tab: string) => void;
  onBack: () => void;
}) {
  const services = useAppServices();
  const client = useQueryClient();
  const selected = tabs.includes((tab ?? "overview") as DetailTab)
    ? ((tab ?? "overview") as DetailTab)
    : "overview";
  const detail = useQuery({
    queryKey: ["admin", "collectible", assetId, selected],
    queryFn: () => services.repositories.admin.getCollectibleDetail(assetId, selected),
    staleTime: 20_000,
  });
  const receipt = useMutation({
    mutationFn: () => services.repositories.admin.confirmIntakeReceipt(detail.data!.intake!.id),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["admin", "collectible", assetId] }),
  });
  if (detail.isLoading)
    return (
      <DetailState
        title="Loading collectible"
        detail="Reading the authoritative catalogue record."
      />
    );
  if (detail.isError || !detail.data)
    return (
      <DetailState
        title="Collectible unavailable"
        detail="We couldn't load this collectible. It may have moved or your access may have changed."
        retry={() => void detail.refetch()}
      />
    );
  const item = detail.data;
  const front = item.media.find((media) => media.slot.toLowerCase() === "front") ?? item.media[0];
  const physical = item.intake ? sentence(item.intake.status) : "Not recorded";
  const market =
    item.market.publication === "PUBLISHED" ? "Published" : sentence(item.market.readiness.status);
  return (
    <main className="admin-collectible-detail">
      <div className="admin-detail-header">
        <button type="button" className="admin-back-button" onClick={onBack}>
          <ArrowLeft aria-hidden="true" /> Collectibles
        </button>
        <div className="admin-detail-heading">
          <div>
            <p className="admin-breadcrumb">
              Collectibles <span>›</span> Collectible detail
            </p>
            <h2>{item.title}</h2>
            <p className="admin-detail-meta">
              {item.identity.year ?? "Year unavailable"} · {item.identity.set ?? "Set unavailable"}{" "}
              ·{" "}
              {item.identity.cardNumber
                ? `#${item.identity.cardNumber}`
                : "Card number unavailable"}
            </p>
          </div>
          <div className="admin-detail-actions">
            <span className={`admin-detail-status ${item.status.toLowerCase()}`}>
              {sentence(item.status)}
            </span>
            <a
              className="admin-button secondary"
              href={`/asset/${item.slug}`}
              target="_blank"
              rel="noreferrer"
            >
              View public page <ExternalLink aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
      <section className="admin-detail-hero">
        <div className="admin-detail-hero__media">
          {front?.url ? (
            <img src={front.url} alt={item.title} />
          ) : (
            <div>
              <ImageIcon aria-hidden="true" />
              <span>No approved public image</span>
            </div>
          )}
        </div>
        <div className="admin-detail-hero__identity">
          <p className="admin-detail-eyebrow">Canonical collectible</p>
          <h3>{item.identity.category}</h3>
          <p>
            {item.identity.manufacturer ?? "Manufacturer unavailable"} ·{" "}
            {item.identity.variant ?? "Standard variant"} ·{" "}
            {item.identity.language ?? "Language unavailable"}
          </p>
          <div className="admin-detail-chip-row">
            <Chip label="Physical" value={physical} />
            <Chip label="Market" value={market} />
            <Chip label="Owners" value={String(item.ownership.ownerCount ?? 0)} />
            <Chip
              label="Valuation"
              value={
                item.valuation.current
                  ? money(item.valuation.current.minor, item.valuation.current.currency)
                  : "Not recorded"
              }
            />
          </div>
        </div>
        <div className="admin-detail-hero__facts">
          <Field label="Collectible ID" value={item.publicId} />
          <Field
            label="Grading"
            value={
              item.grading
                ? `${item.grading.company} ${item.grading.grade} · ${item.grading.label}`
                : "Raw / ungraded"
            }
          />
          <Field label="Card number" value={item.identity.cardNumber} />
          <Field label="Last updated" value={date(item.updatedAt)} />
        </div>
      </section>
      <nav className="admin-detail-tabs" aria-label="Collectible detail sections">
        {tabs.map((value) => (
          <button
            type="button"
            key={value}
            className={selected === value ? "active" : ""}
            onClick={() => onTab(value)}
          >
            {label(value)}
          </button>
        ))}
      </nav>
      {selected === "overview" ? (
        <Overview
          item={item}
          receipt={{ isPending: receipt.isPending, mutate: () => receipt.mutate() }}
        />
      ) : (
        <TabContent item={item} tab={selected} />
      )}
    </main>
  );
}

function Overview({
  item,
  receipt,
}: {
  item: Detail;
  receipt: { mutate: () => void; isPending: boolean };
}) {
  const current = item.lifecycle.stages.filter((stage) => stage.state === "complete").at(-1);
  return (
    <div className="admin-detail-grid">
      <div className="admin-detail-main">
        <section className="admin-detail-card">
          <div className="admin-card-heading">
            <h3>Where this collectible is now</h3>
            <span>{sentence(item.lifecycle.current)}</span>
          </div>
          <div className="admin-journey admin-journey--compact">
            {item.lifecycle.stages.map((stage) => (
              <div className={`admin-journey-step ${stage.state}`} key={stage.key}>
                <span>
                  {stage.state === "complete" ? "✓" : stage.state === "current" ? "•" : ""}
                </span>
                <strong>{stage.label}</strong>
                <small>
                  {stage.at
                    ? date(stage.at)
                    : stage.state === "current"
                      ? "Current"
                      : "Not recorded"}
                </small>
              </div>
            ))}
          </div>
          {current ? (
            <p className="admin-detail-muted">
              Last confirmed milestone: <strong>{current.label}</strong>
              {current.at ? ` · ${date(current.at)}` : ""}
            </p>
          ) : null}
        </section>
        <div className="admin-detail-card-grid admin-detail-card-grid--three">
          <InfoCard title="Identity">
            <Field label="Set" value={item.identity.set} />
            <Field label="Year" value={item.identity.year} />
            <Field label="Edition" value={item.identity.edition} />
            <Field label="Rarity" value={item.identity.rarity} />
          </InfoCard>
          <InfoCard title="Ownership">
            <Field label="Issued" value={item.ownership.issuedUnits} />
            <Field label="Available" value={item.ownership.availableUnits} />
            <Field label="Owners" value={item.ownership.ownerCount} />
            <LinkButton href={`/asset/${item.slug}`}>View public ownership</LinkButton>
          </InfoCard>
          <InfoCard title="Custody">
            <Field label="Status" value={sentence(item.custody.status)} accent />
            <Field
              label="Location"
              value={
                item.custody.location
                  ? item.custody.location
                  : item.custody.status === "SECURED"
                    ? "Secured vault · location restricted"
                    : "Not recorded"
              }
            />
            <Field
              label="Secured"
              value={item.custody.securedAt ? date(item.custody.securedAt) : null}
            />
          </InfoCard>
        </div>
        <div className="admin-detail-card-grid admin-detail-card-grid--three">
          <InfoCard title="Valuation">
            <Field
              label="Supported value"
              value={
                item.valuation.current
                  ? money(item.valuation.current.minor, item.valuation.current.currency)
                  : null
              }
              accent
            />
            <Field
              label="Method"
              value={item.valuation.current ? valuationMethod(item.valuation.current.method) : null}
            />
            <Field
              label="As of"
              value={item.valuation.current ? date(item.valuation.current.asOf) : null}
            />
          </InfoCard>
          <InfoCard title="Market reference">
            <Field
              label="Current asking"
              value={
                item.market.asking
                  ? money(item.market.asking.minor, item.market.asking.currency)
                  : "Not observed"
              }
            />
            <Field label="Completed sales" value={item.market.salesCount || "None recorded"} />
            <Field label="Readiness" value={sentence(item.market.readiness.status)} />
          </InfoCard>
          <InfoCard title="Collector">
            <Field label="Name" value={item.collector?.displayName} />
            <Field
              label="Username"
              value={item.collector?.username ? `@${item.collector.username}` : null}
            />
            <Field label="Submissions" value={item.collector?.submissions} />
          </InfoCard>
        </div>
      </div>
      <aside className="admin-detail-rail">
        <InfoCard title="Admin actions">
          <LinkButton href={`/operations/assets?asset=${item.id}`}>
            Open lifecycle operations
          </LinkButton>
          <LinkButton href={`/admin?section=assetOperations&asset=${item.id}&tab=valuation`}>
            Review valuation
          </LinkButton>
          <LinkButton href={`/admin?section=assetOperations&asset=${item.id}&tab=marketplace`}>
            Review market readiness
          </LinkButton>
        </InfoCard>
        <InfoCard title="Recent activity">
          <ActivityList item={item} />
        </InfoCard>
        <InfoCard title="Physical intake">
          {item.intake ? (
            <>
              <Field label="Status" value={sentence(item.intake.status)} />
              <Field label="Tracking" value={item.intake.tracking} />
              {item.intake.deliveredAt && !item.intake.receiptConfirmedAt ? (
                <button
                  className="admin-button primary"
                  type="button"
                  onClick={receipt.mutate}
                  disabled={receipt.isPending}
                >
                  Confirm receipt
                </button>
              ) : null}
            </>
          ) : (
            <p className="admin-empty-detail">
              No intake record. This does not imply a shipment or receipt.
            </p>
          )}
        </InfoCard>
      </aside>
    </div>
  );
}

function TabContent({ item, tab }: { item: Detail; tab: DetailTab }) {
  if (tab === "physical") return <PhysicalTab item={item} />;
  if (tab === "valuation") return <ValuationTab item={item} />;
  if (tab === "ownership") return <OwnershipTab item={item} />;
  if (tab === "market") return <MarketTab item={item} />;
  return (
    <section className="admin-detail-card admin-detail-tab-panel">
      <div className="admin-card-heading">
        <h3>History</h3>
        <span>Audit events only</span>
      </div>
      <ActivityList item={item} expanded />
    </section>
  );
}
function PhysicalTab({ item }: { item: Detail }) {
  return (
    <section className="admin-detail-card admin-detail-tab-panel">
      <div className="admin-card-heading">
        <h3>Physical record</h3>
        <span>Recorded evidence and custody</span>
      </div>
      <div className="admin-detail-card-grid admin-detail-card-grid--three">
        <InfoCard title="Submission">
          <Field
            label="Status"
            value={
              item.submissions[0] ? sentence(item.submissions[0].status) : "No linked submission"
            }
          />
          <Field
            label="Submitted"
            value={item.submissions[0]?.submittedAt ? date(item.submissions[0].submittedAt) : null}
          />
          <Field label="Reviewer" value={item.submissions[0]?.reviewer} />
        </InfoCard>
        <InfoCard title="Evidence">
          <MediaList item={item} />
        </InfoCard>
        <InfoCard title="Custody">
          <Field label="Status" value={sentence(item.custody.status)} accent />
          <Field
            label="Received"
            value={item.custody.receivedAt ? date(item.custody.receivedAt) : "Not recorded"}
          />
          <Field
            label="Secured"
            value={item.custody.securedAt ? date(item.custody.securedAt) : "Not recorded"}
          />
        </InfoCard>
      </div>
    </section>
  );
}
function ValuationTab({ item }: { item: Detail }) {
  return (
    <section className="admin-detail-card admin-detail-tab-panel">
      <div className="admin-card-heading">
        <h3>Valuation & external references</h3>
        <span>Amounts and sources kept separate</span>
      </div>
      <div className="admin-detail-card-grid admin-detail-card-grid--three">
        <InfoCard title="Slice supported value">
          <Field
            label="Value"
            value={
              item.valuation.current
                ? money(item.valuation.current.minor, item.valuation.current.currency)
                : "Not recorded"
            }
            accent
          />
          <Field
            label="Method"
            value={item.valuation.current ? valuationMethod(item.valuation.current.method) : null}
          />
          <Field label="Decision maker" value={item.valuation.current?.actor} />
        </InfoCard>
        <InfoCard title="External market reference">
          <Field
            label="Current asking"
            value={
              item.valuation.marketReference.currentListing
                ? money(
                    item.valuation.marketReference.currentListing.minor,
                    item.valuation.marketReference.currentListing.currency,
                  )
                : "Not observed"
            }
          />
          <Field label="Source" value={item.valuation.marketReference.currentListing?.source} />
          <Field
            label="Observed"
            value={
              item.valuation.marketReference.currentListing
                ? date(item.valuation.marketReference.currentListing.observedAt)
                : null
            }
          />
        </InfoCard>
        <InfoCard title="Decision history">
          {item.valuation.history.length ? (
            item.valuation.history.slice(0, 8).map((entry) => (
              <div className="admin-sale-row" key={entry.id}>
                <span>{date(entry.asOf)}</span>
                <strong>{money(entry.minor, entry.currency)}</strong>
                <small>
                  {valuationMethod(entry.method)} · {sentence(entry.status)}
                </small>
              </div>
            ))
          ) : (
            <p className="admin-empty-detail">No valuation decisions recorded.</p>
          )}
        </InfoCard>
      </div>
    </section>
  );
}
function OwnershipTab({ item }: { item: Detail }) {
  const holders = item.ownership.holders ?? [];
  return (
    <section className="admin-detail-card admin-detail-tab-panel">
      <div className="admin-card-heading">
        <h3>Ownership breakdown</h3>
        <span>Authoritative settled positions</span>
      </div>
      <div className="admin-detail-card-grid admin-detail-card-grid--three">
        <InfoCard title="Supply">
          <Field label="Total units" value={item.ownership.totalUnits} />
          <Field label="Issued" value={item.ownership.issuedUnits} />
          <Field label="Available" value={item.ownership.availableUnits} />
          <Field label="Owners" value={item.ownership.ownerCount} />
        </InfoCard>
        <div className="admin-detail-card admin-detail-card--wide">
          <h4>Holders</h4>
          {holders.length ? (
            <div className="admin-holder-table">
              {holders.map((holder) => (
                <div className="admin-holder-row" key={holder.accountId}>
                  <div>
                    <strong>{holder.displayName}</strong>
                    <small>
                      {holder.username
                        ? `@${holder.username}`
                        : holder.userId
                          ? "Verified account"
                          : "System treasury"}
                    </small>
                  </div>
                  <strong>
                    {holder.percentage === null ? "—" : `${holder.percentage.toFixed(2)}%`}
                  </strong>
                  <span>{holder.units} units</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="admin-empty-detail">No settled user positions are recorded.</p>
          )}
        </div>
      </div>
      <p className="admin-detail-muted">
        Ownership is read-only here. Changes must come from the ownership ledger and settlement
        workflow.
      </p>
    </section>
  );
}
function MarketTab({ item }: { item: Detail }) {
  return (
    <section className="admin-detail-card admin-detail-tab-panel">
      <div className="admin-card-heading">
        <h3>Market lifecycle</h3>
        <span>Publication is not the same as tradeability</span>
      </div>
      <div className="admin-detail-card-grid admin-detail-card-grid--three">
        <InfoCard title="Publication">
          <Field label="Publication" value={sentence(item.market.publication)} accent />
          <Field label="Readiness" value={sentence(item.market.readiness.status)} />
          <Field
            label="Blocking items"
            value={item.market.readiness.blockingCodes.length || "None"}
          />
        </InfoCard>
        <InfoCard title="Market data">
          <Field
            label="Current asking"
            value={
              item.market.asking
                ? money(item.market.asking.minor, item.market.asking.currency)
                : "Not observed"
            }
          />
          <Field label="Completed sales" value={item.market.salesCount || "None recorded"} />
          <Field
            label="Last update"
            value={item.market.lastUpdated ? date(item.market.lastUpdated) : null}
          />
        </InfoCard>
        <InfoCard title="Recent completed sales">
          {item.recentSales.length ? (
            item.recentSales.slice(0, 5).map((sale) => (
              <div className="admin-sale-row" key={sale.id}>
                <span>{date(sale.date)}</span>
                <strong>{money(sale.minor, sale.currency)}</strong>
                <small>{sale.source}</small>
              </div>
            ))
          ) : (
            <p className="admin-empty-detail">No completed sales recorded.</p>
          )}
        </InfoCard>
      </div>
    </section>
  );
}
function MediaList({ item }: { item: Detail }) {
  return item.media.length ? (
    <div className="admin-media-list">
      {item.media.map((media) => (
        <div key={`${media.slot}-${media.filename}`}>
          <span>{sentence(media.slot)}</span>
          {media.url ? (
            <a href={media.url} target="_blank" rel="noreferrer">
              View approved media <ExternalLink aria-hidden="true" />
            </a>
          ) : (
            <small>{sentence(media.status)}</small>
          )}
        </div>
      ))}
    </div>
  ) : (
    <p className="admin-empty-detail">No approved media recorded.</p>
  );
}
function ActivityList({ item, expanded = false }: { item: Detail; expanded?: boolean }) {
  return item.activity.length ? (
    <div className="admin-activity-list">
      {item.activity.slice(0, expanded ? 50 : 5).map((event) => (
        <div className="admin-activity-row" key={event.id}>
          <strong>{sentence(event.action)}</strong>
          <small>
            {event.actor} · {date(event.occurredAt)}
          </small>
          {event.detail ? <span>{event.detail}</span> : null}
        </div>
      ))}
    </div>
  ) : (
    <p className="admin-empty-detail">No audit events recorded.</p>
  );
}
function Chip({ label: name, value }: { label: string; value: string }) {
  return (
    <div className="admin-detail-chip">
      <small>{name}</small>
      <strong>{value}</strong>
    </div>
  );
}
function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="admin-detail-card">
      <div className="admin-card-heading">
        <h3>{title}</h3>
      </div>
      {children}
    </section>
  );
}
function Field({
  label: name,
  value,
  accent,
}: {
  label: string;
  value: unknown;
  accent?: boolean;
}) {
  return (
    <div className="admin-detail-field">
      <span>{name}</span>
      <strong className={accent ? "accent" : ""}>
        {value === null || value === undefined || value === "" ? "Not recorded" : String(value)}
      </strong>
    </div>
  );
}
function LinkButton({ href, children }: { href?: string; children: ReactNode }) {
  return href ? (
    <a className="admin-button secondary" href={href}>
      {children} <ExternalLink aria-hidden="true" />
    </a>
  ) : null;
}
function DetailState({
  title,
  detail,
  retry,
}: {
  title: string;
  detail: string;
  retry?: () => void;
}) {
  return (
    <section className="admin-detail-state">
      <h2>{title}</h2>
      <p>{detail}</p>
      {retry ? (
        <button type="button" className="admin-button primary" onClick={retry}>
          Retry
        </button>
      ) : null}
    </section>
  );
}
function sentence(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function label(value: string) {
  return value === "physical"
    ? "Physical"
    : value === "market"
      ? "Market"
      : value[0].toUpperCase() + value.slice(1);
}
function valuationMethod(value: string) {
  if (value === "ILLUSTRATIVE_STAGING_SHARE_BASIS") return "Illustrative valuation";
  if (value === "PRICE_GUIDE") return "Price guide reference";
  return sentence(value);
}
function date(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
function money(minor: string, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(minor) / 100);
}
