import { ArrowRight, Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { AdminCatalogueAsset, AdminCatalogueResponse } from "@/data/repositories";
import { useAppServices } from "@/providers/AppServicesProvider";
import { useQuery } from "@tanstack/react-query";
import "@/styles/admin-catalogue.css";

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
  const catalogue = useQuery({
    queryKey: ["admin", "catalogue", query, status, page],
    queryFn: () =>
      services.repositories.admin.listCatalogueAssets({
        q: query || undefined,
        status: status || undefined,
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
        detail="The canonical catalogue could not be loaded safely."
        retry={() => void catalogue.refetch()}
      />
    );
  return (
    <CatalogueContent
      data={catalogue.data}
      search={search}
      status={status}
      setSearch={setSearch}
      update={update}
      onOpen={onOpen}
    />
  );
}

function CatalogueContent({
  data,
  search,
  status,
  setSearch,
  update,
  onOpen,
}: {
  data: AdminCatalogueResponse;
  search: string;
  status: string;
  setSearch: (value: string) => void;
  update: (patch: Record<string, string | undefined>) => void;
  onOpen: (assetId: string) => void;
}) {
  const [category, setCategory] = useState("");
  const [physical, setPhysical] = useState("");
  const [market, setMarket] = useState("");
  const [sort, setSort] = useState("updated");
  const visibleItems = data.items
    .filter((item) => !category || item.identity.category === category)
    .filter((item) => !physical || physicalState(item) === physical)
    .filter((item) => !market || marketState(item) === market)
    .sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "owners") return b.ownership.ownerCount - a.ownership.ownerCount;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  const categories = [...new Set(data.items.map((item) => item.identity.category))].sort();
  return (
    <main className="admin-catalogue-page">
      <header className="admin-catalogue-header">
        <div>
          <p className="admin-catalogue-breadcrumb">
            Admin Console <span>›</span> Collectible Catalogue
          </p>
          <h2>Collectibles</h2>
          <p>Manage Slice&apos;s verified collectible catalogue, custody and market lifecycle.</p>
        </div>
      </header>
      <div className="admin-catalogue-toolbar">
        <label className="admin-catalogue-search">
          <Search aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title, set, card number, cert or collector"
            aria-label="Search collectibles"
          />
        </label>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          aria-label="Category"
        >
          <option value="">Category</option>
          {categories.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          value={physical}
          onChange={(event) => setPhysical(event.target.value)}
          aria-label="Physical state"
        >
          <option value="">Physical state</option>
          <option value="Secured">Secured</option>
          <option value="In intake">In intake</option>
          <option value="Not recorded">Not recorded</option>
        </select>
        <select
          value={market}
          onChange={(event) => setMarket(event.target.value)}
          aria-label="Market state"
        >
          <option value="">Market state</option>
          <option value="Published">Published</option>
          <option value="Ready">Ready</option>
          <option value="Not ready">Not ready</option>
        </select>
        <select
          value={status}
          onChange={(event) => update({ status: event.target.value || undefined, page: "1" })}
          aria-label="Catalogue status"
        >
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="IN_REVIEW">In review</option>
          <option value="VERIFIED">Verified</option>
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          aria-label="Sort collectibles"
        >
          <option value="updated">Recently updated</option>
          <option value="title">Title A–Z</option>
          <option value="owners">Most owners</option>
        </select>
      </div>
      <div className="admin-catalogue-summary" aria-live="polite">
        <strong>{data.pagination.total}</strong> collectible records
        <span>·</span>
        <strong>
          {data.items.filter((item) => item.marketReadiness === "PUBLISHED").length}
        </strong>{" "}
        market published
        <span>·</span>
        <strong>{data.items.reduce((sum, item) => sum + item.ownership.ownerCount, 0)}</strong>{" "}
        owner positions
      </div>
      {visibleItems.length ? (
        <section className="admin-catalogue-grid" aria-label="Collectibles">
          {visibleItems.map((item) => (
            <CatalogueCard key={item.id} item={item} onOpen={onOpen} />
          ))}
        </section>
      ) : (
        <section className="admin-catalogue-empty">
          <strong>No collectibles match these filters.</strong>
          <p>
            Try clearing a filter or searching by a shorter title, set, card number, or collector.
          </p>
        </section>
      )}
      <footer className="admin-catalogue-pagination">
        <span>
          {data.pagination.total
            ? `Showing ${(data.pagination.page - 1) * data.pagination.pageSize + 1}–${Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.total)} of ${data.pagination.total}`
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
    </main>
  );
}

function CatalogueCard({
  item,
  onOpen,
}: {
  item: AdminCatalogueAsset;
  onOpen: (id: string) => void;
}) {
  return (
    <article className="admin-catalogue-card">
      <div className="admin-catalogue-card__media">
        {item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt="" loading="lazy" />
        ) : (
          <ImageFallback />
        )}
        {needsAttention(item) ? (
          <span className="admin-catalogue-card__attention">Needs attention</span>
        ) : null}
      </div>
      <div className="admin-catalogue-card__heading">
        <div>
          <small>{item.identity.category}</small>
          <h3>{item.title}</h3>
          <p>
            {item.identity.year ?? "Year unavailable"} · {item.identity.set ?? "Set unavailable"} ·{" "}
            {item.identity.cardNumber ? `#${item.identity.cardNumber}` : "Card number unavailable"}
          </p>
          {item.status === "ARCHIVED" ? (
            <small className="admin-catalogue-card__legacy">
              Legacy / archived record retained for audit
            </small>
          ) : null}
        </div>
        <div className="admin-catalogue-card__badges">
          <span className="admin-catalogue-status">{sentence(item.status)}</span>
          {item.marketLifecycle ? (
            <span className="admin-catalogue-status admin-catalogue-status--market">
              {item.marketLifecycle.admin.publicState}
            </span>
          ) : null}
        </div>
      </div>
      <dl className="admin-catalogue-fields">
        <Field
          label="Grading"
          value={
            item.identity.grading
              ? `${item.identity.grading.company} ${item.identity.grading.grade}`
              : "Raw / ungraded"
          }
        />
        <Field
          label="Owners"
          value={`${item.ownership.ownerCount} ${item.ownership.ownerCount === 1 ? "owner" : "owners"}`}
        />
        <Field label="Physical" value={physicalState(item)} />
        <Field label="Market" value={marketState(item)} />
        <Field label="Submitted by" value={item.provenance?.collector ?? "No linked submission"} />
      </dl>
      <button
        type="button"
        className="admin-catalogue-card__action"
        onClick={() => onOpen(item.id)}
      >
        Open collectible <ArrowRight aria-hidden="true" />
      </button>
    </article>
  );
}

function ImageFallback() {
  return (
    <div className="admin-catalogue-card__image-fallback" aria-label="No approved image">
      No approved image
    </div>
  );
}

function physicalState(item: AdminCatalogueAsset) {
  if (item.custodyState === "SECURED" || item.custodyState === "VAULT_READY") return "Secured";
  if (item.provenance) return "In intake";
  return "Not recorded";
}

function marketState(item: AdminCatalogueAsset) {
  if (item.marketLifecycle) return item.marketLifecycle.admin.internalState;
  if (item.publicationState === "PUBLISHED" || item.marketReadiness === "PUBLISHED")
    return "Published";
  if (item.marketReadiness === "READY") return "Ready";
  return "Not ready";
}

function needsAttention(item: AdminCatalogueAsset) {
  return item.verificationState !== "COMPLETED" && item.verificationState !== "VERIFIED";
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
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

function sentence(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
