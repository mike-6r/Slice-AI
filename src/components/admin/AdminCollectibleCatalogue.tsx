import { ArrowRight, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AdminCatalogueAsset, AdminCatalogueResponse } from "@/data/repositories";
import { useAppServices } from "@/providers/AppServicesProvider";
import { useQuery } from "@tanstack/react-query";
import "@/styles/admin-catalogue.css";

type Filters = {
  category: string;
  physicalState: string;
  verification: string;
  valuation: string;
  market: string;
  grading: string;
  collector: string;
  fixture: "NORMAL" | "TEST" | "ALL";
  sort: string;
};
const initialFilters: Filters = {
  category: "",
  physicalState: "",
  verification: "",
  valuation: "",
  market: "",
  grading: "",
  collector: "",
  fixture: "NORMAL",
  sort: "updated",
};

export function AdminCollectibleCatalogue({
  query,
  status,
  page,
  update,
  onOpen,
}: {
  query: string;
  status: string;
  page: number;
  update: (patch: Record<string, string | undefined>) => void;
  onOpen: (assetId: string) => void;
}) {
  const services = useAppServices();
  const [search, setSearch] = useState(query);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [previewId, setPreviewId] = useState<string | null>(null);
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
  if (catalogue.isLoading)
    return (
      <CatalogueState title="Loading Collectibles" detail="Reading canonical Asset records." />
    );
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
        setFilters((current) => ({ ...current, ...patch }));
        update({ page: "1" });
      }}
      update={update}
      onPreview={setPreviewId}
      onOpen={onOpen}
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
  onPreview,
  onOpen,
}: {
  data: AdminCatalogueResponse;
  search: string;
  status: string;
  filters: Filters;
  selected: AdminCatalogueAsset | null;
  setSearch: (value: string) => void;
  setFilters: (patch: Partial<Filters>) => void;
  update: (patch: Record<string, string | undefined>) => void;
  onPreview: (id: string | null) => void;
  onOpen: (id: string) => void;
}) {
  const activeFilterCount =
    Object.entries(filters).filter(([key, value]) => key !== "sort" && value).length +
    (status ? 1 : 0);
  const hasFilters = Boolean(search.trim()) || activeFilterCount > 0;
  const categories = useMemo(
    () => [...new Set(data.items.map((item) => item.identity.category))].sort(),
    [data.items],
  );
  const collectors = useMemo(
    () =>
      [
        ...new Set(
          data.items
            .map((item) => item.provenance?.collector)
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort(),
    [data.items],
  );
  return (
    <main className="admin-catalogue-page">
      <header className="admin-catalogue-header">
        <div>
          <p className="admin-catalogue-breadcrumb">
            Admin Console <span>›</span> Collectibles
          </p>
          <h2>Collectibles</h2>
          <p>Slice&apos;s authoritative catalogue of canonical collectible assets.</p>
        </div>
        <span className="admin-catalogue-authority">Canonical Asset authority</span>
      </header>
      <section className="admin-catalogue-summary" aria-label="Catalogue summary">
        <Metric label="Total collectibles" value={data.summary.total} />
        <Metric label="In custody" value={data.summary.inCustody} />
        <Metric
          label="Verification pending"
          value={data.summary.verificationPending}
          tone="amber"
        />
        <Metric label="Valuation pending" value={data.summary.valuationPending} tone="amber" />
        <Metric label="Market live" value={data.summary.marketLive} tone="green" />
        <Metric label="Exceptions" value={data.summary.exceptions} tone="red" />
      </section>
      <section className="admin-catalogue-workspace">
        <div className="admin-catalogue-main">
          <div className="admin-catalogue-toolbar">
            <label className="admin-catalogue-search">
              <Search aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search title, set, card number, cert, collector or ID"
                aria-label="Search collectibles"
              />
            </label>
            <FilterSelect
              label="Category"
              value={filters.category}
              onChange={(value) => setFilters({ category: value })}
              options={categories}
            />
            <FilterSelect
              label="Physical state"
              value={filters.physicalState}
              onChange={(value) => setFilters({ physicalState: value })}
              options={[
                "AWAITING_RECEIPT",
                "RECEIVED",
                "IN_VERIFICATION",
                "CUSTODY_READY",
                "EXCEPTION",
              ]}
            />
            <FilterSelect
              label="Verification"
              value={filters.verification}
              onChange={(value) => setFilters({ verification: value })}
              options={["PENDING", "VERIFIED"]}
            />
            <FilterSelect
              label="Valuation"
              value={filters.valuation}
              onChange={(value) => setFilters({ valuation: value })}
              options={["PENDING", "VALUED"]}
            />
            <FilterSelect
              label="Market"
              value={filters.market}
              onChange={(value) => setFilters({ market: value })}
              options={["NOT_PUBLISHED", "INITIAL_OFFERING", "LIVE", "PAUSED"]}
            />
            <FilterSelect
              label="Grading"
              value={filters.grading}
              onChange={(value) => setFilters({ grading: value })}
              options={["RAW", "GRADED"]}
            />
            <FilterSelect
              label="Collector / source"
              value={filters.collector}
              onChange={(value) => setFilters({ collector: value })}
              options={collectors}
            />
            <FilterSelect
              label="Status"
              value={status}
              onChange={(value) => update({ status: value || undefined, page: "1" })}
              options={["DRAFT", "IN_REVIEW", "VERIFIED", "PUBLISHED", "ARCHIVED"]}
            />
            <FilterSelect
              label="Sort"
              value={filters.sort}
              onChange={(value) => setFilters({ sort: value })}
              options={["updated", "newest", "title"]}
            />
            <label className="admin-catalogue-fixture">
              <input
                type="checkbox"
                checked={filters.fixture !== "NORMAL"}
                onChange={(event) =>
                  setFilters({ fixture: event.target.checked ? "ALL" : "NORMAL" })
                }
              />{" "}
              Include test/demo
            </label>
            {activeFilterCount ? (
              <button
                type="button"
                className="admin-catalogue-clear"
                onClick={() => {
                  setFilters(initialFilters);
                  update({ status: undefined, q: undefined, page: "1" });
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
            <span>
              {data.summary.ownerPositions
                ? `${data.summary.ownerPositions} active owner positions`
                : "Ownership issuance is separate"}
            </span>
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
                  : "Accepted and verified intake records will appear here once the canonical asset record is created."}
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
          <Preview item={selected} onClose={() => onPreview(null)} onOpen={onOpen} />
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
            <th>Grade / cert</th>
            <th>Physical state</th>
            <th>Verification</th>
            <th>Valuation</th>
            <th>Market</th>
            <th>Ownership</th>
            <th>Updated</th>
            <th>Action</th>
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
                  {item.thumbnailUrl ? (
                    <img src={item.thumbnailUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="catalogue-image-fallback">—</span>
                  )}
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
                      {item.publicId} {item.testFixture ? <em>TEST/DEMO</em> : null}
                    </small>
                  </div>
                </div>
              </td>
              <td>
                {item.identity.grading ? (
                  <>
                    <strong>
                      {item.identity.grading.company} {item.identity.grading.grade}
                    </strong>
                    <small>{item.identity.grading.label}</small>
                  </>
                ) : (
                  <span>Ungraded</span>
                )}
              </td>
              <td>
                <StatePill value={item.custodyState} />
              </td>
              <td>
                <StatePill value={item.verificationState} />
              </td>
              <td>
                {item.valuation ? (
                  <>
                    <strong>{formatMinor(item.valuation.minor, item.valuation.currency)}</strong>
                    <small>Staff authority</small>
                  </>
                ) : (
                  <span>Not started</span>
                )}
              </td>
              <td>
                <StatePill
                  value={item.marketLifecycle?.admin.publicState ?? item.publicationState}
                />
              </td>
              <td>
                {item.ownership.issuedUnits ? (
                  <>
                    <strong>{item.ownership.issuedUnits} issued</strong>
                    <small>{item.ownership.ownerCount} positions</small>
                  </>
                ) : (
                  <span>Not issued</span>
                )}
              </td>
              <td>
                <time dateTime={item.updatedAt}>{relativeDate(item.updatedAt)}</time>
              </td>
              <td>
                <button
                  type="button"
                  className="admin-catalogue-open"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen(item.id);
                  }}
                >
                  Open <ArrowRight size={14} aria-hidden="true" />
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
              {item.thumbnailUrl ? (
                <img src={item.thumbnailUrl} alt="" />
              ) : (
                <span className="catalogue-image-fallback">—</span>
              )}
              <div>
                <strong>{item.title}</strong>
                <small>
                  {item.identity.set ?? "Set unavailable"} ·{" "}
                  {item.identity.cardNumber ?? "Card unavailable"}
                </small>
              </div>
            </div>
            <div className="mobile-state-grid">
              <StatePill value={item.custodyState} />
              <StatePill value={item.verificationState} />
              <StatePill value={item.marketLifecycle?.admin.publicState ?? item.publicationState} />
            </div>
            <button
              type="button"
              className="admin-catalogue-open"
              onClick={(event) => {
                event.stopPropagation();
                onOpen(item.id);
              }}
            >
              Open collectible <ArrowRight size={14} />
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
}: {
  item: AdminCatalogueAsset;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <aside className="admin-catalogue-preview">
      <div className="admin-catalogue-preview__header">
        <span>Collectible preview</span>
        <button type="button" onClick={onClose} aria-label="Close preview">
          <X size={16} />
        </button>
      </div>
      <div className="admin-catalogue-preview__hero">
        {item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt="" />
        ) : (
          <span className="catalogue-image-fallback">—</span>
        )}
        <div>
          <h3>{item.title}</h3>
          <p>{item.publicId}</p>
          {item.testFixture ? <em>TEST / DEMO FIXTURE</em> : null}
        </div>
      </div>
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
      <PreviewSection title="Source lineage">
        <p>Submission: {item.lineage.submissionId ?? "Not linked"}</p>
        <p>Intake: {item.lineage.intakeId ?? "Not created"}</p>
        <p>Collector: {item.provenance?.collector ?? "Unavailable"}</p>
      </PreviewSection>
      <PreviewSection title="Lifecycle">
        <p>
          <b>Physical:</b> {sentence(item.custodyState)}
        </p>
        <p>
          <b>Verification:</b> {sentence(item.verificationState)}
        </p>
        <p>
          <b>Valuation:</b>{" "}
          {item.valuation
            ? formatMinor(item.valuation.minor, item.valuation.currency)
            : "Not started"}
        </p>
        <p>
          <b>Market:</b>{" "}
          {sentence(item.marketLifecycle?.admin.publicState ?? item.publicationState)}
        </p>
        <p>
          <b>Ownership:</b>{" "}
          {item.ownership.issuedUnits ? `${item.ownership.issuedUnits} units issued` : "Not issued"}
        </p>
      </PreviewSection>
      {item.blockers.length ? (
        <PreviewSection title="Current blockers">
          <ul>
            {item.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </PreviewSection>
      ) : null}
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
function Metric({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className={`admin-catalogue-metric ${tone ? `is-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
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
function StatePill({ value }: { value: string }) {
  return (
    <span className={`catalogue-state catalogue-state--${value.toLowerCase()}`}>
      {sentence(value)}
    </span>
  );
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
