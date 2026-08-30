import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpRight,
  Box,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  FileImage,
  Gem,
  Image as ImageIcon,
  Landmark,
  Link2,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Tag,
  TrendingUp,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import type { AdminCollectibleDetail as Detail } from "@/data/repositories";
import { useAppServices } from "@/providers/AppServicesProvider";
import "@/styles/admin-collectible-detail.css";
import {
  collectibleDetailTabs,
  formatCollectibleDetailState,
  type CollectibleDetailTab,
} from "./AdminCollectibleDetail.presentation";

type HistoryFilter =
  "all" | "identity" | "physical" | "valuation" | "ownership" | "market" | "restrictions";

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
  const selected = collectibleDetailTabs.includes((tab ?? "overview") as CollectibleDetailTab)
    ? ((tab ?? "overview") as CollectibleDetailTab)
    : "overview";
  const detail = useQuery({
    queryKey: ["admin", "collectible-dossier", assetId],
    queryFn: () => services.repositories.admin.getCollectibleDetail(assetId, selected),
    staleTime: 20_000,
  });
  if (detail.isLoading)
    return (
      <DetailState
        title="Loading canonical record"
        detail="Reading the authoritative asset dossier."
      />
    );
  if (detail.isError || !detail.data)
    return (
      <DetailState
        title="Collectible unavailable"
        detail="The canonical record could not be loaded. It may have moved or your access may have changed."
        retry={() => void detail.refetch()}
      />
    );
  const item = detail.data;
  return (
    <main className="collectible-dossier">
      <button type="button" className="dossier-back" onClick={onBack}>
        <ArrowLeft aria-hidden="true" /> Back to Collectibles
      </button>
      <DossierHeader item={item} />
      <SnapshotStrip item={item} />
      <nav className="dossier-tabs" aria-label="Collectible dossier sections">
        {collectibleDetailTabs.map((value) => (
          <button
            type="button"
            key={value}
            className={selected === value ? "active" : ""}
            onClick={() => onTab(value)}
          >
            {tabLabel(value)}
          </button>
        ))}
      </nav>
      {selected === "overview" ? <Overview item={item} /> : null}
      {selected === "identity-media" ? <IdentityMedia item={item} /> : null}
      {selected === "valuation" ? <Valuation item={item} /> : null}
      {selected === "ownership" ? <Ownership item={item} /> : null}
      {selected === "market" ? <Market item={item} /> : null}
      {selected === "history" ? <History item={item} /> : null}
    </main>
  );
}

function DossierHeader({ item }: { item: Detail }) {
  const front = item.media.find((media) => /front|primary|hero/i.test(media.slot)) ?? item.media[0];
  const provenance = item.dossier.provenance;
  return (
    <header className="dossier-header">
      <div className="dossier-image">
        {front?.url ? <img src={front.url} alt={item.title} /> : <ImageEmpty />}
      </div>
      <div className="dossier-header__identity">
        <div className="dossier-badges">
          <Badge tone="mint">Canonical asset</Badge>
          <Badge tone={item.dossier.workType === "PRODUCTION" ? "blue" : "amber"}>
            {sentence(item.dossier.workType)}
          </Badge>
          {item.grading ? (
            <Badge tone="violet">
              {item.grading.company} {item.grading.grade}
            </Badge>
          ) : null}
        </div>
        <h1>{item.title}</h1>
        <p className="dossier-subtitle">
          {[
            item.identity.year,
            item.identity.set,
            item.identity.cardNumber ? `#${item.identity.cardNumber}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "Canonical identity record"}
        </p>
        <div className="dossier-header__tags">
          {item.grading?.certificationNumber ? (
            <span>Certification #{item.grading.certificationNumber}</span>
          ) : null}
          <span>{sentence(item.dossier.snapshot.physical)}</span>
          <span>{sentence(item.dossier.snapshot.market)}</span>
        </div>
        <div className="dossier-facts">
          <HeaderFact label="Canonical Asset ID" value={item.publicId} />
          <HeaderFact label="Collector" value={item.collector?.displayName ?? "Not recorded"} />
          <HeaderFact
            label="Source Submission"
            value={provenance?.submissionId ?? "Not recorded"}
          />
          <HeaderFact label="Created" value={date(item.createdAt)} />
        </div>
      </div>
      <div className="dossier-quick-links" aria-label="Quick links">
        {provenance ? (
          <DossierLink
            href={`/admin?section=moderation&q=${encodeURIComponent(provenance.submissionId)}`}
          >
            View Submission
          </DossierLink>
        ) : null}
        {provenance && item.intake ? (
          <DossierLink
            href={`/admin?section=intake&intake=${encodeURIComponent(provenance.submissionId)}`}
          >
            Open Physical Intake
          </DossierLink>
        ) : null}
        <DossierLink href={`/admin?section=assetOperations&asset=${encodeURIComponent(item.id)}`}>
          Open Asset Operations
        </DossierLink>
        {item.collector ? (
          <DossierLink href={`/admin?section=users&user=${encodeURIComponent(item.collector.id)}`}>
            View Collector
          </DossierLink>
        ) : null}
      </div>
    </header>
  );
}

function SnapshotStrip({ item }: { item: Detail }) {
  const snapshot = item.dossier.snapshot;
  const entries = [
    {
      label: "Physical",
      value: snapshot.physical,
      detail: item.intake?.vault ?? "No intake record",
      icon: PackageCheck,
    },
    {
      label: "Verification",
      value: snapshot.verification,
      detail: item.verification.verifiedAt ? date(item.verification.verifiedAt) : "Not recorded",
      icon: ShieldCheck,
    },
    {
      label: "Custody",
      value: snapshot.custody,
      detail: item.custody.location ?? "Not established",
      icon: Landmark,
    },
    {
      label: "Valuation",
      value: snapshot.valuation,
      detail: item.valuation.current
        ? money(item.valuation.current.minor, item.valuation.current.currency)
        : "Not recorded",
      icon: TrendingUp,
    },
    {
      label: "Ownership",
      value: snapshot.ownership,
      detail: item.ownership.totalUnits ? `${item.ownership.totalUnits} units` : "Not configured",
      icon: UserRound,
    },
    {
      label: "Market",
      value: snapshot.market,
      detail: sentence(item.market.publication),
      icon: Sparkles,
    },
  ];
  return (
    <section className="dossier-snapshot" aria-label="Asset snapshot">
      <div className="dossier-snapshot__title">
        <Box aria-hidden="true" /> Asset Snapshot
      </div>
      <div className="dossier-snapshot__items">
        {entries.map(({ label, value, detail, icon: Icon }) => (
          <div className="dossier-snapshot__item" key={label}>
            <Icon aria-hidden="true" />
            <div>
              <small>{label}</small>
              <strong>{sentence(value)}</strong>
              <span>{detail}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Overview({ item }: { item: Detail }) {
  const provenance = item.dossier.provenance;
  return (
    <div className="dossier-layout">
      <div className="dossier-content">
        <div className="dossier-overview-top">
          <DossierCard title="Canonical Identity" icon={<Gem aria-hidden="true" />}>
            <FieldGrid
              fields={[
                ["Category", item.identity.category],
                ["Set / collection", item.identity.set],
                ["Card number", item.identity.cardNumber ? `#${item.identity.cardNumber}` : null],
                ["Variant", item.identity.variant],
                ["Year", item.identity.year],
                ["Grading company", item.grading?.company ?? "Raw / ungraded"],
                ["Grade", item.grading ? `${item.grading.grade} · ${item.grading.label}` : null],
                ["Certification", item.grading?.certificationNumber],
                ["Canonical Asset ID", item.publicId],
                ["Created", date(item.createdAt)],
                ["Work type", sentence(item.dossier.workType)],
                ["Identity authority", "Canonical record"],
              ]}
            />
          </DossierCard>
          <DossierCard title="Provenance & Origin" icon={<Link2 aria-hidden="true" />}>
            {provenance ? (
              <Provenance provenance={provenance} collector={item.collector?.displayName ?? null} />
            ) : (
              <Empty text="No source submission is linked to this canonical record." />
            )}
          </DossierCard>
        </div>
        <DossierCard
          title="Asset Lineage"
          icon={<Link2 aria-hidden="true" />}
          className="dossier-card--lineage"
        >
          <Lineage item={item} />
        </DossierCard>
        <div className="dossier-overview-lower">
          <DossierCard title="Physical Position" icon={<PackageCheck aria-hidden="true" />}>
            <FieldGrid
              fields={[
                ["Physical status", sentence(item.dossier.snapshot.physical)],
                ["Intake location", item.intake?.vault],
                ["Delivery method", item.intake ? sentence(item.intake.deliveryMethod) : null],
                [
                  "Receipt",
                  item.intake?.receiptConfirmedAt
                    ? `Confirmed ${date(item.intake.receiptConfirmedAt)}`
                    : "Not received",
                ],
                ["Verification", sentence(item.dossier.snapshot.verification)],
                ["Custody", sentence(item.dossier.snapshot.custody)],
              ]}
            />
            {item.intake && provenance ? (
              <DossierLink
                href={`/admin?section=intake&intake=${encodeURIComponent(provenance.submissionId)}`}
              >
                Open Physical Intake
              </DossierLink>
            ) : null}
          </DossierCard>
          <MediaPreview item={item} />
        </div>
        <DossierCard title="Related Records" icon={<Tag aria-hidden="true" />}>
          <RelatedRecords item={item} />
        </DossierCard>
      </div>
      <aside className="dossier-rail">
        <SummaryCard
          title="Market Summary"
          icon={<TrendingUp aria-hidden="true" />}
          fields={[
            ["Market status", sentence(item.dossier.snapshot.market)],
            [
              "Readiness",
              item.market.readiness.status === "READY"
                ? "Ready"
                : `${item.market.readiness.blockingCodes.length} requirement${item.market.readiness.blockingCodes.length === 1 ? "" : "s"} pending`,
            ],
            [
              "Initial offering",
              item.initialOffering ? sentence(item.initialOffering.status) : "Not created",
            ],
            ["Publication", sentence(item.market.publication)],
          ]}
          href={`/admin?section=assetOperations&asset=${encodeURIComponent(item.id)}&tab=market`}
        />
        <SummaryCard
          title="Ownership Summary"
          icon={<UserRound aria-hidden="true" />}
          fields={[
            ["State", sentence(item.dossier.snapshot.ownership)],
            ["Total units", item.ownership.totalUnits],
            ["Issued units", item.ownership.issuedUnits],
            ["Holders", item.ownership.ownerCount],
          ]}
          href={`/admin?section=assetOperations&asset=${encodeURIComponent(item.id)}&tab=ownership`}
        />
        <SummaryCard
          title="Valuation Summary"
          icon={<TrendingUp aria-hidden="true" />}
          fields={[
            [
              "Current valuation",
              item.valuation.current
                ? money(item.valuation.current.minor, item.valuation.current.currency)
                : "Not recorded",
            ],
            ["Last updated", item.valuation.current ? date(item.valuation.current.asOf) : null],
            [
              "Reference source",
              item.valuation.marketReference.currentListing?.source ??
                item.valuation.marketReference.recentSale?.source ??
                "None",
            ],
          ]}
          href={`/admin?section=assetOperations&asset=${encodeURIComponent(item.id)}&tab=valuation`}
        />
        <Restrictions item={item} />
        <DossierCard title="Quick Links" icon={<ArrowUpRight aria-hidden="true" />}>
          {provenance ? (
            <DossierLink
              href={`/admin?section=moderation&q=${encodeURIComponent(provenance.submissionId)}`}
            >
              View Submission
            </DossierLink>
          ) : null}
          {item.intake && provenance ? (
            <DossierLink
              href={`/admin?section=intake&intake=${encodeURIComponent(provenance.submissionId)}`}
            >
              Open Physical Intake
            </DossierLink>
          ) : null}
          <DossierLink href={`/admin?section=assetOperations&asset=${encodeURIComponent(item.id)}`}>
            Open Asset Operations
          </DossierLink>
          {item.collector ? (
            <DossierLink
              href={`/admin?section=users&user=${encodeURIComponent(item.collector.id)}`}
            >
              View Collector Profile
            </DossierLink>
          ) : null}
        </DossierCard>
      </aside>
    </div>
  );
}

function IdentityMedia({ item }: { item: Detail }) {
  return (
    <div className="dossier-content dossier-content--single">
      <DossierCard title="Canonical Identity" icon={<Gem aria-hidden="true" />}>
        <p className="dossier-intro">
          These read-only values are Slice’s canonical identity for this asset.
        </p>
        <FieldGrid
          fields={[
            ["Title", item.title],
            ["Category", item.identity.category],
            ["Set / collection", item.identity.set],
            ["Year", item.identity.year],
            ["Card number", item.identity.cardNumber],
            ["Variant", item.identity.variant],
            ["Grading company", item.grading?.company ?? "Raw / ungraded"],
            ["Grade", item.grading?.grade],
            ["Certification", item.grading?.certificationNumber],
            ["Canonical Asset ID", item.publicId],
          ]}
        />
      </DossierCard>
      <DossierCard title="Approved Media" icon={<FileImage aria-hidden="true" />}>
        <MediaGrid media={item.media} title="Canonical / approved media" />
      </DossierCard>
      <DossierCard title="Data Provenance" icon={<ShieldCheck aria-hidden="true" />}>
        <FieldGrid
          fields={[
            ["Identity", "Canonical record"],
            ["Source media", "Collector supplied / safety-approved"],
            ["Grade", item.grading ? "Canonical grading record" : "Not applicable"],
            [
              "External reference",
              item.valuation.marketReference.currentListing?.source ?? "None attached",
            ],
          ]}
        />
      </DossierCard>
    </div>
  );
}

function Valuation({ item }: { item: Detail }) {
  const valuation = item.valuation.current;
  return (
    <div className="dossier-content dossier-content--single">
      <DossierCard title="Current Valuation" icon={<TrendingUp aria-hidden="true" />}>
        {valuation ? (
          <div className="dossier-valuation-value">
            <strong>{money(valuation.minor, valuation.currency)}</strong>
            <span>Staff-recorded valuation</span>
          </div>
        ) : (
          <Empty
            title="No valuation recorded"
            text="No staff valuation has been recorded for this canonical asset."
          />
        )}
        {valuation ? (
          <FieldGrid
            fields={[
              ["Recorded", date(valuation.asOf)],
              ["Recorded by", valuation.actor],
              ["Basis", valuation.method],
            ]}
          />
        ) : null}
        <DossierLink
          href={`/admin?section=assetOperations&asset=${encodeURIComponent(item.id)}&tab=valuation`}
        >
          Open Asset Operations
        </DossierLink>
      </DossierCard>
      <DossierCard title="Reference Inputs" icon={<ExternalLink aria-hidden="true" />}>
        <ReferenceRows item={item} />
      </DossierCard>
      <DossierCard title="Valuation History" icon={<TrendingUp aria-hidden="true" />}>
        {item.valuation.history.length ? (
          <table className="dossier-table">
            <thead>
              <tr>
                <th>Value</th>
                <th>Recorded</th>
                <th>Basis</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {item.valuation.history.map((entry) => (
                <tr key={entry.id}>
                  <td>{money(entry.minor, entry.currency)}</td>
                  <td>{date(entry.asOf)}</td>
                  <td>{entry.method}</td>
                  <td>{sentence(entry.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty text="No valuation history is available." />
        )}
      </DossierCard>
    </div>
  );
}

function Ownership({ item }: { item: Detail }) {
  if (!item.ownership.totalUnits)
    return (
      <div className="dossier-content dossier-content--single">
        <DossierCard title="Ownership" icon={<UserRound aria-hidden="true" />}>
          <Empty
            title="Ownership Not Configured"
            text="No ownership structure has been created for this canonical asset."
          />
          <DossierLink
            href={`/admin?section=assetOperations&asset=${encodeURIComponent(item.id)}&tab=ownership`}
          >
            Open Asset Operations
          </DossierLink>
        </DossierCard>
      </div>
    );
  const total = Number(item.ownership.totalUnits);
  return (
    <div className="dossier-content dossier-content--single">
      <DossierCard title="Ownership Summary" icon={<UserRound aria-hidden="true" />}>
        <div className="dossier-stat-grid">
          <Stat label="Total Units" value={item.ownership.totalUnits} />
          <Stat label="Issued" value={item.ownership.issuedUnits ?? "0"} />
          <Stat label="Available" value={item.ownership.availableUnits ?? "0"} />
          <Stat label="Holders" value={item.ownership.ownerCount ?? "Unavailable"} />
        </div>
        <div className="ownership-distribution">
          {item.ownership.holders?.map((holder) => (
            <div
              key={holder.accountId}
              style={{
                width: `${Math.max(3, holder.percentage ?? (total ? (Number(holder.units) / total) * 100 : 0))}%`,
              }}
              title={`${holder.displayName}: ${holder.units} units`}
            />
          ))}
        </div>
      </DossierCard>
      <DossierCard title="Ownership Positions" icon={<UserRound aria-hidden="true" />}>
        {item.ownership.holders?.length ? (
          <table className="dossier-table">
            <thead>
              <tr>
                <th>Holder</th>
                <th>Units</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {item.ownership.holders.map((holder) => (
                <tr key={holder.accountId}>
                  <td>
                    {holder.displayName}
                    {holder.username ? <small> @{holder.username}</small> : null}
                  </td>
                  <td>{holder.units}</td>
                  <td>{holder.percentage === null ? "—" : `${holder.percentage}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty text="No settled ownership positions are available." />
        )}
      </DossierCard>
    </div>
  );
}

function Market({ item }: { item: Detail }) {
  const offering = item.initialOffering;
  return (
    <div className="dossier-content dossier-content--single">
      <DossierCard title="Market Status" icon={<TrendingUp aria-hidden="true" />}>
        <div className="dossier-stat-grid">
          <Stat label="Market state" value={sentence(item.dossier.snapshot.market)} />
          <Stat label="Publication" value={sentence(item.market.publication)} />
          <Stat
            label="Trading"
            value={item.market.trading ? sentence(item.market.trading.status) : "Not created"}
          />
          <Stat
            label="Readiness"
            value={item.market.readiness.status === "READY" ? "Ready" : "Requirements pending"}
          />
        </div>
        {item.market.readiness.blockingCodes.length ? (
          <div className="dossier-requirements">
            <strong>Requirements</strong>
            {item.market.readiness.blockingCodes.map((code) => (
              <span key={code}>{sentence(code)}</span>
            ))}
          </div>
        ) : null}
      </DossierCard>
      <DossierCard title="Initial Offering" icon={<Sparkles aria-hidden="true" />}>
        {offering ? (
          <FieldGrid
            fields={[
              ["Offering ID", offering.offeringId],
              ["Status", sentence(offering.status)],
              ["Price per Slice", money(offering.pricePerUnitMinor, offering.currency)],
              ["Units offered", offering.offeredUnits],
              ["Units remaining", offering.inventory?.availableUnits],
              ["Opened", offering.openedAt ? date(offering.openedAt) : null],
              [
                "Collector proceeds",
                money(offering.proceeds.availableMinor, offering.proceeds.currency),
              ],
            ]}
          />
        ) : (
          <Empty
            title="Initial Offering Not Created"
            text="No initial offering has been configured for this asset."
          />
        )}
      </DossierCard>
      <DossierCard title="Market References" icon={<ExternalLink aria-hidden="true" />}>
        <ReferenceRows item={item} />
      </DossierCard>
      <DossierLink
        href={`/admin?section=assetOperations&asset=${encodeURIComponent(item.id)}&tab=market`}
      >
        Open Asset Operations
      </DossierLink>
    </div>
  );
}

function History({ item }: { item: Detail }) {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const events = useMemo(() => historyEvents(item), [item]);
  const visible = filter === "all" ? events : events.filter((event) => event.category === filter);
  return (
    <div className="dossier-content dossier-content--single">
      <DossierCard title="Asset History" icon={<Link2 aria-hidden="true" />}>
        <p className="dossier-intro">
          Canonical asset events and related operating records. Authentication and telemetry events
          are not included.
        </p>
        <div className="history-filters">
          {(
            [
              "all",
              "identity",
              "physical",
              "valuation",
              "ownership",
              "market",
              "restrictions",
            ] as HistoryFilter[]
          ).map((value) => (
            <button
              type="button"
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value)}
              key={value}
            >
              {sentence(value)}
            </button>
          ))}
        </div>
        <div className="dossier-timeline">
          {visible.length ? (
            visible.map((event) => (
              <div key={event.id} className={`dossier-timeline__event ${event.category}`}>
                <span />
                <div>
                  <small>
                    {sentence(event.category)} · {date(event.at)}
                  </small>
                  <strong>{event.title}</strong>
                  <p>
                    {event.detail}
                    {event.actor ? ` · ${event.actor}` : ""}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <Empty text="No events match this history filter." />
          )}
        </div>
      </DossierCard>
    </div>
  );
}

function Provenance({
  provenance,
  collector,
}: {
  provenance: NonNullable<Detail["dossier"]["provenance"]>;
  collector: string | null;
}) {
  return (
    <FieldGrid
      fields={[
        ["Origin", "Collector submission"],
        ["Collector", collector],
        ["Source submission", provenance.submissionId],
        [
          "Submission accepted",
          provenance.acceptedAt ? date(provenance.acceptedAt) : "Not recorded",
        ],
        ["Canonicalized", date(provenance.canonicalizedAt)],
        ["Canonicalized by", provenance.canonicalizedBy],
        ["Basis", provenance.canonicalizationBasis],
      ]}
    />
  );
}
function Lineage({ item }: { item: Detail }) {
  const provenance = item.dossier.provenance;
  return (
    <div className="dossier-lineage">
      <RecordNode
        title="Source Submission"
        id={provenance?.submissionId ?? null}
        status={provenance?.submissionStatus ?? "Not recorded"}
      />
      <div className="dossier-lineage__connector" />
      <RecordNode title="Canonical Asset" id={item.publicId} status="Canonical" current />
      <div className="dossier-lineage__branches">
        {item.dossier.relatedRecords
          .filter((record) => record.kind !== "SOURCE_SUBMISSION")
          .map((record) => (
            <RecordNode
              key={record.kind}
              title={record.label}
              id={record.id}
              status={record.status}
            />
          ))}
      </div>
    </div>
  );
}
function RecordNode({
  title,
  id,
  status,
  current = false,
}: {
  title: string;
  id: string | null;
  status: string;
  current?: boolean;
}) {
  return (
    <div className={`dossier-record-node${current ? " current" : ""}`}>
      <small>{title}</small>
      <strong>{id ?? statusLabel(status)}</strong>
      <span>{sentence(status)}</span>
    </div>
  );
}
function MediaPreview({ item }: { item: Detail }) {
  return (
    <DossierCard title="Asset Media" icon={<FileImage aria-hidden="true" />}>
      {item.media.length ? (
        <div className="dossier-media-preview">
          {item.media.slice(0, 5).map((media) => (
            <MediaThumb key={`${media.slot}-${media.filename}`} media={media} />
          ))}
        </div>
      ) : (
        <Empty text="No approved media is available." />
      )}
    </DossierCard>
  );
}
function MediaGrid({ media, title }: { media: Detail["media"]; title: string }) {
  return media.length ? (
    <div>
      <p className="dossier-media-label">{title}</p>
      <div className="dossier-media-grid">
        {media.map((entry) => (
          <MediaThumb key={`${entry.slot}-${entry.filename}`} media={entry} large />
        ))}
      </div>
    </div>
  ) : (
    <Empty text="No approved media is available." />
  );
}
function MediaThumb({ media, large = false }: { media: Detail["media"][number]; large?: boolean }) {
  const image = media.url ? <img src={media.url} alt={media.slot} /> : <ImageEmpty />;
  return (
    <a
      className={`dossier-media-thumb${large ? " large" : ""}`}
      href={media.url ?? undefined}
      target={media.url ? "_blank" : undefined}
      rel="noreferrer"
    >
      {image}
      <span>{sentence(media.slot)}</span>
    </a>
  );
}
function RelatedRecords({ item }: { item: Detail }) {
  return (
    <div className="related-records">
      {item.dossier.relatedRecords.map((record) => (
        <div key={record.kind}>
          <span>{record.label}</span>
          <strong>{record.id ?? statusLabel(record.status)}</strong>
          <small>{sentence(record.status)}</small>
        </div>
      ))}
    </div>
  );
}
function SummaryCard({
  title,
  icon,
  fields,
  href,
}: {
  title: string;
  icon: ReactNode;
  fields: Array<[string, string | number | null | undefined]>;
  href?: string;
}) {
  return (
    <DossierCard title={title} icon={icon}>
      <FieldGrid fields={fields} />
      {href ? <DossierLink href={href}>Open related workspace</DossierLink> : null}
    </DossierCard>
  );
}
function Restrictions({ item }: { item: Detail }) {
  const restrictions = item.dossier.restrictions;
  return (
    <DossierCard title="Restrictions / Conflicts" icon={<CircleAlert aria-hidden="true" />}>
      {restrictions.length ? (
        <div className="dossier-restrictions">
          {restrictions.map((restriction) => (
            <div key={`${restriction.source}-${restriction.createdAt}`}>
              <strong>{restriction.reason}</strong>
              <span>
                {sentence(restriction.source)} · {sentence(restriction.status)} ·{" "}
                {date(restriction.createdAt)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="dossier-clear">
          <CheckCircle2 aria-hidden="true" /> No active restrictions or conflicts.
        </div>
      )}
    </DossierCard>
  );
}
function ReferenceRows({ item }: { item: Detail }) {
  const references = [
    item.valuation.marketReference.currentListing,
    item.valuation.marketReference.recentSale,
  ].filter(Boolean) as NonNullable<Detail["valuation"]["marketReference"]["currentListing"]>[];
  return references.length ? (
    <div className="dossier-references">
      {references.map((reference) => (
        <div key={`${reference.source}-${reference.observedAt}`}>
          <strong>{reference.source}</strong>
          <span>
            {money(reference.minor, reference.currency)} · {date(reference.observedAt)}
          </span>
          {reference.url ? (
            <a href={reference.url} target="_blank" rel="noreferrer">
              Open reference <ExternalLink aria-hidden="true" />
            </a>
          ) : null}
        </div>
      ))}
    </div>
  ) : (
    <Empty text="No external valuation references are attached." />
  );
}
function FieldGrid({ fields }: { fields: Array<[string, string | number | null | undefined]> }) {
  return (
    <dl className="dossier-fields">
      {fields.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value === null || value === undefined || value === "" ? "—" : value}</dd>
        </div>
      ))}
    </dl>
  );
}
function HeaderFact({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <small>{label}</small>
      <strong>{value ?? "—"}</strong>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <small>{label}</small>
      <strong>{value ?? "—"}</strong>
    </div>
  );
}
function DossierCard({
  title,
  icon,
  children,
  className = "",
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`dossier-card ${className}`}>
      <h2>
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}
function DossierLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="dossier-link" href={href}>
      {children}
      <ArrowUpRight aria-hidden="true" />
    </a>
  );
}
function Badge({
  tone,
  children,
}: {
  tone: "mint" | "blue" | "amber" | "violet";
  children: ReactNode;
}) {
  return <span className={`dossier-badge ${tone}`}>{children}</span>;
}
function ImageEmpty() {
  return (
    <div className="dossier-image-empty">
      <ImageIcon aria-hidden="true" />
      <span>No approved media</span>
    </div>
  );
}
function Empty({ title, text }: { title?: string; text: string }) {
  return (
    <div className="dossier-empty">
      {title ? <strong>{title}</strong> : null}
      <span>{text}</span>
    </div>
  );
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
    <main className="collectible-dossier">
      <section className="dossier-state">
        <h1>{title}</h1>
        <p>{detail}</p>
        {retry ? (
          <button type="button" onClick={retry}>
            Retry
          </button>
        ) : null}
      </section>
    </main>
  );
}

function historyEvents(item: Detail) {
  const provenance = item.dossier.provenance;
  const events = [
    ...(provenance?.submittedAt
      ? [
          {
            id: `submitted-${provenance.submissionId}`,
            category: "identity" as const,
            at: provenance.submittedAt,
            title: "Collector submitted asset",
            detail: `Source submission ${provenance.submissionId}`,
            actor: item.collector?.displayName ?? null,
          },
        ]
      : []),
    ...(provenance?.acceptedAt
      ? [
          {
            id: `accepted-${provenance.submissionId}`,
            category: "identity" as const,
            at: provenance.acceptedAt,
            title: "Submission approved",
            detail: `Source submission ${provenance.submissionId}`,
            actor: provenance.canonicalizedBy,
          },
        ]
      : []),
    ...(provenance
      ? [
          {
            id: `canonical-${item.id}`,
            category: "identity" as const,
            at: provenance.canonicalizedAt,
            title: "Canonical asset created",
            detail: item.publicId,
            actor: provenance.canonicalizedBy,
          },
        ]
      : []),
    ...(item.intake?.receivedAt
      ? [
          {
            id: `received-${item.intake.id}`,
            category: "physical" as const,
            at: item.intake.receivedAt,
            title: "Physical receipt recorded",
            detail: item.intake.vault ?? "Physical Intake",
            actor: null,
          },
        ]
      : []),
    ...(item.verification.verifiedAt
      ? [
          {
            id: "verified",
            category: "physical" as const,
            at: item.verification.verifiedAt,
            title: "Verification completed",
            detail: item.verification.decision ?? "Verification record",
            actor: item.verification.verifiedBy,
          },
        ]
      : []),
    ...item.custody.history.map((entry, index) => ({
      id: `custody-${index}-${entry.at}`,
      category: "physical" as const,
      at: entry.at,
      title: "Custody updated",
      detail: sentence(entry.status),
      actor: null,
    })),
    ...item.valuation.history.map((entry) => ({
      id: `valuation-${entry.id}`,
      category: "valuation" as const,
      at: entry.asOf,
      title: "Valuation recorded",
      detail: `${money(entry.minor, entry.currency)} · ${entry.method}`,
      actor: null,
    })),
    ...(item.ownership.totalUnits
      ? [
          {
            id: "ownership",
            category: "ownership" as const,
            at: item.updatedAt,
            title: "Ownership structure configured",
            detail: `${item.ownership.totalUnits} total units`,
            actor: null,
          },
        ]
      : []),
    ...(item.initialOffering?.openedAt
      ? [
          {
            id: `offering-${item.initialOffering.offeringId}`,
            category: "market" as const,
            at: item.initialOffering.openedAt,
            title: "Initial offering opened",
            detail: item.initialOffering.status,
            actor: null,
          },
        ]
      : []),
    ...(item.market.publication === "PUBLISHED"
      ? [
          {
            id: "published",
            category: "market" as const,
            at: item.updatedAt,
            title: "Market publication live",
            detail: "Public market record",
            actor: null,
          },
        ]
      : []),
    ...item.dossier.restrictions.map((restriction, index) => ({
      id: `restriction-${index}-${restriction.createdAt}`,
      category: "restrictions" as const,
      at: restriction.createdAt,
      title: "Restriction recorded",
      detail: restriction.reason,
      actor: restriction.source,
    })),
  ];
  return events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
function tabLabel(value: CollectibleDetailTab) {
  return value === "identity-media" ? "Identity & Media" : sentence(value);
}
function sentence(value: unknown) {
  return formatCollectibleDetailState(value);
}
function statusLabel(value: string) {
  return ["NOT_RECORDED", "NOT_CREATED", "NOT_CONFIGURED", "NOT_ESTABLISHED"].includes(value)
    ? "Not created"
    : sentence(value);
}
function date(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(
        parsed,
      );
}
function money(minor: string, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(
      Number(BigInt(minor)) / 100,
    );
  } catch {
    return "—";
  }
}
