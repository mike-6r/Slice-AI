import {
  ArrowRight,
  Box,
  ChevronDown,
  CircleAlert,
  ClipboardCheck,
  LockKeyhole,
  MoreVertical,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
  Truck,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { AdminCatalogueAsset, AdminCatalogueResponse } from "@/data/repositories";
import { useAppServices } from "@/providers/AppServicesProvider";
import { useQuery } from "@tanstack/react-query";
import "@/styles/admin-catalogue.css";

export type CatalogueFilters = {
  category: string;
  physicalState: string;
  custody: string;
  verification: string;
  valuation: string;
  ownership: string;
  market: string;
  grading: string;
  collector: string;
  fixture: "NORMAL" | "TEST" | "ALL";
  workType: "ALL" | "PRODUCTION" | "DEMO_QA";
  sort: string;
};
const initialFilters: CatalogueFilters = {
  category: "",
  physicalState: "",
  custody: "",
  verification: "",
  valuation: "",
  ownership: "",
  market: "",
  grading: "",
  collector: "",
  fixture: "NORMAL",
  workType: "PRODUCTION",
  sort: "updated",
};

export function AdminCollectibleCatalogue({
  query,
  status,
  page,
  filters,
  update,
  previewId,
  onPreview,
  onOpen,
  onOpenIntake,
  onOpenCollector,
}: {
  query: string;
  status: string;
  page: number;
  filters: CatalogueFilters;
  update: (patch: Record<string, string | undefined>) => void;
  previewId?: string;
  onPreview: (id: string | null) => void;
  onOpen: (assetId: string) => void;
  onOpenIntake: (submissionId: string) => void;
  onOpenCollector: (collectorId: string) => void;
}) {
  const services = useAppServices();
  const [search, setSearch] = useState(query);
  const catalogue = useQuery({
    queryKey: ["admin", "catalogue", query, status, page, filters],
    queryFn: () =>
      services.repositories.admin.listCatalogueAssets({
        q: query || undefined,
        status: status || undefined,
        ...filters,
        page,
        pageSize: 25,
      }),
    staleTime: 20_000,
  });
  useEffect(() => setSearch(query), [query]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = search.trim() || undefined;
      if (next !== (query || undefined)) update({ q: next, page: "1" });
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query, search, update]);
  if (catalogue.isLoading) return <CatalogueLoading />;
  if (catalogue.isError || !catalogue.data)
    return (
      <CatalogueState
        title="Collectibles unavailable"
        detail="The canonical catalogue could not be loaded safely. Counts are unavailable until the authority responds."
        retry={() => void catalogue.refetch()}
      />
    );
  const selected = catalogue.data.items.find((item) => item.id === previewId) ?? null;
  return (
    <CatalogueContent
      data={catalogue.data}
      search={search}
      status={status}
      filters={filters}
      selected={selected}
      setSearch={setSearch}
      setFilters={(patch) => {
        const nextFilters = { ...filters, ...patch };
        return update({
          category: nextFilters.category || undefined,
          physicalState: nextFilters.physicalState || undefined,
          custody: nextFilters.custody || undefined,
          verification: nextFilters.verification || undefined,
          valuation: nextFilters.valuation || undefined,
          ownership: nextFilters.ownership || undefined,
          market: nextFilters.market || undefined,
          grading: nextFilters.grading || undefined,
          collector: nextFilters.collector || undefined,
          fixture: nextFilters.fixture,
          workType: nextFilters.workType,
          sort: nextFilters.sort === initialFilters.sort ? undefined : nextFilters.sort,
          page: "1",
        });
      }}
      update={update}
      onRefresh={() => void catalogue.refetch()}
      onPreview={onPreview}
      onOpen={onOpen}
      onOpenIntake={onOpenIntake}
      onOpenCollector={onOpenCollector}
    />
  );
}

function CatalogueContent({
  data,
  search,
  status,
  filters,
  selected,
  setSearch,
  setFilters,
  update,
  onRefresh,
  onPreview,
  onOpen,
  onOpenIntake,
  onOpenCollector,
}: {
  data: AdminCatalogueResponse;
  search: string;
  status: string;
  filters: CatalogueFilters;
  selected: AdminCatalogueAsset | null;
  setSearch: (value: string) => void;
  setFilters: (patch: Partial<CatalogueFilters>) => void;
  update: (patch: Record<string, string | undefined>) => void;
  onRefresh: () => void;
  onPreview: (id: string | null) => void;
  onOpen: (id: string) => void;
  onOpenIntake: (submissionId: string) => void;
  onOpenCollector: (collectorId: string) => void;
}) {
  const activeFilterCount =
    Object.entries(filters).filter(([key, value]) => {
      if (key === "sort") return false;
      if (key === "fixture") return false;
      if (key === "workType") return value !== "PRODUCTION";
      return Boolean(value);
    }).length + (status ? 1 : 0);
  const hasFilters = Boolean(search.trim()) || activeFilterCount > 0;
  return (
    <main className="admin-catalogue-page">
      <header className="admin-catalogue-header">
        <div>
          <p className="admin-catalogue-eyebrow">Admin console</p>
          <div className="admin-catalogue-title-row">
            <h2>Collectibles</h2>
            <span className="admin-catalogue-authority">Canonical Asset authority</span>
          </div>
          <p>Slice&apos;s authoritative catalogue of canonical collectible assets.</p>
        </div>
        <div className="admin-catalogue-header-actions">
          <label className="admin-catalogue-global-search">
            <Search aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search collectibles…"
              aria-label="Search collectibles"
            />
          </label>
          <button type="button" className="admin-catalogue-refresh" onClick={onRefresh}>
            <RefreshCw size={15} aria-hidden="true" /> Refresh
          </button>
        </div>
      </header>
      <section className="admin-catalogue-summary" aria-label="Catalogue summary">
        <Metric label="Total collectibles" value={data.summary.total} icon={<Box />} />
        <Metric
          label="Needs attention"
          value={data.summary.needsAttention}
          icon={<CircleAlert />}
          tone="amber"
        />
        <Metric
          label="In physical intake"
          value={data.summary.inPhysicalIntake}
          icon={<Truck />}
          tone="blue"
        />
        <Metric
          label="Verified"
          value={data.summary.verified}
          icon={<ShieldCheck />}
          tone="green"
        />
        <Metric
          label="In custody"
          value={data.summary.inCustody}
          icon={<LockKeyhole />}
          tone="purple"
        />
        <Metric
          label="Market live"
          value={data.summary.marketLive}
          icon={<TrendingUp />}
          tone="green"
        />
      </section>
      <section className="admin-catalogue-workspace">
        <div className="admin-catalogue-main">
          <div className="admin-catalogue-toolbar">
            <label className="admin-catalogue-search">
              <Search aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search title, set, card number, cert #, asset ID, collector…"
                aria-label="Search collectibles"
              />
            </label>
            <FilterInput
              label="Category"
              value={filters.category}
              onChange={(value) => setFilters({ category: value })}
            />
            <FilterSelect
              label="Physical state"
              value={filters.physicalState}
              onChange={(value) => setFilters({ physicalState: value })}
              options={[
                "AWAITING_RECEIPT",
                "NOT_STARTED",
                "AWAITING_DESTINATION",
                "AWAITING_SHIPMENT",
                "AWAITING_DROP_OFF",
                "IN_TRANSIT",
                "CARRIER_DELIVERED",
                "RECEIVED",
                "VERIFYING",
                "READY_FOR_CUSTODY",
                "IN_CUSTODY",
                "EXCEPTION",
              ]}
            />
            <FilterSelect
              label="Verification"
              value={filters.verification}
              onChange={(value) => setFilters({ verification: value })}
              options={["NOT_STARTED", "IN_PROGRESS", "VERIFIED", "EXCEPTION"]}
            />
            <FilterSelect
              label="Custody"
              value={filters.custody}
              onChange={(value) => setFilters({ custody: value })}
              options={[
                "NOT_ESTABLISHED",
                "EXPECTED",
                "RECEIVED",
                "READY_FOR_CUSTODY",
                "IN_CUSTODY",
                "EXCEPTION",
              ]}
            />
            <FilterSelect
              label="Market"
              value={filters.market}
              onChange={(value) => setFilters({ market: value })}
              options={["NOT_PUBLISHED", "INITIAL_OFFERING", "LIVE", "PAUSED"]}
            />
            <FilterSelect
              label="Sort"
              value={filters.sort}
              onChange={(value) => setFilters({ sort: value })}
              options={["updated", "newest", "oldest", "title"]}
            />
            <details className="admin-catalogue-more-filters">
              <summary>
                More filters <ChevronDown size={13} />
              </summary>
              <div>
                <FilterSelect
                  label="Valuation"
                  value={filters.valuation}
                  onChange={(value) => setFilters({ valuation: value })}
                  options={["NOT_RECORDED", "VALUED"]}
                />
                <FilterSelect
                  label="Grading"
                  value={filters.grading}
                  onChange={(value) => setFilters({ grading: value })}
                  options={["RAW", "GRADED"]}
                />
                <FilterInput
                  label="Collector / source"
                  value={filters.collector}
                  onChange={(value) => setFilters({ collector: value })}
                />
                <FilterSelect
                  label="Ownership"
                  value={filters.ownership}
                  onChange={(value) => setFilters({ ownership: value })}
                  options={["NOT_CONFIGURED", "PENDING_APPROVAL", "CONFIGURED", "ISSUED"]}
                />
                <FilterSelect
                  label="Status"
                  value={status}
                  onChange={(value) => update({ status: value || undefined, page: "1" })}
                  options={["DRAFT", "IN_REVIEW", "VERIFIED", "PUBLISHED", "ARCHIVED"]}
                />
              </div>
            </details>
            <FilterSelect
              label="Work type"
              value={filters.workType}
              onChange={(value) => setFilters({ workType: value as CatalogueFilters["workType"] })}
              options={["PRODUCTION", "DEMO_QA", "ALL"]}
            />
            {activeFilterCount ? (
              <button
                type="button"
                className="admin-catalogue-clear"
                onClick={() => {
                  update({
                    status: undefined,
                    q: undefined,
                    category: undefined,
                    physicalState: undefined,
                    custody: undefined,
                    verification: undefined,
                    valuation: undefined,
                    ownership: undefined,
                    market: undefined,
                    grading: undefined,
                    collector: undefined,
                    fixture: "NORMAL",
                    workType: "PRODUCTION",
                    sort: undefined,
                    page: "1",
                  });
                  setSearch("");
                }}
              >
                Clear filters
              </button>
            ) : null}
          </div>
          <div className="admin-catalogue-table-meta">
            <span>
              <strong>{data.pagination.total}</strong>{" "}
              {hasFilters ? "matching collectibles" : "canonical collectibles"}
            </span>
            {filters.workType !== "ALL" ? (
              <span>Work type: {sentence(filters.workType)}</span>
            ) : null}
          </div>
          {data.items.length ? (
            <CatalogueTable
              items={data.items}
              selectedId={selected?.id ?? null}
              onPreview={onPreview}
              onOpen={onOpen}
            />
          ) : (
            <section className="admin-catalogue-empty">
              <strong>
                {hasFilters
                  ? "No collectibles match these filters."
                  : "No canonical collectibles have been created yet."}
              </strong>
              <p>
                {hasFilters
                  ? "Try clearing a filter or searching by a shorter canonical field."
                  : "Approved submissions appear here once an authorised canonical Asset record is explicitly created and linked."}
              </p>
            </section>
          )}
          <footer className="admin-catalogue-pagination">
            <span>
              {data.pagination.total
                ? `Showing ${(data.pagination.page - 1) * data.pagination.pageSize + 1}–${Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.total)} of ${data.pagination.total}`
                : hasFilters
                  ? "No matching records"
                  : "No canonical records"}
            </span>
            <div>
              <button
                type="button"
                disabled={data.pagination.page <= 1}
                onClick={() => update({ page: String(data.pagination.page - 1) })}
              >
                Previous
              </button>
              <strong>{data.pagination.page}</strong>
              <button
                type="button"
                disabled={data.pagination.page >= data.pagination.totalPages}
                onClick={() => update({ page: String(data.pagination.page + 1) })}
              >
                Next
              </button>
            </div>
          </footer>
        </div>
        {selected ? (
          <Preview
            item={selected}
            onClose={() => onPreview(null)}
            onOpen={onOpen}
            onOpenIntake={onOpenIntake}
            onOpenCollector={onOpenCollector}
          />
        ) : (
          <PreviewEmpty />
        )}
      </section>
    </main>
  );
}

function CatalogueTable({
  items,
  selectedId,
  onPreview,
  onOpen,
}: {
  items: AdminCatalogueAsset[];
  selectedId: string | null;
  onPreview: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="admin-catalogue-table-wrap">
      <table className="admin-catalogue-table">
        <thead>
          <tr>
            <th>Collectible</th>
            <th>Collector / source</th>
            <th>Physical</th>
            <th>Verification</th>
            <th>Custody</th>
            <th>Valuation</th>
            <th>Ownership</th>
            <th>Market</th>
            <th>Next action</th>
            <th>Updated</th>
            <th aria-label="More actions" />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className={selectedId === item.id ? "is-selected" : ""}
              onClick={() => onPreview(item.id)}
            >
              <td>
                <div className="catalogue-identity">
                  <CollectibleThumbnail src={item.thumbnailUrl} />
                  <div>
                    <strong>{item.title}</strong>
                    <small>
                      {item.identity.year ?? "Year unavailable"} ·{" "}
                      {item.identity.set ?? "Set unavailable"} ·{" "}
                      {item.identity.cardNumber
                        ? `#${item.identity.cardNumber}`
                        : "Card unavailable"}
                    </small>
                    <small>
                      {item.identity.grading
                        ? `${item.identity.grading.company} ${item.identity.grading.grade} · Cert ${item.identity.grading.certStatus === "ON_FILE" ? "on file" : "unavailable"}`
                        : "Raw / ungraded"}
                    </small>
                    <small className="catalogue-asset-id">
                      Asset {shortId(item.publicId)}{" "}
                      {item.workType !== "PRODUCTION" ? (
                        <em>{workTypeLabel(item.workType)}</em>
                      ) : null}
                    </small>
                  </div>
                </div>
              </td>
              <td>
                {item.provenance ? (
                  <>
                    <strong>{item.provenance.collector}</strong>
                    <small>
                      {item.provenance.username ? `@${item.provenance.username}` : "Collector"}
                    </small>
                    <small>Submission #{shortId(item.provenance.submissionId)}</small>
                  </>
                ) : (
                  <span>Canonical source</span>
                )}
              </td>
              <td>
                <StatePill value={item.physicalState} />
                <small>Physical intake authority</small>
              </td>
              <td>
                <StatePill value={item.verificationState} />
                <small>
                  {item.verificationState === "VERIFIED"
                    ? "Physical verification"
                    : "Physical verification required"}
                </small>
              </td>
              <td>
                <StatePill value={item.custodyState} />
                <small>Custody authority</small>
              </td>
              <td>
                {item.valuation ? (
                  <>
                    <strong>{formatMinor(item.valuation.minor, item.valuation.currency)}</strong>
                    <small>Staff authority</small>
                  </>
                ) : (
                  <>
                    <StatePill value="NOT_RECORDED" />
                    <small>Staff valuation</small>
                  </>
                )}
              </td>
              <td>
                {item.ownershipState === "ISSUED" ? (
                  <>
                    <strong>{item.ownership.issuedUnits} issued</strong>
                    <small>{item.ownership.ownerCount} positions</small>
                  </>
                ) : (
                  <>
                    <StatePill value={item.ownershipState} />
                    <small>Ownership authority</small>
                  </>
                )}
              </td>
              <td>
                <StatePill value={item.publicationState} />
                <small>
                  {item.attention.required
                    ? `${item.attention.reasons.length} exception${item.attention.reasons.length === 1 ? "" : "s"}`
                    : "Lifecycle status"}
                </small>
              </td>
              <td>
                <button
                  type="button"
                  className="catalogue-next-action"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen(item.id);
                  }}
                >
                  {item.nextAction.label} <small>{sentence(item.nextAction.actor)}</small>
                </button>
              </td>
              <td>
                <time dateTime={item.updatedAt}>{relativeDate(item.updatedAt)}</time>
              </td>
              <td>
                <button
                  type="button"
                  className="catalogue-more-actions"
                  aria-label={`Open actions for ${item.title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen(item.id);
                  }}
                >
                  <MoreVertical size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="admin-catalogue-mobile-list">
        {items.map((item) => (
          <article
            key={item.id}
            className="admin-catalogue-mobile-card"
            onClick={() => onPreview(item.id)}
          >
            <div className="catalogue-identity">
              <CollectibleThumbnail src={item.thumbnailUrl} />
              <div>
                <strong>{item.title}</strong>
                <small>
                  {item.identity.set ?? "Set unavailable"} ·{" "}
                  {item.identity.cardNumber ?? "Card unavailable"}
                </small>
              </div>
            </div>
            <div className="mobile-state-grid">
              <StatePill value={item.physicalState} />
              <StatePill value={item.verificationState} />
              <StatePill value={item.publicationState} />
            </div>
            <button
              type="button"
              className="admin-catalogue-open"
              onClick={(event) => {
                event.stopPropagation();
                onOpen(item.id);
              }}
            >
              {item.nextAction.label} <ArrowRight size={14} />
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

function Preview({
  item,
  onClose,
  onOpen,
  onOpenIntake,
  onOpenCollector,
}: {
  item: AdminCatalogueAsset;
  onClose: () => void;
  onOpen: (id: string) => void;
  onOpenIntake: (submissionId: string) => void;
  onOpenCollector: (collectorId: string) => void;
}) {
  return (
    <aside className="admin-catalogue-preview">
      <div className="admin-catalogue-preview__header">
        <span>Selected collectible</span>
        <button type="button" onClick={onClose} aria-label="Close preview">
          <X size={16} />
        </button>
      </div>
      <div className="admin-catalogue-preview__hero">
        <CollectibleThumbnail src={item.thumbnailUrl} />
        <div>
          <h3>{item.title}</h3>
          <p>
            {item.identity.year ?? "Year unavailable"}{" "}
            {item.identity.set ? `· ${item.identity.set}` : ""}
          </p>
          <p>
            {item.identity.grading
              ? `${item.identity.grading.company} ${item.identity.grading.grade}`
              : "Raw / ungraded"}
          </p>
          <strong className="catalogue-preview-id">Asset {shortId(item.publicId)}</strong>
          {item.workType !== "PRODUCTION" ? <em>{workTypeLabel(item.workType)}</em> : null}
        </div>
      </div>
      <PreviewSection title="Source & custody">
        <p>
          <b>Collector:</b> {item.provenance?.collector ?? "Canonical source unavailable"}
        </p>
        <p>
          <b>Source:</b>{" "}
          {item.lineage.submissionId
            ? `Submission #${shortId(item.lineage.submissionId)}`
            : "Canonical record"}
        </p>
        <p>
          <b>Physical:</b> {sentence(item.physicalState)}
        </p>
      </PreviewSection>
      <PreviewSection title="Lifecycle overview">
        <LifecycleRow icon={<Truck />} label="Physical" value={item.physicalState} />
        <LifecycleRow icon={<ShieldCheck />} label="Verification" value={item.verificationState} />
        <LifecycleRow icon={<LockKeyhole />} label="Custody" value={item.custodyState} />
        <LifecycleRow
          icon={<ClipboardCheck />}
          label="Valuation"
          value={
            item.valuation
              ? formatMinor(item.valuation.minor, item.valuation.currency)
              : "Not recorded"
          }
        />
        <LifecycleRow
          icon={<Box />}
          label="Ownership"
          value={
            item.ownership.issuedUnits ? `${item.ownership.issuedUnits} units` : item.ownershipState
          }
        />
        <LifecycleRow icon={<TrendingUp />} label="Market" value={item.publicationState} />
      </PreviewSection>
      <PreviewSection title="Canonical identity">
        <p>
          {item.identity.year ?? "Year unavailable"} · {item.identity.set ?? "Set unavailable"} ·{" "}
          {item.identity.cardNumber
            ? `Card ${item.identity.cardNumber}`
            : "Card number unavailable"}
        </p>
        <p>
          {item.identity.category} {item.identity.edition ? `· ${item.identity.edition}` : ""}
        </p>
      </PreviewSection>
      <PreviewSection title="Next action">
        <p>
          <b>{item.nextAction.label}</b>
        </p>
        <p>Next actor: {sentence(item.nextAction.actor)}</p>
      </PreviewSection>
      {item.attention.required ? (
        <PreviewSection title="Current blockers">
          <ul>
            {item.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </PreviewSection>
      ) : null}
      <PreviewSection title="Quick links">
        {item.lineage.submissionId ? (
          <button
            type="button"
            className="admin-catalogue-preview__link"
            onClick={() => onOpenIntake(item.lineage.submissionId!)}
          >
            Open Physical Intake <ArrowRight size={13} />
          </button>
        ) : null}
        {item.provenance ? (
          <button
            type="button"
            className="admin-catalogue-preview__link"
            onClick={() => onOpenCollector(item.provenance!.collectorId)}
          >
            Open collector <ArrowRight size={13} />
          </button>
        ) : null}
      </PreviewSection>
      <button
        type="button"
        className="admin-catalogue-preview__open"
        onClick={() => onOpen(item.id)}
      >
        Open authoritative detail <ArrowRight size={15} />
      </button>
    </aside>
  );
}
function PreviewEmpty() {
  return (
    <aside className="admin-catalogue-preview admin-catalogue-preview--empty">
      <div>
        <span className="preview-empty-mark">◌</span>
        <strong>Select a collectible</strong>
        <p>Preview canonical identity, lineage, custody, valuation, market and ownership state.</p>
      </div>
    </aside>
  );
}
function PreviewSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="admin-catalogue-preview__section">
      <h4>{title}</h4>
      {children}
    </section>
  );
}
function LifecycleRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="catalogue-lifecycle-row">
      <span>{icon}</span>
      <b>{label}</b>
      <StatePill value={value} />
    </div>
  );
}
function Metric({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone?: string;
  icon: ReactNode;
}) {
  return (
    <div className={`admin-catalogue-metric ${tone ? `is-${tone}` : ""}`}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <i aria-hidden="true">{icon}</i>
    </div>
  );
}
function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="admin-catalogue-select">
      <span className="sr-only">{label}</span>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{label}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {sentence(option)}
          </option>
        ))}
      </select>
      <ChevronDown size={14} aria-hidden="true" />
    </label>
  );
}

function FilterInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="admin-catalogue-filter-input">
      <span className="sr-only">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={label} />
    </label>
  );
}
function StatePill({ value }: { value: string }) {
  return (
    <span className={`catalogue-state catalogue-state--${value.toLowerCase()}`}>
      {sentence(value)}
    </span>
  );
}

function CollectibleThumbnail({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="catalogue-image-fallback">Preview unavailable</span>;
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}
function formatMinor(minor: string, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(
      Number(minor) / 100,
    );
  } catch {
    return `${minor} ${currency}`;
  }
}
function relativeDate(value: string) {
  const age = Date.now() - new Date(value).getTime();
  if (age < 86_400_000) return `${Math.max(1, Math.round(age / 3_600_000))}h ago`;
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
function shortId(value: string) {
  return value.replace(/^ast_/i, "").slice(-7).toUpperCase();
}
function workTypeLabel(value: AdminCatalogueAsset["workType"]) {
  if (value === "OWNER_DEMO") return "Demo";
  if (value === "CONTROLLED_QA") return "Controlled";
  if (value === "AUTOMATED_TEST") return "Test";
  return "Production";
}
function sentence(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function CatalogueState({
  title,
  detail,
  retry,
}: {
  title: string;
  detail: string;
  retry?: () => void;
}) {
  return (
    <section className="admin-catalogue-empty">
      <strong>{title}</strong>
      <p>{detail}</p>
      {retry ? (
        <button type="button" onClick={retry}>
          Retry
        </button>
      ) : null}
    </section>
  );
}

function CatalogueLoading() {
  return (
    <main className="admin-catalogue-page" aria-busy="true" aria-label="Loading collectibles">
      <div className="admin-catalogue-loading-heading" />
      <section className="admin-catalogue-summary">
        {Array.from({ length: 6 }, (_, index) => (
          <div className="admin-catalogue-skeleton" key={index} />
        ))}
      </section>
      <section className="admin-catalogue-loading-table">
        {Array.from({ length: 7 }, (_, index) => (
          <div className="admin-catalogue-skeleton" key={index} />
        ))}
      </section>
    </main>
  );
}
