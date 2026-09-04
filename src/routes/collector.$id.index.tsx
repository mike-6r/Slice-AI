import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Archive, ArrowLeft, ArrowRight, ChevronDown, List, Search, Star } from "lucide-react";
import {
  CollectorAvatar,
  PublicCollectorAssetCard,
} from "@/components/collectors/public-collector-ui";
import {
  collectorCategoryLabel,
  collectorSpecialties,
} from "@/components/collectors/collector-specialties";
import { useAppServices } from "@/providers/AppServicesProvider";

type ProfileTab = "catalogue" | "about" | "activity";
type AssetStatusFilter = "all" | "pre-sale" | "market-live";
type AssetSort = "recent" | "name" | "price";

export const Route = createFileRoute("/collector/$id/")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab === "about" || search.tab === "activity"
      ? search.tab
      : "catalogue") as ProfileTab,
    status: (search.status === "pre-sale" || search.status === "market-live"
      ? search.status
      : "all") as AssetStatusFilter,
    q: typeof search.q === "string" ? search.q : "",
    category: typeof search.category === "string" ? search.category : "all",
    sort: (search.sort === "name" || search.sort === "price" ? search.sort : "recent") as AssetSort,
    page: Math.max(1, Math.min(10_000, Number(search.page) || 1)),
  }),
  head: () => ({ meta: [{ title: "Collector profile | Slice" }] }),
  component: CollectorPage,
});

function CollectorPage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/collector/$id/" });
  const services = useAppServices();
  const [draftQuery, setDraftQuery] = useState(search.q);
  const result = useQuery({
    queryKey: ["collector", id, search],
    queryFn: () =>
      services.collectors.get(id as never, {
        page: search.page,
        pageSize: 12,
        q: search.q || undefined,
        status: search.status === "all" ? undefined : search.status,
        category: search.category === "all" ? undefined : search.category,
        sort: search.sort,
      }),
  });
  const updateSearch = (updates: Partial<typeof search>) =>
    void navigate({
      search: (previous) => ({ ...previous, ...updates, page: updates.page ?? 1 }),
      replace: true,
    });
  if (result.isLoading)
    return (
      <PageState title="Loading public profile" description="Fetching the public catalogue." />
    );
  if (result.isError)
    return (
      <PageState
        title="Profile unavailable"
        description="We could not load this public profile."
        retry={() => void result.refetch()}
      />
    );
  if (!result.data)
    return (
      <PageState
        title="Profile not found"
        description="This Collector is private or unavailable."
      />
    );

  const collector = result.data;
  const listings = collector.publishedListings ?? [];
  const specialties = collectorSpecialties(collector);
  const categories = collector.categories?.length
    ? collector.categories
    : [...new Set(listings.map((listing) => listing.category))];
  const featured = collector.featuredPreviewAssets?.[0] ?? listings[0];
  const pagination = collector.assetPagination;
  const displayStart = pagination?.total ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const displayEnd = pagination?.total
    ? Math.min(pagination.page * pagination.pageSize, pagination.total)
    : 0;

  return (
    <div className="collector-profile-page">
      <main className="collector-profile-shell">
        <Link to="/collectors" className="collector-profile-back">
          <ArrowLeft aria-hidden="true" /> Browse collectors
        </Link>
        <section className="collector-profile-hero">
          <div className="collector-profile-identity-block">
            <div className="collector-profile-identity">
              <CollectorAvatar collector={collector} featured />
              <div>
                <span className="collector-profile-active">Active Collector</span>
                <h1>{collector.displayName}</h1>
                <p>@{collector.handle}</p>
              </div>
            </div>
            <p className="collector-profile-bio">
              {collector.focus ||
                collector.featuredCaption ||
                "A public catalogue of authenticated collectibles."}
            </p>
            {specialties.length ? (
              <div className="collector-profile-specialties">
                {specialties.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            ) : null}
          </div>
          {featured ? <FeaturedAsset listing={featured} /> : <EmptyFeatured />}
        </section>
        <dl className="collector-profile-stats">
          <Stat
            value={collector.publishedListingCount ?? listings.length}
            label="Published assets"
          />
          <Stat
            value={
              collector.preSaleListingCount ??
              listings.filter((listing) => Boolean(listing.preSale)).length
            }
            label="Pre-Sale"
          />
          <Stat
            value={
              collector.liveListingCount ?? listings.filter((listing) => !listing.preSale).length
            }
            label="Market Live"
          />
          <Stat value={categories.length} label="Categories" />
          <Stat
            value={collector.publicSince ? new Date(collector.publicSince).getFullYear() : "—"}
            label="Collector since"
          />
        </dl>
        <nav className="collector-profile-tabs" aria-label="Collector profile sections">
          {(["catalogue", "about", "activity"] as ProfileTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              className={search.tab === tab ? "is-active" : ""}
              onClick={() => updateSearch({ tab, page: 1 })}
            >
              {tab[0].toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
        {search.tab === "catalogue" ? (
          <Catalogue
            collector={collector}
            listings={listings}
            categories={categories}
            search={search}
            draftQuery={draftQuery}
            setDraftQuery={setDraftQuery}
            updateSearch={updateSearch}
            pagination={pagination}
            displayStart={displayStart}
            displayEnd={displayEnd}
          />
        ) : search.tab === "about" ? (
          <About collector={collector} categories={categories} />
        ) : (
          <Activity activity={collector.activity ?? []} />
        )}
      </main>
    </div>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <dd>{value}</dd>
      <dt>{label}</dt>
    </div>
  );
}

function FeaturedAsset({ listing }: { listing: any }) {
  return (
    <article className="collector-profile-featured-asset">
      <div className="collector-profile-featured-heading">
        <span>
          <Star aria-hidden="true" /> Featured asset
        </span>
      </div>
      <div className="collector-profile-featured-body">
        <div className="collector-profile-featured-media">
          <AssetImage listing={listing} />
        </div>
        <div className="collector-profile-featured-copy">
          <span className={`collector-profile-state ${listing.preSale ? "is-presale" : "is-live"}`}>
            {listing.preSale ? "PRE-SALE" : "LIVE"}
          </span>
          <h2>{listing.title}</h2>
          <p>
            {[listing.year, listing.variant, listing.cardNumber ? `#${listing.cardNumber}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <strong>
            {listing.preSale
              ? money(listing.preSale.pricePerUnitMinor, listing.preSale.currency)
              : listing.estimatedMarketValue
                ? money(
                    String(listing.estimatedMarketValue.amount),
                    listing.estimatedMarketValue.currency,
                  )
                : "Market data unavailable"}{" "}
            {listing.preSale ? "/ Slice" : ""}
          </strong>
          {listing.preSale?.sliceOwnershipPercentageBps !== undefined ? (
            <small>
              {(listing.preSale.sliceOwnershipPercentageBps / 100).toFixed(2)}% ownership per Slice
            </small>
          ) : null}
          {listing.preSale ? (
            <>
              <div className="collector-profile-featured-progress">
                <span style={{ width: `${reservationPercent(listing)}%` }} />
              </div>
              <small>
                {listing.preSale.reservedUnits} / {listing.preSale.offeredUnits} reserved
              </small>
            </>
          ) : null}
        </div>
      </div>
      <Link
        to="/asset/$id"
        params={{ id: listing.slug }}
        className="collector-profile-featured-cta"
      >
        View asset <ArrowRight aria-hidden="true" />
      </Link>
    </article>
  );
}
function EmptyFeatured() {
  return (
    <aside className="collector-profile-featured-asset is-empty">
      <Star aria-hidden="true" />
      <strong>No featured asset yet</strong>
      <span>Published collectibles will appear here.</span>
    </aside>
  );
}

function Catalogue({
  collector,
  listings,
  categories,
  search,
  draftQuery,
  setDraftQuery,
  updateSearch,
  pagination,
  displayStart,
  displayEnd,
}: any) {
  return (
    <section className="collector-profile-catalogue">
      <div className="collector-profile-section-heading">
        <div>
          <p className="collector-profile-eyebrow">Collector&apos;s assets</p>
          <h2>{collector.displayName}&apos;s assets</h2>
          <span>Explore the collectibles published by {collector.displayName}.</span>
        </div>
        <span className="collector-profile-view-list">
          <List aria-hidden="true" /> View as list
        </span>
      </div>
      <div className="collector-profile-filters">
        <div className="collector-profile-filter-tabs">
          {(["all", "pre-sale", "market-live"] as AssetStatusFilter[]).map((status) => (
            <button
              type="button"
              key={status}
              className={search.status === status ? "is-active" : ""}
              onClick={() => updateSearch({ status, page: 1 })}
            >
              {status === "all" ? "All assets" : status === "pre-sale" ? "Pre-Sale" : "Market Live"}
              <b>
                {status === "all"
                  ? (collector.publishedListingCount ?? listings.length)
                  : status === "pre-sale"
                    ? (collector.preSaleListingCount ?? 0)
                    : (collector.liveListingCount ?? 0)}
              </b>
            </button>
          ))}
        </div>
        <form
          className="collector-profile-search"
          onSubmit={(event) => {
            event.preventDefault();
            updateSearch({ q: draftQuery.trim(), page: 1 });
          }}
        >
          <Search aria-hidden="true" />
          <input
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder="Search this collector's assets..."
          />
          <button type="submit">Search</button>
        </form>
        <Select
          value={search.category}
          label="All categories"
          options={categories}
          onChange={(category) => updateSearch({ category, page: 1 })}
        />
        <Select
          value={search.sort}
          label="Sort: Newest first"
          options={["recent", "name", "price"]}
          labels={{ recent: "Newest first", name: "Name", price: "Price" }}
          onChange={(sort) => updateSearch({ sort: sort as AssetSort, page: 1 })}
        />
      </div>
      <div className="collector-profile-results-line">
        <strong>{pagination?.total ?? listings.length} assets</strong>
        <span>
          {pagination?.total ? `Showing ${displayStart}–${displayEnd}` : "Public catalogue"}
        </span>
      </div>
      {listings.length ? (
        <div className="collector-profile-assets-grid">
          {listings.map((listing: any) => (
            <PublicCollectorAssetCard key={listing.assetId} listing={listing} />
          ))}
        </div>
      ) : (
        <EmptyCatalogue />
      )}
      {pagination?.totalPages > 1 ? (
        <nav className="collector-profile-pagination">
          <button
            type="button"
            disabled={!pagination.hasPreviousPage}
            onClick={() => updateSearch({ page: pagination.page - 1 })}
          >
            <ArrowLeft aria-hidden="true" /> Previous
          </button>
          <span>
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <button
            type="button"
            disabled={!pagination.hasNextPage}
            onClick={() => updateSearch({ page: pagination.page + 1 })}
          >
            Next <ArrowRight aria-hidden="true" />
          </button>
        </nav>
      ) : null}
    </section>
  );
}

function Select({
  value,
  label,
  options,
  labels,
  onChange,
}: {
  value: string;
  label: string;
  options: string[];
  labels?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="collector-profile-select">
      <span>{labels?.[value] ?? (value === "all" ? label : collectorCategoryLabel(value))}</span>
      <ChevronDown aria-hidden="true" />
      <select value={value} aria-label={label} onChange={(event) => onChange(event.target.value)}>
        <option value="all">{label}</option>
        {options
          .filter((option) => option !== "all")
          .map((option) => (
            <option key={option} value={option}>
              {labels?.[option] ?? collectorCategoryLabel(option)}
            </option>
          ))}
      </select>
    </label>
  );
}
function About({ collector, categories }: { collector: any; categories: string[] }) {
  return (
    <section className="collector-profile-lower-grid">
      <article className="collector-profile-info-card">
        <p className="collector-profile-eyebrow">About {collector.displayName}</p>
        <h2>A public catalogue built for inspection.</h2>
        <p>
          {collector.focus ||
            collector.featuredCaption ||
            "This Collector shares authenticated collectibles with the Slice community."}
        </p>
        <dl>
          <div>
            <dt>Specialties</dt>
            <dd>{collectorSpecialties(collector).join(", ") || "—"}</dd>
          </div>
          <div>
            <dt>Collector since</dt>
            <dd>{collector.publicSince ? new Date(collector.publicSince).getFullYear() : "—"}</dd>
          </div>
          <div>
            <dt>Public catalogue</dt>
            <dd>{collector.publishedListingCount ?? 0} collectibles</dd>
          </div>
          <div>
            <dt>Categories</dt>
            <dd>{categories.map(collectorCategoryLabel).join(", ") || "—"}</dd>
          </div>
          <div>
            <dt>Profile status</dt>
            <dd className="is-positive">Active</dd>
          </div>
        </dl>
      </article>
    </section>
  );
}
function Activity({
  activity,
}: {
  activity: Array<{
    id: string;
    type: string;
    title: string;
    detail: string;
    occurredAt: string;
    assetSlug: string;
  }>;
}) {
  return (
    <section className="collector-profile-activity-panel">
      <div>
        <p className="collector-profile-eyebrow">Public activity</p>
        <h2>Recent public activity</h2>
      </div>
      {activity.length ? (
        <div className="collector-profile-activity-list">
          {activity.map((event) => (
            <Link key={event.id} to="/asset/$id" params={{ id: event.assetSlug }}>
              <span className={event.type === "PRE_SALE" ? "is-presale" : "is-live"}>
                {event.type === "PRE_SALE" ? "▣" : "▤"}
              </span>
              <div>
                <strong>{event.title}</strong>
                <small>{event.detail}</small>
              </div>
              <time>{new Date(event.occurredAt).toLocaleDateString()}</time>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyActivity />
      )}
    </section>
  );
}
function EmptyCatalogue() {
  return (
    <div className="collector-profile-empty">
      <Archive aria-hidden="true" />
      <strong>No public assets found</strong>
      <span>Try a different filter or search term.</span>
    </div>
  );
}
function EmptyActivity() {
  return (
    <div className="collector-profile-empty">
      <Archive aria-hidden="true" />
      <strong>No public activity yet.</strong>
      <span>New catalogue publications will appear here when shared publicly.</span>
    </div>
  );
}
function PageState({
  title,
  description,
  retry,
}: {
  title: string;
  description: string;
  retry?: () => void;
}) {
  return (
    <section className="page-shell py-12">
      <h1 className="page-title">{title}</h1>
      <p className="mt-3 text-subtle">{description}</p>
      {retry ? (
        <button type="button" className="mt-4" onClick={retry}>
          Retry
        </button>
      ) : null}
    </section>
  );
}
function AssetImage({ listing }: { listing: any }) {
  const media =
    listing.media?.find((item: any) => item.slot.toLowerCase() === "front") ?? listing.media?.[0];
  return media ? <img src={media.url} alt={media.alt} /> : <Archive aria-hidden="true" />;
}
function money(minor: string, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(
    Number(minor) / 100,
  );
}
function reservationPercent(listing: any) {
  const offered = Number(listing.preSale?.offeredUnits ?? 0);
  return offered ? Math.min(100, (Number(listing.preSale?.reservedUnits ?? 0) / offered) * 100) : 0;
}
