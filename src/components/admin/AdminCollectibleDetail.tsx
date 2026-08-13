import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Image as ImageIcon,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { useAppServices } from "@/providers/AppServicesProvider";
import type { AdminCollectibleDetail as Detail } from "@/data/repositories";
import "@/styles/admin-collectible-detail.css";

const tabs = [
  "overview",
  "submission",
  "evidence",
  "shipping",
  "verification",
  "valuation",
  "custody",
  "marketplace",
  "ownership",
  "history",
] as const;
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
        detail="Reading the canonical lifecycle projection."
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
  return (
    <main className="admin-collectible-detail">
      <div className="admin-detail-header">
        <button type="button" className="admin-back-button" onClick={onBack}>
          <ArrowLeft aria-hidden="true" /> Collectibles
        </button>
        <div className="admin-detail-heading">
          <div>
            <p className="admin-breadcrumb">
              Collectibles <span>›</span> Collectible Admin Detail
            </p>
            <h2>{item.title}</h2>
            <p className="admin-detail-meta">
              {item.grading ? `${item.grading.company} ${item.grading.grade}` : "UnGraded"} ·{" "}
              {item.identity.category} · {item.identity.set ?? "Set unavailable"} ·{" "}
              {item.identity.variant ?? "Standard"}
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
              View Public Page <ExternalLink aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
      <section className="admin-detail-summary">
        <div className="admin-detail-media">
          {item.valuation.marketReference.currentListing?.imageUrl ? (
            <img src={item.valuation.marketReference.currentListing.imageUrl} alt={item.title} />
          ) : (
            <div>
              <ImageIcon aria-hidden="true" />
              <span>Authorized media unavailable</span>
            </div>
          )}
        </div>
        <DetailGroup title="Collectible">
          <Field label="Collectible ID" value={item.publicId} />
          <Field label="Status" value={sentence(item.status)} accent />
          <Field label="Asset type" value={item.identity.category} />
          <Field label="Created" value={date(item.createdAt)} />
          <Field label="Last updated" value={date(item.updatedAt)} />
        </DetailGroup>
        <DetailGroup title="Identity">
          <Field label="Set" value={item.identity.set} />
          <Field label="Card number" value={item.identity.cardNumber} />
          <Field label="Year" value={item.identity.year} />
          <Field label="Manufacturer" value={item.identity.manufacturer} />
          <Field label="Variant" value={item.identity.variant} />
        </DetailGroup>
        <DetailGroup title="Grading">
          <Field label="Grader" value={item.grading?.company} />
          <Field
            label="Grade"
            value={item.grading ? `${item.grading.grade} · ${item.grading.label}` : null}
          />
          <Field label="Cert number" value={item.grading?.certificationNumber} />
          <Field label="Population" value={item.grading?.population ?? "Unavailable"} />
        </DetailGroup>
        <DetailGroup title="Valuation">
          <Field
            label="Current supported"
            value={
              item.valuation.current
                ? money(item.valuation.current.minor, item.valuation.current.currency)
                : "Unavailable"
            }
            accent
          />
          <Field label="Method" value={item.valuation.current?.method} />
          <Field
            label="As of"
            value={item.valuation.current ? date(item.valuation.current.asOf) : null}
          />
          <Field
            label="Market reference"
            value={
              item.valuation.marketReference.currentListing
                ? money(
                    item.valuation.marketReference.currentListing.minor,
                    item.valuation.marketReference.currentListing.currency,
                  )
                : "Unavailable"
            }
          />
        </DetailGroup>
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
  receipt: { mutate: (variables?: void) => void; isPending: boolean };
}) {
  return (
    <div className="admin-detail-grid">
      <div className="admin-detail-main">
        <section className="admin-detail-card journey">
          <div className="admin-card-heading">
            <h3>Journey Timeline</h3>
            <span>{sentence(item.lifecycle.current)}</span>
          </div>
          <div className="admin-journey">
            {item.lifecycle.stages.map((stage) => (
              <div className={`admin-journey-step ${stage.state}`} key={stage.key}>
                <span>
                  {stage.state === "complete" ? (
                    <CheckCircle2 aria-hidden="true" />
                  ) : stage.state === "current" ? (
                    <ShieldCheck aria-hidden="true" />
                  ) : (
                    <i />
                  )}
                </span>
                <strong>{stage.label}</strong>
                <small>{stage.at ? date(stage.at) : "Upcoming"}</small>
              </div>
            ))}
          </div>
        </section>
        <div className="admin-detail-card-grid">
          <InfoCard title="Collector">
            <Field label="Name" value={item.collector?.displayName} />
            <Field
              label="Username"
              value={item.collector?.username ? `@${item.collector.username}` : null}
            />
            <Field
              label="Member since"
              value={item.collector ? date(item.collector.memberSince) : null}
            />
            <Field label="Submissions" value={item.collector?.submissions} />
            <LinkButton
              href={item.collector ? `/admin?section=users&user=${item.collector.id}` : undefined}
            >
              View Collector Profile
            </LinkButton>
          </InfoCard>
          <InfoCard title="Physical Intake">
            <Field label="Vault" value={item.intake?.vault} />
            <Field label="Tracking" value={item.intake?.tracking} />
            <Field label="Carrier" value={item.intake?.carrier} />
            <Field
              label="Received"
              value={
                item.intake?.receivedAt
                  ? date(item.intake.receivedAt)
                  : item.intake?.receiptConfirmedAt
                    ? date(item.intake.receiptConfirmedAt)
                    : "Pending"
              }
            />
            {item.intake?.deliveredAt && !item.intake.receiptConfirmedAt ? (
              <button
                className="admin-button primary"
                type="button"
                onClick={() => receipt.mutate()}
                disabled={receipt.isPending}
              >
                Confirm Receipt
              </button>
            ) : null}
          </InfoCard>
          <InfoCard title="Verification">
            <Field label="Status" value={sentence(item.verification.status)} accent />
            <Field label="Verified by" value={item.verification.verifiedBy} />
            <Field
              label="Verified at"
              value={item.verification.verifiedAt ? date(item.verification.verifiedAt) : null}
            />
            <Field label="Result" value={item.verification.decision} />
          </InfoCard>
          <InfoCard title="Current Location">
            <Field label="Location" value={item.custody.location ?? item.intake?.vault} />
            <Field label="Custody" value={sentence(item.custody.status)} accent />
            <Field
              label="Received"
              value={item.custody.receivedAt ? date(item.custody.receivedAt) : null}
            />
            <Field
              label="Secured"
              value={item.custody.securedAt ? date(item.custody.securedAt) : null}
            />
          </InfoCard>
        </div>
        <div className="admin-detail-card-grid lower">
          <InfoCard title="Market Information">
            <Field
              label="Current asking"
              value={
                item.market.asking
                  ? money(item.market.asking.minor, item.market.asking.currency)
                  : "Unavailable"
              }
            />
            <Field
              label="30d sales average"
              value={
                item.market.salesAverage
                  ? money(item.market.salesAverage.minor, item.market.salesAverage.currency)
                  : "Unavailable"
              }
            />
            <Field label="30d sales count" value={item.market.salesCount || "Unavailable"} />
            <Field
              label="Last market update"
              value={item.market.lastUpdated ? date(item.market.lastUpdated) : null}
            />
            <LinkButton href={`/asset/${item.slug}`}>View on Marketplace</LinkButton>
          </InfoCard>
          <InfoCard title="Recent Sales">
            {item.recentSales.length ? (
              item.recentSales.slice(0, 3).map((sale) => (
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
          <InfoCard title="Asset Metrics">
            {item.metrics.length ? (
              item.metrics.map((metric) => (
                <Field key={metric.label} label={metric.label} value={metric.value} />
              ))
            ) : (
              <p className="admin-empty-detail">No additional trusted metrics.</p>
            )}
          </InfoCard>
        </div>
      </div>
      <aside className="admin-detail-rail">
        <InfoCard title="Ownership">
          <Field label="Shares issued" value={item.ownership.issuedUnits ?? "Unavailable"} />
          <Field label="Total supply" value={item.ownership.totalUnits ?? "Unavailable"} />
          <Field label="Owner count" value={item.ownership.ownerCount ?? "Unavailable"} />
          <LinkButton href={`/asset/${item.slug}`}>View Ownership</LinkButton>
        </InfoCard>
        <InfoCard title="Admin Actions">
          <LinkButton href={`/operations/assets?asset=${item.id}`}>
            Open Lifecycle Operations
          </LinkButton>
          <LinkButton href={`/admin?section=valuations&asset=${item.id}`}>
            Update Valuation
          </LinkButton>
          <LinkButton href={`/admin?section=marketplace&asset=${item.id}&tab=marketplace`}>
            Marketplace Readiness
          </LinkButton>
        </InfoCard>
        <InfoCard title="Recent Activity">
          {item.activity.length ? (
            item.activity.slice(0, 7).map((event) => (
              <div className="admin-activity-row" key={event.id}>
                <strong>{sentence(event.action)}</strong>
                <small>
                  {event.actor} · {date(event.occurredAt)}
                </small>
                {event.detail ? <span>{event.detail}</span> : null}
              </div>
            ))
          ) : (
            <p className="admin-empty-detail">No activity recorded.</p>
          )}
        </InfoCard>
      </aside>
    </div>
  );
}

function TabContent({ item, tab }: { item: Detail; tab: DetailTab }) {
  const rows =
    tab === "submission"
      ? item.submissions.map((entry) => ({
          title: `Submission ${entry.id}`,
          detail: `${sentence(entry.status)} · submitted ${entry.submittedAt ? date(entry.submittedAt) : "not submitted"} · reviewer ${entry.reviewer ?? "unassigned"}`,
        }))
      : tab === "evidence"
        ? item.evidence.map((entry) => ({
            title: entry.filename,
            detail: `${sentence(entry.slot)} · ${sentence(entry.status)}`,
          }))
        : tab === "valuation"
          ? item.valuation.history.map((entry) => ({
              title: money(entry.minor, entry.currency),
              detail: `${entry.method} · ${date(entry.asOf)} · ${sentence(entry.status)}`,
            }))
          : tab === "history"
            ? item.activity.map((entry) => ({
                title: sentence(entry.action),
                detail: `${entry.actor} · ${date(entry.occurredAt)}${entry.detail ? ` · ${entry.detail}` : ""}`,
              }))
            : tab === "ownership"
              ? [
                  {
                    title: "Ownership projection",
                    detail: `${item.ownership.issuedUnits ?? "Unavailable"} issued of ${item.ownership.totalUnits ?? "Unavailable"} total · ${item.ownership.ownerCount ?? "Unavailable"} owners`,
                  },
                ]
              : [
                  {
                    title: label(tab),
                    detail:
                      tab === "marketplace"
                        ? `${sentence(item.market.publication)} · readiness ${sentence(item.market.readiness.status)}`
                        : tab === "custody"
                          ? `${sentence(item.custody.status)} · ${item.custody.location ?? "Location unavailable"}`
                          : tab === "shipping"
                            ? `${sentence(item.intake?.status ?? "Not started")} · ${item.intake?.tracking ?? "No tracking"}`
                            : `${sentence(item.verification.status)} · ${item.verification.note ?? "No additional notes"}`,
                  },
                ];
  return (
    <section className="admin-detail-card admin-detail-tab-panel">
      <div className="admin-card-heading">
        <h3>{label(tab)}</h3>
        <span>Authoritative projection</span>
      </div>
      {rows.length ? (
        rows.map((row, index) => (
          <div className="admin-tab-row" key={`${row.title}-${index}`}>
            <strong>{row.title}</strong>
            <span>{row.detail}</span>
          </div>
        ))
      ) : (
        <p className="admin-empty-detail">No records available for this section.</p>
      )}
    </section>
  );
}

function DetailGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="admin-summary-group">
      <h3>{title}</h3>
      {children}
    </section>
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
        {value === null || value === undefined || value === "" ? "Unavailable" : String(value)}
      </strong>
    </div>
  );
}
function LinkButton({
  href,
  children = "View Details",
}: {
  href?: string;
  children?: React.ReactNode;
}) {
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
  return value === "shipping"
    ? "Shipping & Intake"
    : value.replace(
        /(^|[-_])([a-z])/g,
        (_, prefix, letter) => `${prefix ? " " : ""}${letter.toUpperCase()}`,
      );
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
