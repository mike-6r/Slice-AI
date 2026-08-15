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
  return (
    <main className="admin-catalogue-page">
      <header className="admin-catalogue-header">
        <div>
          <p className="admin-catalogue-breadcrumb">
            Admin Console <span>›</span> Canonical Catalogue
          </p>
          <h2>Collectibles</h2>
          <p>
            Canonical collectible records that have been explicitly created by the authorised
            catalogue workflow.
          </p>
        </div>
      </header>
      <div className="admin-catalogue-toolbar">
        <label className="admin-catalogue-search">
          <Search aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search canonical collectibles"
            aria-label="Search canonical collectibles"
          />
        </label>
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
      </div>
      {data.items.length ? (
        <section className="admin-catalogue-grid" aria-label="Canonical collectibles">
          {data.items.map((item) => (
            <CatalogueCard key={item.id} item={item} onOpen={onOpen} />
          ))}
        </section>
      ) : (
        <section className="admin-catalogue-empty">
          <strong>No canonical collectibles yet.</strong>
          <p>
            Approved submissions do not appear here until an authorised canonical Asset has been
            created.
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
      <div className="admin-catalogue-card__heading">
        <div>
          <small>{item.identity.category}</small>
          <h3>{item.title}</h3>
          <p>
            {item.identity.year ?? "Year unavailable"} · {item.identity.set ?? "Set unavailable"} ·{" "}
            {item.identity.cardNumber ? `#${item.identity.cardNumber}` : "Card number unavailable"}
          </p>
        </div>
        <span className="admin-catalogue-status">{sentence(item.status)}</span>
      </div>
      <dl className="admin-catalogue-fields">
        <Field
          label="Submission provenance"
          value={
            item.provenance
              ? `${item.provenance.submissionStatus} · ${item.provenance.collector}`
              : "No linked submission"
          }
        />
        <Field label="Media" value={sentence(item.mediaState)} />
        <Field label="Verification" value={sentence(item.verificationState)} />
        <Field label="Valuation" value={sentence(item.valuationState)} />
        <Field label="Custody" value={sentence(item.custodyState)} />
        <Field label="Market readiness" value={sentence(item.marketReadiness)} />
        <Field label="Publication" value={sentence(item.publicationState)} />
      </dl>
      <button
        type="button"
        className="admin-catalogue-card__action"
        onClick={() => onOpen(item.id)}
      >
        Open canonical detail <ArrowRight aria-hidden="true" />
      </button>
    </article>
  );
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
