import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, ArrowLeft, Building2, CheckCircle2, ChevronRight, CircleAlert, Clock3, Info, Link2, MapPin, PackageCheck, Plus, RotateCcw, Settings2, Truck, UsersRound } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import type {
  AdminIntakeLocation,
  AdminIntakeLocationDetail,
  AdminIntakeLocationsResponse,
  IntakeLocationInput,
  IntakeLocationStatus,
  IntakeLocationType,
} from "@/data/repositories";
import { useAppServices } from "@/providers/AppServicesProvider";

type Props = {
  locationId?: string;
  tab?: string;
  onBack: () => void;
  onOpen: (id: string, tab?: string) => void;
};

const locationTypes: Array<{ value: IntakeLocationType; label: string }> = [
  { value: "SLICE_VAULT", label: "Slice Vault" },
  { value: "SLICE_INTAKE", label: "Slice Intake Facility" },
  { value: "PARTNER_STORE", label: "Partner Store" },
  { value: "PARTNER_INTAKE", label: "Partner Intake" },
  { value: "DEMO_TEST", label: "Test / Demo Facility" },
];
type LocationCommandName = "PAUSE_NEW_INTAKES" | "RESUME_NEW_INTAKES" | "DEACTIVATE" | "REACTIVATE" | "ENABLE_SHIPPING" | "DISABLE_SHIPPING" | "ENABLE_IN_PERSON" | "DISABLE_IN_PERSON" | "REPAIR_AVAILABILITY" | "REPAIR_CAPACITY_PROJECTION";
const blankForm = (): IntakeLocationInput => ({
  displayName: "",
  locationType: "DEMO_TEST",
  environment: "beta",
  status: "ACTIVE",
  acceptingNewIntakes: false,
  operationallyApproved: false,
  acceptingShipments: true,
  acceptingInPerson: false,
  receiverName: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  region: "",
  postalCode: null,
  countryCode: "GB",
  acceptedCategoryIds: [],
  shippingInstructions: "",
  inPersonInstructions: null,
  internalName: "",
  operationalNotes: null,
  internalContact: null,
  openingHours: null,
  appointmentRequired: false,
  walkInsAllowed: false,
  publicContactInstructions: null,
  packageLabelInstructions: null,
  specialHandlingInstructions: null,
  maximumActiveIntakes: null,
  warningThreshold: null,
  pauseReason: null,
  pauseEffectiveAt: null,
  expectedResumeAt: null,
  reason: "",
});

export function AdminIntakeLocations({ locationId, tab, onBack, onOpen }: Props) {
  const { repositories } = useAppServices();
  const client = useQueryClient();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | IntakeLocationStatus>("");
  const [delivery, setDelivery] = useState<"" | "SHIPPING" | "IN_PERSON" | "BOTH">("");
  const [availability, setAvailability] = useState<"" | AdminIntakeLocation["availability"]>("");
  const [type, setType] = useState<"" | IntakeLocationType>("");
  const [environment, setEnvironment] = useState<"" | "beta" | "production">("");
  const [accepting, setAccepting] = useState<"" | "true" | "false">("");
  const [sort, setSort] = useState<"NAME" | "ACTIVE_INTAKES" | "RECENT_ACTIVITY">("NAME");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<IntakeLocationInput | null>(null);
  const [command, setCommand] = useState<{
    command: "PAUSE_NEW_INTAKES" | "RESUME_NEW_INTAKES" | "DEACTIVATE" | "REACTIVATE" | "ENABLE_SHIPPING" | "DISABLE_SHIPPING" | "ENABLE_IN_PERSON" | "DISABLE_IN_PERSON" | "REPAIR_AVAILABILITY" | "REPAIR_CAPACITY_PROJECTION";
    label: string;
  } | null>(null);
  const [commandReason, setCommandReason] = useState("");
  const locations = useQuery({
    queryKey: [
      "admin",
      "intake-locations",
      query,
      status,
      delivery,
      type,
      environment,
      accepting,
      sort,
      sortDirection,
      availability,
      page,
    ],
    queryFn: () =>
      repositories.admin.listIntakeLocations({
        q: query.trim() || undefined,
        status: status || undefined,
        deliveryMethod: delivery || undefined,
        availability: availability || undefined,
        type: type || undefined,
        environment: environment || undefined,
        acceptingNewIntakes: accepting === "" ? undefined : accepting === "true",
        sort,
        sortDirection,
        page,
        pageSize: 20,
      }),
    staleTime: 15_000,
  });
  const detail = useQuery({
    queryKey: ["admin", "intake-location", locationId],
    queryFn: () => repositories.admin.getIntakeLocation(locationId!),
    enabled: Boolean(locationId),
  });
  const save = useMutation({
    mutationFn: (input: { id?: string; values: IntakeLocationInput }) =>
      input.id
        ? repositories.admin.updateIntakeLocation(input.id, input.values)
        : repositories.admin.createIntakeLocation(input.values),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: ["admin", "intake-locations"] });
      void client.invalidateQueries({ queryKey: ["admin", "intake-location"] });
      setForm(null);
      onOpen(result.id, "overview");
    },
  });
  const executeCommand = useMutation({
    mutationFn: (input: { id: string; command: NonNullable<typeof command>["command"]; reason: string }) =>
      repositories.admin.commandIntakeLocation(input.id, { command: input.command, reason: input.reason }),
    onSuccess: (_result, input) => {
      void client.invalidateQueries({ queryKey: ["admin", "intake-locations"] });
      void client.invalidateQueries({ queryKey: ["admin", "intake-location", input.id] });
      setCommand(null);
      setCommandReason("");
    },
  });

  const metrics = locations.data?.summary;
  const current = detail.data?.location;
  const formValues = form ?? (current ? formFromLocation(current) : null);
  const detailTab = ["overview", "configuration", "intakes", "staff", "history"].includes(tab ?? "") ? tab! : "overview";

  if (locationId) {
    if (detail.isLoading)
      return (
        <section className="admin-panel intake-location-state">
          <p>Loading authoritative intake location…</p>
        </section>
      );
    if (detail.isError || !detail.data)
      return (
        <section className="admin-panel intake-location-state">
          <h2>Intake location unavailable</h2>
          <p>The location could not be loaded from the authorized service.</p>
          <button className="admin-secondary-button" type="button" onClick={onBack}>
            Back to intake locations
          </button>
        </section>
      );
    const currentLocation = detail.data.location;
    return (
      <section className="intake-locations-workspace intake-locations-workspace--detail">
        <div className="intake-location-detail-breadcrumb" aria-label="Location breadcrumb">
          <span>Admin Console</span><span aria-hidden="true">/</span><span>Physical Intake</span><span aria-hidden="true">/</span><button type="button" className="intake-location-detail-breadcrumb__back" onClick={onBack}><ArrowLeft aria-hidden="true" /> Intake Locations</button><span aria-hidden="true">/</span><strong>{currentLocation.displayName}</strong>
        </div>
        <div className="intake-location-detail-header">
          <div className="intake-location-detail-heading">
            <div>
              <p className="admin-console-eyebrow">Physical Intake / Receiving location</p>
              <h2>{currentLocation.displayName}</h2>
              <p>{locationTypeLabel(currentLocation.locationType)} · {currentLocation.city || currentLocation.region}, {currentLocation.countryCode}</p>
              <div className="intake-location-detail-badges"><StatusPill status={currentLocation.status} /><AvailabilityPill location={currentLocation} /><EnvironmentPill environment={currentLocation.environment} /></div>
            </div>
          </div>
          <div className="intake-location-detail-actions">
            <button className="admin-primary-button" type="button" disabled={!detail.data.availableCommands.EDIT?.allowed} onClick={() => setForm(formFromLocation(currentLocation))}>Edit Location</button>
            <ContextualLocationAction location={currentLocation} commands={detail.data.availableCommands} onCommand={(nextCommand, label) => { setCommand({ command: nextCommand, label }); setCommandReason(""); }} />
          </div>
        </div>
        <LocationSummaryStrip location={currentLocation} />
        <nav className="admin-filter-tabs" aria-label="Intake location detail tabs">
          {["overview", "configuration", "intakes", "staff", "history"].map((value) => (
            <button
              key={value}
              type="button"
              className={detailTab === value ? "is-active" : ""}
              onClick={() => onOpen(locationId, value)}
            >
              {value === "intakes" ? "Active Intakes" : value === "staff" ? "Staff & Access" : value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </nav>
        <div className="intake-location-detail-layout">
          <main className="intake-location-detail-main">
            {detailTab === "overview" ? <LocationOverview detail={detail.data} onEdit={() => setForm(formFromLocation(currentLocation))} onOpenIntakes={() => onOpen(locationId, "intakes")} /> : null}
            {detailTab === "configuration" ? <LocationConfiguration location={currentLocation} onEdit={() => setForm(formFromLocation(currentLocation))} /> : null}
            {detailTab === "intakes" ? <LocationIntakes detail={detail.data} /> : null}
            {detailTab === "staff" ? <LocationStaff detail={detail.data} /> : null}
            {detailTab === "history" ? <LocationHistory detail={detail.data} /> : null}
          </main>
          <LocationDetailRail detail={detail.data} onEdit={() => setForm(formFromLocation(currentLocation))} onCommand={(nextCommand, label) => { setCommand({ command: nextCommand, label }); setCommandReason(""); }} onOpenIntakes={() => onOpen(locationId, "intakes")} />
        </div>
        {form ? (
          <LocationForm
            values={formValues!}
            onChange={setForm}
            onCancel={() => setForm(null)}
            onSave={() => save.mutate({ id: currentLocation.id, values: formValues! })}
            pending={save.isPending}
            error={save.error instanceof Error ? save.error.message : null}
          />
        ) : null}
      </section>
    );
  }

  return (
    <section className="intake-locations-workspace">
      <div className="intake-locations-header">
        <div>
          <p className="admin-console-eyebrow">Admin Console / Physical Intake</p>
          <h2>Intake Locations</h2>
          <p>Manage where Collectors ship or deliver approved collectibles.</p>
        </div>
        <button className="admin-primary-button" type="button" onClick={() => setForm(blankForm())}>
          <Plus aria-hidden="true" /> Add Intake Location
        </button>
      </div>
      <div className="intake-location-page-grid">
        <main className="intake-location-page-main">
          <div className="intake-location-explanation"><Info aria-hidden="true" /><div><strong>These locations are presented to Collectors during destination selection.</strong><span>Keep location details accurate to reduce delays and improve the intake experience.</span></div></div>
          <div className="intake-location-metrics">
            <Metric label="Active Locations" detail="Across all environments" value={metrics?.activeLocations} icon={<Building2 />} />
            <Metric label="Accepting Intakes" detail="Currently available" value={metrics?.acceptingIntakes} icon={<CheckCircle2 />} />
            <Metric label="Shipping Enabled" detail="Available for shipping" value={metrics?.shippingEnabled} icon={<Truck />} />
            <Metric label="In-Person Enabled" detail="Available for drop-off" value={metrics?.inPersonEnabled} icon={<UsersRound />} />
            <Metric label="Temporarily Unavailable" detail="Paused or at capacity" value={metrics === undefined ? undefined : metrics.temporarilyUnavailable + metrics.atCapacity} icon={<Clock3 />} />
          </div>
          <div className="admin-panel intake-location-directory">
            <div className="intake-location-filters">
          <input
            className="admin-text-input"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Search locations..."
            aria-label="Search intake locations"
          />
          <select
            value={environment}
            onChange={(event) => {
              setEnvironment(event.target.value as typeof environment);
              setPage(1);
            }}
            aria-label="Location environment"
          >
            <option value="">All environments</option>
            <option value="production">Production</option>
            <option value="beta">Demo / QA</option>
          </select>
          <select
            value={delivery}
            onChange={(event) => {
              setDelivery(event.target.value as typeof delivery);
              setPage(1);
            }}
            aria-label="Delivery method"
          >
            <option value="">All methods</option>
            <option value="SHIPPING">Shipping</option>
            <option value="IN_PERSON">In-person</option>
            <option value="BOTH">Both methods</option>
          </select>
          <select
            value={availability}
            onChange={(event) => {
              setAvailability(event.target.value as typeof availability);
              setPage(1);
            }}
            aria-label="Availability"
          >
            <option value="">All availability</option>
            <option value="ACCEPTING">Accepting</option>
            <option value="PAUSED">Paused</option>
            <option value="AT_CAPACITY">At capacity</option>
            <option value="UNAVAILABLE">Unavailable</option>
          </select>
          <select
            value={type}
            onChange={(event) => {
              setType(event.target.value as typeof type);
              setPage(1);
            }}
            aria-label="Location type"
          >
            <option value="">All types</option>
            {locationTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as typeof sort);
              setPage(1);
            }}
            aria-label="Sort locations"
          >
            <option value="NAME">Location A–Z</option>
            <option value="ACTIVE_INTAKES">Most active intakes</option>
            <option value="RECENT_ACTIVITY">Recent activity</option>
          </select>
            </div>
            <div className="intake-location-filter-chips" aria-label="Location filter shortcuts">
              <button type="button" className={!environment && !delivery ? "is-active" : ""} onClick={() => { setEnvironment(""); setDelivery(""); setPage(1); }}>All</button>
              <button type="button" className={environment === "production" ? "is-active" : ""} onClick={() => { setEnvironment("production"); setPage(1); }}>Production</button>
              <button type="button" className={environment === "beta" ? "is-active" : ""} onClick={() => { setEnvironment("beta"); setPage(1); }}>Demo / QA</button>
              <button type="button" className={delivery === "SHIPPING" ? "is-active" : ""} onClick={() => { setDelivery("SHIPPING"); setPage(1); }}>Shipping</button>
              <button type="button" className={delivery === "IN_PERSON" ? "is-active" : ""} onClick={() => { setDelivery("IN_PERSON"); setPage(1); }}>In-Person</button>
              <button type="button" className="intake-location-clear-filters" onClick={() => { setQuery(""); setStatus(""); setDelivery(""); setAvailability(""); setType(""); setEnvironment(""); setAccepting(""); setSort("NAME"); setSortDirection("asc"); setPage(1); }}><RotateCcw aria-hidden="true" /> Clear filters</button>
            </div>
        {locations.isLoading ? (
          <p className="intake-location-state">Loading intake locations…</p>
        ) : null}
        {locations.isError ? (
          <p className="intake-location-state">Locations are unavailable. Refresh to retry.</p>
        ) : null}
        {!locations.isLoading && !locations.isError && !locations.data?.items.length ? (
          <div className="intake-location-state">
            <h3>No intake locations configured.</h3>
            <button
              className="admin-primary-button"
              type="button"
              onClick={() => setForm(blankForm())}
            >
              Add Intake Location
            </button>
          </div>
        ) : null}
        {locations.data?.items.length ? (
          <LocationDirectory items={locations.data.items} onOpen={(id) => onOpen(id, "overview")} />
        ) : null}
        {locations.data ? (
          <div className="intake-location-pagination">
            <span>
              Showing {locations.data.items.length} of {locations.data.pagination.total} locations
            </span>
            <div>
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                ‹
              </button>
              <strong>{page}</strong>
              <button
                type="button"
                disabled={page >= locations.data.pagination.totalPages}
                onClick={() => setPage(page + 1)}
              >
                ›
              </button>
            </div>
          </div>
        ) : null}
          </div>
          <div className="intake-location-policy"><Info aria-hidden="true" /><span>Inactive, paused, or at-capacity locations remain attached to historical intakes but are not shown as options for new destination selection.</span></div>
        </main>
        <LocationSummaryRail summary={metrics} onOpenPhysicalIntake={onBack} />
      </div>
      {form ? (
        <LocationForm
          values={form}
          onChange={setForm}
          onCancel={() => setForm(null)}
          onSave={() => save.mutate({ values: form })}
          pending={save.isPending}
          error={save.error instanceof Error ? save.error.message : null}
        />
      ) : null}
      {command ? (
        <div className="intake-location-modal" role="dialog" aria-modal="true" aria-label={`${command.label} confirmation`}>
          <form className="admin-panel intake-location-command-dialog" onSubmit={(event) => { event.preventDefault(); if (current) executeCommand.mutate({ id: current.id, command: command.command, reason: commandReason }); }}>
            <p className="admin-console-eyebrow">Protected location command</p>
            <h3>{command.label}</h3>
            <p>This changes Slice-internal availability or delivery configuration. Existing intake records remain attached.</p>
            <label>Reason<textarea required minLength={3} value={commandReason} onChange={(event) => setCommandReason(event.target.value)} placeholder="Explain why this command is being used." /></label>
            {executeCommand.isError ? <p className="intake-location-error">{executeCommand.error instanceof Error ? executeCommand.error.message : "The command could not be completed."}</p> : null}
            <div className="intake-location-form-actions"><button type="button" className="admin-secondary-button" onClick={() => setCommand(null)}>Cancel</button><button type="submit" className="admin-primary-button" disabled={executeCommand.isPending}>{executeCommand.isPending ? "Applying…" : "Apply command"}</button></div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function LocationDirectory({
  items,
  onOpen,
}: {
  items: AdminIntakeLocation[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="intake-location-table" role="table">
      <div className="intake-location-table-row intake-location-table-head" role="row">
        <span>Location</span>
        <span>Type</span>
        <span>Delivery Methods</span>
        <span>Environment</span>
        <span>Availability</span>
        <span>Capacity</span>
        <span>Active Intakes</span>
        <span>Last Activity</span>
        <span>Action</span>
      </div>
      {items.map((location) => (
        <div className="intake-location-table-row" role="row" key={location.id}>
          <div className="intake-location-name-cell">
            <span className={`intake-location-type-icon is-${location.locationType.toLowerCase()}`} aria-hidden="true">{location.locationType === "DEMO_TEST" ? <PackageCheck /> : location.locationType.includes("PARTNER") ? <UsersRound /> : <Building2 />}</span>
            <div>
            <strong>{location.displayName}</strong>
            <small>
              {location.city || location.region}, {location.countryCode}
            </small>
            </div>
          </div>
          <span>{locationTypeLabel(location.locationType)}</span>
          <MethodPills location={location} />
          <EnvironmentPill environment={location.environment} />
          <AvailabilityPill location={location} />
          <CapacityDisplay location={location} />
          <Link className="intake-location-active-link" to="/admin" search={{ section: "intake", vault: location.id }}>{location.activeIntakes} →</Link>
          <span className="intake-location-last-activity"><strong>{relativeTime(location.lastActivityAt)}</strong><small>{new Date(location.lastActivityAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></span>
          <button
            type="button"
            className="admin-secondary-button"
            onClick={() => onOpen(location.id)}
          >
            Manage
          </button>
        </div>
      ))}
    </div>
  );
}

function LocationSummaryRail({
  summary,
  onOpenPhysicalIntake,
}: {
  summary: AdminIntakeLocationsResponse["summary"] | undefined;
  onOpenPhysicalIntake: () => void;
}) {
  return (
    <aside className="intake-location-summary-rail">
      <section className="admin-panel intake-location-rail-card intake-location-health-card">
        <RailHeading icon={<Activity />} title="Location health" action="View all" />
        <div className="intake-location-health-visual">
          <div className="intake-location-health-gauge" style={{ "--health": `${summary?.health.percentage ?? 0}%` } as CSSProperties}><strong>{summary ? `${summary.health.percentage}%` : "—"}</strong><span>Healthy</span></div>
          <div className="intake-location-health-legend"><span><i className="is-healthy" />Healthy <b>{summary?.health.healthy ?? "—"}</b></span><span><i className="is-degraded" />Degraded <b>{summary?.health.degraded ?? "—"}</b></span><span><i className="is-critical" />Critical <b>{summary?.health.critical ?? "—"}</b></span></div>
        </div>
      </section>
      <section className="admin-panel intake-location-rail-card">
        <RailHeading icon={<AlertTriangle />} title="Active exceptions" action="View all" />
        <div className="intake-location-rail-stat"><strong>{summary?.exceptions.totalActive ?? "—"}</strong><span>Total active</span><div><span>At Capacity <b>{summary?.exceptions.atCapacity ?? "—"}</b></span><span>Paused <b>{summary?.exceptions.paused ?? "—"}</b></span></div></div>
      </section>
      <section className="admin-panel intake-location-rail-card">
        <RailHeading icon={<CircleAlert />} title="Needs attention" action="View all" />
        <div className="intake-location-rail-stat is-warning"><strong>{summary?.attention.requiresReview ?? "—"}</strong><span>Requires review</span><div><span>Low Capacity <b>{summary?.attention.lowCapacity ?? "—"}</b></span><span>Info Updates <b>{summary?.attention.infoUpdates ?? "—"}</b></span></div></div>
      </section>
      <section className="admin-panel intake-location-rail-card intake-location-quick-links">
        <RailHeading icon={<Link2 />} title="Quick links" />
        <button type="button" onClick={onOpenPhysicalIntake}><PackageCheck /> Open Physical Intake <ChevronRight /></button>
        <Link to="/admin" search={{ section: "audit" }}><Clock3 /> View Audit History <ChevronRight /></Link>
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><Settings2 /> Location Capacity Guide <ChevronRight /></button>
      </section>
    </aside>
  );
}

function RailHeading({ icon, title, action }: { icon: ReactNode; title: string; action?: string }) {
  return <div className="intake-location-rail-heading"><span>{icon}</span><strong>{title}</strong>{action ? <button type="button">{action}</button> : null}</div>;
}

function MethodPills({ location }: { location: Pick<AdminIntakeLocation, "acceptingShipments" | "acceptingInPerson"> }) {
  return <div className="intake-location-method-pills">{location.acceptingShipments ? <span><Truck /> Shipping</span> : null}{location.acceptingInPerson ? <span><UsersRound /> In-Person</span> : null}</div>;
}

function EnvironmentPill({ environment }: { environment: string }) {
  return <span className={`intake-location-environment is-${environment}`}>{environment === "production" ? "Production" : "Demo / QA"}</span>;
}

function LocationSummaryStrip({ location }: { location: AdminIntakeLocationDetail["location"] }) {
  const metrics = [
    { label: "Availability", value: <AvailabilityPill location={location} />, icon: <CheckCircle2 aria-hidden="true" /> },
    { label: "Delivery Methods", value: methodLabel(location), icon: <Truck aria-hidden="true" /> },
    { label: "Active Intakes", value: location.activeIntakes, icon: <PackageCheck aria-hidden="true" /> },
    { label: "Capacity", value: location.capacity ? `${location.capacity.active} / ${location.capacity.maximum}` : "Not configured", icon: <UsersRound aria-hidden="true" /> },
    { label: "Last Activity", value: new Date(location.lastActivityAt).toLocaleDateString([], { month: "short", day: "numeric" }), icon: <Clock3 aria-hidden="true" /> },
  ];
  return <div className="intake-location-summary-strip">{metrics.map((metric) => <div className="intake-location-summary-card" key={metric.label}><span className="intake-location-summary-card__icon">{metric.icon}</span><div><span>{metric.label}</span><strong>{metric.value}</strong></div></div>)}</div>;
}

function LocationOverview({ detail, onEdit, onOpenIntakes }: { detail: AdminIntakeLocationDetail; onEdit: () => void; onOpenIntakes: () => void }) {
  const { location } = detail;
  return (
    <div className="intake-location-overview-stack">
      <section className="admin-panel intake-location-detail-section">
        <SectionHeading eyebrow="Operational snapshot" title="Location status" action={<button type="button" className="admin-secondary-button" onClick={onEdit}>Manage availability</button>} />
        <dl className="intake-location-definition">
          <dt>Record status</dt><dd><StatusPill status={location.status} /></dd>
          <dt>Availability</dt><dd><AvailabilityPill location={location} />{location.availabilityReason ? <small className="intake-location-inline-reason">{location.availabilityReason}</small> : null}</dd>
          <dt>Environment</dt>
          <dd><EnvironmentPill environment={location.environment} /></dd>
          <dt>Facility type</dt><dd>{locationTypeLabel(location.locationType)}</dd>
          <dt>Active intakes</dt><dd>{location.activeIntakes}</dd>
          <dt>Capacity</dt><dd><CapacityDisplay location={location} /></dd>
          <dt>Warning threshold</dt><dd>{location.warningThreshold ?? "Not configured"}</dd>
          <dt>Delivery methods</dt>
          <dd><MethodPills location={location} /></dd>
          <dt>Collector visibility</dt><dd>{detail.collectorVisibility.eligibleForNewAssignment ? "Visible for new assignment" : detail.collectorVisibility.eligibilityReason || "Not visible for new assignment"}</dd>
          <dt>Current blockers</dt><dd>{location.warnings.length ? location.warnings.join(" · ") : "None"}</dd>
        </dl>
      </section>
      <div className="intake-location-detail-grid">
        <DeliveryCapabilities location={location} onEdit={onEdit} />
        <CollectorPreview location={location} visibility={detail.collectorVisibility} />
      </div>
      <div className="intake-location-detail-grid">
        <LocationIntakePreview detail={detail} onOpenIntakes={onOpenIntakes} />
      </div>
      <InternalOperationsSummary location={location} />
    </div>
  );
}

function InternalOperationsSummary({ location }: { location: AdminIntakeLocationDetail["location"] }) {
  return <section className="admin-panel intake-location-detail-section intake-location-internal-summary"><SectionHeading eyebrow="Slice-only data" title="Internal operations" /><dl className="intake-location-internal-grid"><div><dt>Internal location ID</dt><dd>{location.id}</dd></div><div><dt>Internal contact</dt><dd>{location.internalContact || "Not configured"}</dd></div><div><dt>Supported categories</dt><dd>{location.supportedCategories.length ? location.supportedCategories.map((category) => category.name).join(", ") : "All supported collectibles"}</dd></div><div><dt>Last updated</dt><dd>{new Date(location.updatedAt).toLocaleString()}</dd></div><div><dt>Operational notes</dt><dd>{location.operationalNotes || "Not configured"}</dd></div><div><dt>Created</dt><dd>{new Date(location.createdAt).toLocaleString()}</dd></div></dl></section>;
}

function SectionHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return <div className="intake-location-section-heading"><div>{eyebrow ? <p className="admin-console-eyebrow">{eyebrow}</p> : null}<h3>{title}</h3></div>{action}</div>;
}

function DeliveryCapabilities({ location, onEdit }: { location: AdminIntakeLocationDetail["location"]; onEdit: () => void }) {
  return <section className="admin-panel intake-location-detail-section"><SectionHeading eyebrow="Collector destination" title="Delivery capabilities" action={<button type="button" className="admin-secondary-button" onClick={onEdit}>Manage methods</button>} /><div className="intake-location-capability-grid"><div className={`intake-location-capability ${location.acceptingShipments ? "is-enabled" : "is-disabled"}`}><Truck /><div><strong>Shipping</strong><span>{location.acceptingShipments ? "Enabled" : "Not configured"}</span></div></div><div className={`intake-location-capability ${location.acceptingInPerson ? "is-enabled" : "is-disabled"}`}><UsersRound /><div><strong>In-person drop-off</strong><span>{location.acceptingInPerson ? "Enabled" : "Not configured"}</span></div></div></div>{location.acceptingShipments ? <div className="intake-location-preview-fields"><span><b>Ship to</b>{location.customerSafeAddress || "Not configured"}</span><span><b>Receiving instructions</b>{location.shippingInstructions || "Not configured"}</span><span><b>Package labels</b>{location.packageLabelInstructions || "Not configured"}</span></div> : null}{location.acceptingInPerson ? <div className="intake-location-preview-fields"><span><b>Opening hours</b>{location.openingHours || "Not configured"}</span><span><b>Drop-off instructions</b>{location.inPersonInstructions || "Not configured"}</span></div> : null}</section>;
}

function CollectorPreview({ location, visibility }: { location: AdminIntakeLocationDetail["location"]; visibility: AdminIntakeLocationDetail["collectorVisibility"] }) {
  return <section className="admin-panel intake-location-detail-section"><SectionHeading eyebrow="Collector preview" title="Collector preview" /><p className="intake-location-helper">This is how collectors see this intake destination.</p><div className="intake-location-collector-preview"><div className="intake-location-preview-icon"><Building2 /></div><div><strong>{location.displayName}</strong><span>{location.region}, {location.countryCode}</span><span>{methodLabel(location)}</span><p>{location.shippingInstructions || location.inPersonInstructions || "No public instructions configured."}</p></div><AvailabilityPill location={location} /></div><div className="intake-location-preview-visibility"><span>Eligible for new assignment <b className={visibility.eligibleForNewAssignment ? "is-yes" : "is-no"}>{visibility.eligibleForNewAssignment ? "Yes" : "No"}</b></span>{visibility.eligibilityReason ? <small>{visibility.eligibilityReason}</small> : null}</div></section>;
}

function LocationIntakePreview({ detail, onOpenIntakes }: { detail: AdminIntakeLocationDetail; onOpenIntakes: () => void }) {
  return <section className="admin-panel intake-location-detail-section"><SectionHeading eyebrow="Current work" title="Recent active intakes" action={<button type="button" className="admin-secondary-button" onClick={onOpenIntakes}>View all active intakes</button>} />{detail.intakes.length ? <div className="intake-location-preview-list">{detail.intakes.slice(0, 4).map((intake) => <Link key={intake.id} to="/admin" search={{ section: "intake", intake: intake.submissionId, intakeTab: "overview" }}><div><strong>{intake.title}</strong><small>{intake.collector} · {intake.deliveryMethod === "IN_PERSON" ? "In-person" : "Shipping"}</small></div><span>{intake.stage.replaceAll("_", " ")}</span><span>{intake.assignedStaff ?? "Unassigned"}</span><span>{intake.nextAction}</span></Link>)}</div> : <p className="intake-location-state">No active intakes are assigned to this location.</p>}</section>;
}

function CapacitySummary({ location }: { location: AdminIntakeLocationDetail["location"] }) {
  if (!location.capacity) return <section className="admin-panel intake-location-detail-section"><SectionHeading eyebrow="Operational load" title="Capacity" /><p className="intake-location-not-configured">Capacity is not configured for this location.</p></section>;
  const percentage = Math.round((location.capacity.active / location.capacity.maximum) * 100);
  const tone = location.availability === "AT_CAPACITY" || (location.capacity.warningThreshold !== null && location.capacity.active >= location.capacity.warningThreshold) ? "is-warning" : "";
  return <section className="admin-panel intake-location-detail-section"><SectionHeading eyebrow="Operational load" title="Capacity" /><div className={`intake-location-capacity-summary ${tone}`}><div><strong>{location.capacity.active} / {location.capacity.maximum}</strong><span>{percentage}% utilized</span></div><i><b style={{ width: `${Math.min(100, percentage)}%` }} /></i></div><dl className="intake-location-definition"><dt>Warning threshold</dt><dd>{location.capacity.warningThreshold ?? "Not configured"}</dd><dt>Availability</dt><dd><AvailabilityPill location={location} /></dd></dl></section>;
}

function NeedsAttentionCard({ location }: { location: AdminIntakeLocationDetail["location"] }) {
  return <section className={`admin-panel intake-location-detail-section intake-location-attention-card ${location.warnings.length ? "has-issues" : ""}`}><SectionHeading eyebrow="Operational warnings" title="Needs attention" />{location.warnings.length ? <ul>{location.warnings.map((warning) => <li key={warning}><CircleAlert />{warning}</li>)}</ul> : <p className="intake-location-all-clear"><CheckCircle2 /> No active issues. All systems operational.</p>}</section>;
}

function LocationDetailRail({ detail, onEdit, onCommand, onOpenIntakes }: { detail: AdminIntakeLocationDetail; onEdit: () => void; onCommand: (command: LocationCommandName, label: string) => void; onOpenIntakes: () => void }) {
  const { location, collectorVisibility, availableCommands } = detail;
  return <aside className="intake-location-detail-rail"><section className="admin-panel intake-location-detail-rail-card"><SectionHeading eyebrow="Location snapshot" title="Location snapshot" /><dl className="intake-location-rail-definition"><dt>Status</dt><dd><StatusPill status={location.status} /></dd><dt>Availability</dt><dd><AvailabilityPill location={location} /></dd><dt>Environment</dt><dd><EnvironmentPill environment={location.environment} /></dd><dt>Active intakes</dt><dd>{location.activeIntakes}</dd><dt>Capacity</dt><dd>{location.capacity ? `${location.capacity.active} / ${location.capacity.maximum}` : "Not configured"}</dd><dt>Delivery</dt><dd>{methodLabel(location)}</dd></dl></section><NeedsAttentionCard location={location} /><section className="admin-panel intake-location-detail-rail-card intake-location-quick-actions"><SectionHeading eyebrow="Controls" title="Quick actions" /><button type="button" onClick={onEdit} disabled={!availableCommands.EDIT?.allowed}><Settings2 /> Edit configuration <ChevronRight /></button><button type="button" onClick={onOpenIntakes}><PackageCheck /> View active intakes <ChevronRight /></button><ContextualLocationAction location={location} commands={availableCommands} onCommand={onCommand} compact /></section><section className="admin-panel intake-location-detail-rail-card intake-location-visibility-card"><SectionHeading eyebrow="Collector visibility" title="Destination eligibility" /><VisibilityRow label="Visible in Demo / QA" value={collectorVisibility.visibleInDemoQA} /><VisibilityRow label="Visible in Production" value={collectorVisibility.visibleInProduction} /><VisibilityRow label="Shipping" value={collectorVisibility.shipping} /><VisibilityRow label="In-person" value={collectorVisibility.inPerson} /><VisibilityRow label="Eligible for new assignment" value={collectorVisibility.eligibleForNewAssignment} />{collectorVisibility.eligibilityReason ? <p className="intake-location-rail-reason">{collectorVisibility.eligibilityReason}</p> : null}</section></aside>;
}

function VisibilityRow({ label, value }: { label: string; value: boolean }) {
  return <div className="intake-location-visibility-row"><span>{label}</span><b className={value ? "is-yes" : "is-no"}>{value ? "Yes" : "No"}</b></div>;
}

function ContextualLocationAction({ location, commands, onCommand, compact = false }: { location: AdminIntakeLocationDetail["location"]; commands: AdminIntakeLocationDetail["availableCommands"]; onCommand: (command: LocationCommandName, label: string) => void; compact?: boolean }) {
  const primary: [LocationCommandName, string] = location.status === "TEMPORARILY_UNAVAILABLE" ? ["RESUME_NEW_INTAKES", "Resume New Intakes"] : location.status === "INACTIVE" ? ["REACTIVATE", "Reactivate Location"] : ["PAUSE_NEW_INTAKES", "Pause New Intakes"];
  const more: Array<[LocationCommandName, string]> = location.status === "INACTIVE" ? [["REACTIVATE", "Reactivate Location"]] : [["DEACTIVATE", "Deactivate Location"], ["REPAIR_AVAILABILITY", "Repair Availability"], ["REPAIR_CAPACITY_PROJECTION", "Recalculate Capacity"]];
  return <div className={`intake-location-context-actions ${compact ? "is-compact" : ""}`}><button type="button" className="admin-secondary-button" disabled={!commands[primary[0]]?.allowed} title={commands[primary[0]]?.reason} onClick={() => onCommand(primary[0], primary[1])}>{primary[1]}</button><details><summary>More</summary><div>{more.map(([command, label]) => <button key={command} type="button" disabled={!commands[command]?.allowed} title={commands[command]?.reason} onClick={() => onCommand(command, label)}>{label}</button>)}</div></details></div>;
}

function LocationConfiguration({ location, onEdit }: { location: AdminIntakeLocationDetail["location"]; onEdit: () => void }) {
  return <div className="intake-location-configuration-stack"><section className="admin-panel intake-location-detail-section"><SectionHeading eyebrow="Collector-facing data" title="Public information" action={<button type="button" className="admin-primary-button" onClick={onEdit}>Edit configuration</button>} /><dl className="intake-location-definition"><dt>Public name</dt><dd>{location.displayName}</dd><dt>Safe public address</dt><dd>{location.customerSafeAddress || "Not configured"}</dd><dt>Public contact</dt><dd>{location.publicContactInstructions || "Not configured"}</dd><dt>Shipping instructions</dt><dd>{location.shippingInstructions || "Not configured"}</dd><dt>In-person instructions</dt><dd>{location.inPersonInstructions || "Not configured"}</dd><dt>Opening hours</dt><dd>{location.openingHours || "Not configured"}</dd><dt>Appointment / walk-ins</dt><dd>{location.appointmentRequired ? "Appointment required" : "Appointment not required"} · {location.walkInsAllowed ? "Walk-ins allowed" : "Walk-ins not allowed"}</dd></dl></section><div className="intake-location-detail-grid"><section className="admin-panel intake-location-detail-section"><SectionHeading eyebrow="Slice-only data" title="Internal information" /><dl className="intake-location-definition"><dt>Internal location ID</dt><dd><code>{location.id}</code></dd><dt>Internal name</dt><dd>{location.internalName || "Not configured"}</dd><dt>Internal contact</dt><dd>{location.internalContact || "Not configured"}</dd><dt>Facility type</dt><dd>{locationTypeLabel(location.locationType)}</dd><dt>Environment</dt><dd>{environmentLabel(location.environment)}</dd><dt>Supported categories</dt><dd>{location.supportedCategories.length ? location.supportedCategories.map((category) => category.name).join(", ") : "All supported collectibles"}</dd><dt>Operational notes</dt><dd>{location.operationalNotes || "Not configured"}</dd></dl></section><section className="admin-panel intake-location-detail-section"><SectionHeading eyebrow="Operational controls" title="Capacity & availability" /><dl className="intake-location-definition"><dt>Maximum active intakes</dt><dd>{location.maximumActiveIntakes ?? "Not configured"}</dd><dt>Warning threshold</dt><dd>{location.warningThreshold ?? "Not configured"}</dd><dt>Record status</dt><dd><StatusPill status={location.status} /></dd><dt>Receiving availability</dt><dd><AvailabilityPill location={location} /></dd><dt>Pause reason</dt><dd>{location.pauseReason || "—"}</dd><dt>Created</dt><dd>{new Date(location.createdAt).toLocaleString()}</dd><dt>Last updated</dt><dd>{new Date(location.updatedAt).toLocaleString()}</dd></dl></section></div></div>;
}

function LocationStaff({ detail }: { detail: AdminIntakeLocationDetail }) {
  const contributors = detail.history.filter((event) => event.actor && event.actor !== "System").filter((event, index, events) => events.findIndex((candidate) => candidate.actor === event.actor) === index).slice(0, 6);
  return <section className="intake-location-staff-stack"><section className="admin-panel intake-location-staff-empty"><Settings2 aria-hidden="true" /><h3>Global Physical Intake permissions apply</h3><p>This location currently uses global Physical Intake staff permissions. Location-specific receiving, verification, and custody RBAC is not configured.</p></section><section className="admin-panel"><SectionHeading eyebrow="Audit-derived" title="Recent contributing staff" />{contributors.length ? <div className="intake-location-contributors">{contributors.map((event) => <div key={event.actor}><span className="intake-location-contributor-avatar">{event.actor.slice(0, 1).toUpperCase()}</span><div><strong>{event.actor}</strong><small>{event.action.replaceAll("_", " ")} · {new Date(event.occurredAt).toLocaleDateString()}</small></div></div>)}</div> : <p className="intake-location-state">No contributing staff are available in the authorized history projection.</p>}</section></section>;
}

function AvailabilityPill({ location }: { location: Pick<AdminIntakeLocation, "availability" | "availabilityLabel"> }) {
  return <span className={`intake-location-availability is-${location.availability.toLowerCase()}`}>{location.availabilityLabel}</span>;
}

function CapacityDisplay({ location }: { location: Pick<AdminIntakeLocation, "capacity" | "activeIntakes"> }) {
  if (!location.capacity) return <span className="intake-location-unlimited">Unlimited</span>;
  const percent = Math.min(100, Math.round((location.capacity.active / location.capacity.maximum) * 100));
  return <span className="intake-location-capacity"><span>{location.capacity.active} / {location.capacity.maximum}</span><i><b style={{ width: `${percent}%` }} /></i></span>;
}

function LocationCommandBar({ location, commands, onCommand }: { location: AdminIntakeLocationDetail["location"]; commands: AdminIntakeLocationDetail["availableCommands"]; onCommand: (command: "PAUSE_NEW_INTAKES" | "RESUME_NEW_INTAKES" | "DEACTIVATE" | "REACTIVATE" | "ENABLE_SHIPPING" | "DISABLE_SHIPPING" | "ENABLE_IN_PERSON" | "DISABLE_IN_PERSON" | "REPAIR_AVAILABILITY" | "REPAIR_CAPACITY_PROJECTION", label: string) => void }) {
  const actions: Array<[keyof typeof commands, string, "PAUSE_NEW_INTAKES" | "RESUME_NEW_INTAKES" | "DEACTIVATE" | "REACTIVATE" | "ENABLE_SHIPPING" | "DISABLE_SHIPPING" | "ENABLE_IN_PERSON" | "DISABLE_IN_PERSON" | "REPAIR_AVAILABILITY" | "REPAIR_CAPACITY_PROJECTION"]> = location.status === "INACTIVE" ? [["REACTIVATE", "Reactivate", "REACTIVATE"]] : location.status === "TEMPORARILY_UNAVAILABLE" ? [["RESUME_NEW_INTAKES", "Resume new intakes", "RESUME_NEW_INTAKES"], ["DEACTIVATE", "Deactivate", "DEACTIVATE"]] : [["PAUSE_NEW_INTAKES", "Pause new intakes", "PAUSE_NEW_INTAKES"], ["DEACTIVATE", "Deactivate", "DEACTIVATE"]];
  const recoveryActions: Array<[keyof typeof commands, string, "REPAIR_AVAILABILITY" | "REPAIR_CAPACITY_PROJECTION"]> = [["REPAIR_AVAILABILITY", "Repair availability", "REPAIR_AVAILABILITY"], ["REPAIR_CAPACITY_PROJECTION", "Repair capacity projection", "REPAIR_CAPACITY_PROJECTION"]];
  const shippingCommand = location.acceptingShipments ? "DISABLE_SHIPPING" : "ENABLE_SHIPPING";
  const inPersonCommand = location.acceptingInPerson ? "DISABLE_IN_PERSON" : "ENABLE_IN_PERSON";
  return <div className="intake-location-command-bar"><strong>Location commands</strong>{actions.map(([key, label, action]) => <button key={key} type="button" className="admin-secondary-button" disabled={!commands[key]?.allowed} title={commands[key]?.allowed ? undefined : commands[key]?.reason} onClick={() => onCommand(action, label)}>{label}</button>)}<button type="button" className="admin-secondary-button" disabled={!commands[shippingCommand]?.allowed} title={commands[shippingCommand]?.allowed ? undefined : commands[shippingCommand]?.reason} onClick={() => onCommand(shippingCommand, shippingCommand === "ENABLE_SHIPPING" ? "Enable shipping" : "Disable shipping")}>{shippingCommand === "ENABLE_SHIPPING" ? "Enable shipping" : "Disable shipping"}</button><button type="button" className="admin-secondary-button" disabled={!commands[inPersonCommand]?.allowed} title={commands[inPersonCommand]?.allowed ? undefined : commands[inPersonCommand]?.reason} onClick={() => onCommand(inPersonCommand, inPersonCommand === "ENABLE_IN_PERSON" ? "Enable in-person delivery" : "Disable in-person delivery")}>{inPersonCommand === "ENABLE_IN_PERSON" ? "Enable in-person" : "Disable in-person"}</button>{recoveryActions.map(([key, label, action]) => <button key={key} type="button" className="admin-secondary-button" disabled={!commands[key]?.allowed} title={commands[key]?.allowed ? undefined : commands[key]?.reason} onClick={() => onCommand(action, label)}>{label}</button>)}<span>Existing intakes remain attached during availability changes.</span></div>;
}

function LocationIntakes({ detail }: { detail: AdminIntakeLocationDetail }) {
  return (
    <section className="admin-panel">
      <div className="intake-location-counts">
        {Object.entries(detail.counts).map(([stage, count]) => (
          <span key={stage}>
            <strong>{count}</strong>
            {stage.replaceAll("_", " ")}
          </span>
        ))}
      </div>
      <div className="intake-location-table intake-location-intakes-table" role="table">
        <div className="intake-location-table-row intake-location-table-head" role="row">
          <span>Collectible</span>
          <span>Collector</span>
          <span>Delivery</span>
          <span>Current stage</span>
          <span>Assigned staff</span>
          <span>Next action</span>
          <span>Time in stage</span>
          <span>Issue</span>
        </div>
        {detail.intakes.map((intake) => (
          <Link className="intake-location-table-row" role="row" key={intake.id} to="/admin" search={{ section: "intake", intake: intake.submissionId, intakeTab: "overview" }}>
            <div>
              <strong>{intake.title}</strong>
              <small>{intake.reference}</small>
            </div>
            <span>{intake.collector}</span>
            <span>{intake.deliveryMethod === "IN_PERSON" ? "In-person" : "Shipping"}</span>
            <span>{intake.stage.replaceAll("_", " ")}</span>
            <span>{intake.assignedStaff ?? "Unassigned"}</span>
            <span>{intake.nextAction}</span>
            <span>{relativeTime(intake.updatedAt)}</span>
            <span>{intake.issue?.code ?? "—"}</span>
          </Link>
        ))}
      </div>
      {!detail.intakes.length ? (
        <p className="intake-location-state">No physical intakes are assigned to this location.</p>
      ) : null}
    </section>
  );
}

function LocationHistory({ detail }: { detail: AdminIntakeLocationDetail }) {
  return (
    <section className="admin-panel">
      <div className="intake-location-history">
        {detail.history.map((event) => (
          <div key={event.id}>
            <strong>{event.action.replaceAll("_", " ")}</strong>
            <span>{event.actor}</span>
            <small>{new Date(event.occurredAt).toLocaleString()}</small>
            {event.reason ? <p>{event.reason}</p> : null}
            {event.before || event.after ? (
              <details>
                <summary>View state transition</summary>
                <pre>{JSON.stringify({ before: event.before, after: event.after }, null, 2)}</pre>
              </details>
            ) : null}
          </div>
        ))}
      </div>
      {!detail.history.length ? (
        <p className="intake-location-state">No location history is available yet.</p>
      ) : null}
    </section>
  );
}

function LocationForm({
  values,
  onChange,
  onCancel,
  onSave,
  pending,
  error,
}: {
  values: IntakeLocationInput;
  onChange: (value: IntakeLocationInput) => void;
  onCancel: () => void;
  onSave: () => void;
  pending: boolean;
  error: string | null;
}) {
  const set = <K extends keyof IntakeLocationInput>(key: K, value: IntakeLocationInput[K]) =>
    onChange({ ...values, [key]: value });
  return (
    <div
      className="intake-location-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Intake location form"
    >
      <form
        className="admin-panel intake-location-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <div className="intake-locations-header">
          <div>
            <p className="admin-console-eyebrow">Receiving location configuration</p>
            <h3>{values.expectedUpdatedAt ? "Edit Intake Location" : "Add Intake Location"}</h3>
          </div>
          <button type="button" className="admin-secondary-button" onClick={onCancel}>
            Cancel
          </button>
        </div>
        <fieldset>
          <legend>Basic Information</legend>
          <label>
            Public Name
            <input required value={values.displayName} onChange={(event) => set("displayName", event.target.value)} />
          </label>
          <label>
            Internal Name
            <input value={values.internalName ?? ""} onChange={(event) => set("internalName", event.target.value || null)} placeholder="Admin-only reference" />
          </label>
          <label>
            Location type
            <select
              value={values.locationType}
              onChange={(event) => set("locationType", event.target.value as IntakeLocationType)}
            >
              {locationTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Environment
            <select
              value={values.environment}
              onChange={(event) => set("environment", event.target.value as "beta" | "production")}
            >
              <option value="beta">Test / Beta</option>
              <option value="production">Production</option>
            </select>
          </label>
          <label>
            Status
            <select
              value={values.status}
              onChange={(event) => set("status", event.target.value as IntakeLocationStatus)}
            >
              <option value="ACTIVE">Active</option>
              <option value="TEMPORARILY_UNAVAILABLE">Temporarily unavailable</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </label>
        </fieldset>
        <fieldset>
          <legend>Address</legend>
          <p className="intake-location-form-help">
            Demo/test locations may remain unaddressed while unavailable. Selectable locations
            require a customer-safe address.
          </p>
          <div className="intake-location-form-grid">
            <label>
              Receiver
              <input
                value={values.receiverName ?? ""}
                onChange={(event) => set("receiverName", event.target.value || null)}
              />
            </label>
            <label>
              Address line 1
              <input
                value={values.addressLine1 ?? ""}
                onChange={(event) => set("addressLine1", event.target.value || null)}
              />
            </label>
            <label>
              Address line 2
              <input
                value={values.addressLine2 ?? ""}
                onChange={(event) => set("addressLine2", event.target.value || null)}
              />
            </label>
            <label>
              City
              <input
                value={values.city ?? ""}
                onChange={(event) => set("city", event.target.value || null)}
              />
            </label>
            <label>
              Region / State
              <input
                required
                value={values.region}
                onChange={(event) => set("region", event.target.value)}
              />
            </label>
            <label>
              Postal code
              <input
                value={values.postalCode ?? ""}
                onChange={(event) => set("postalCode", event.target.value || null)}
              />
            </label>
            <label>
              Country
              <input
                required
                maxLength={2}
                value={values.countryCode}
                onChange={(event) => set("countryCode", event.target.value.toUpperCase())}
              />
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Delivery Methods</legend>
          <div className="intake-location-methods">
            <label>
              <input
                type="checkbox"
                checked={values.acceptingShipments}
                onChange={(event) => set("acceptingShipments", event.target.checked)}
              />{" "}
              <strong>Shipping</strong>
              <small>Collectors may ship approved items to this location.</small>
            </label>
            <label>
              <input
                type="checkbox"
                checked={values.acceptingInPerson}
                onChange={(event) => set("acceptingInPerson", event.target.checked)}
              />{" "}
              <strong>In-Person Drop-Off</strong>
              <small>Collectors may bring approved items directly to this location.</small>
            </label>
          </div>
          <label>
            Shipping instructions
            <textarea
              value={values.shippingInstructions}
              onChange={(event) => set("shippingInstructions", event.target.value)}
            />
          </label>
          <label>
            In-person drop-off instructions
            <textarea
              value={values.inPersonInstructions ?? ""}
              onChange={(event) => set("inPersonInstructions", event.target.value || null)}
            />
          </label>
          <div className="intake-location-form-grid">
            <label>Opening hours<input value={values.openingHours ?? ""} onChange={(event) => set("openingHours", event.target.value || null)} placeholder="Mon–Fri, 09:00–17:00" /></label>
            <label>Public contact instructions<textarea value={values.publicContactInstructions ?? ""} onChange={(event) => set("publicContactInstructions", event.target.value || null)} /></label>
            <label>Package label instructions<textarea value={values.packageLabelInstructions ?? ""} onChange={(event) => set("packageLabelInstructions", event.target.value || null)} /></label>
            <label>Special handling instructions<textarea value={values.specialHandlingInstructions ?? ""} onChange={(event) => set("specialHandlingInstructions", event.target.value || null)} /></label>
          </div>
          <div className="intake-location-methods"><label><input type="checkbox" checked={Boolean(values.appointmentRequired)} onChange={(event) => set("appointmentRequired", event.target.checked)} /> Appointment required</label><label><input type="checkbox" checked={Boolean(values.walkInsAllowed)} onChange={(event) => set("walkInsAllowed", event.target.checked)} /> Walk-ins allowed</label></div>
        </fieldset>
        <fieldset>
          <legend>Capacity &amp; internal operations</legend>
          <div className="intake-location-form-grid"><label>Maximum active intakes<input type="number" min="1" value={values.maximumActiveIntakes ?? ""} onChange={(event) => set("maximumActiveIntakes", event.target.value ? Number(event.target.value) : null)} placeholder="Unlimited" /></label><label>Warning threshold<input type="number" min="0" value={values.warningThreshold ?? ""} onChange={(event) => set("warningThreshold", event.target.value ? Number(event.target.value) : null)} placeholder="Optional" /></label><label>Internal contact<input value={values.internalContact ?? ""} onChange={(event) => set("internalContact", event.target.value || null)} /></label><label>Operational notes<textarea value={values.operationalNotes ?? ""} onChange={(event) => set("operationalNotes", event.target.value || null)} /></label></div>
        </fieldset>
        <fieldset>
          <legend>Availability</legend>
          <label>
            <input
              type="checkbox"
              checked={values.operationallyApproved}
              onChange={(event) => set("operationallyApproved", event.target.checked)}
            />{" "}
            Operationally approved
          </label>
          <label>
            <input
              type="checkbox"
              checked={values.acceptingNewIntakes}
              onChange={(event) => set("acceptingNewIntakes", event.target.checked)}
            />{" "}
            Accepting new intakes
          </label>
          <label>
            Audit reason
            <textarea
              required
              minLength={3}
              value={values.reason}
              onChange={(event) => set("reason", event.target.value)}
              placeholder="Why is this location being created or changed?"
            />
          </label>
        </fieldset>
        {error ? <p className="intake-location-error">{error}</p> : null}
        <div className="intake-location-form-actions">
          <button type="button" className="admin-secondary-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="admin-primary-button" disabled={pending}>
            {pending ? "Saving…" : "Save Intake Location"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Metric({
  label,
  detail,
  value,
  icon,
}: {
  label: string;
  detail?: string;
  value: number | undefined;
  icon: ReactNode;
}) {
  return (
    <div className="admin-panel">
      <span>{icon}</span>
      <strong>{value === undefined ? "Unavailable" : value}</strong>
      <small>{label}</small>
      {detail ? <em>{detail}</em> : null}
    </div>
  );
}
function StatusPill({ status }: { status: IntakeLocationStatus }) {
  return (
    <span
      className={`admin-status-pill ${status === "ACTIVE" ? "is-green" : status === "INACTIVE" ? "is-red" : "is-amber"}`}
    >
      {status === "TEMPORARILY_UNAVAILABLE"
        ? "Temporarily unavailable"
        : status[0] + status.slice(1).toLowerCase()}
    </span>
  );
}
function locationTypeLabel(type: IntakeLocationType) {
  return locationTypes.find((item) => item.value === type)?.label ?? type;
}
function environmentLabel(environment: string) {
  return environment === "production" ? "Production" : "Test / Beta";
}
function methodLabel(
  location: Pick<AdminIntakeLocation, "acceptingShipments" | "acceptingInPerson">,
) {
  return (
    [location.acceptingShipments ? "Shipping" : "", location.acceptingInPerson ? "In Person" : ""]
      .filter(Boolean)
      .join(" + ") || "Unavailable"
  );
}
function relativeTime(value: string) {
  const delta = Math.max(0, Date.now() - new Date(value).getTime());
  const hours = Math.floor(delta / 3_600_000);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}
function formFromLocation(
  location: AdminIntakeLocation &
    Partial<{
      acceptingNewIntakes: boolean;
      receiverName: string | null;
      addressLine1: string | null;
      addressLine2: string | null;
      postalCode: string | null;
      shippingInstructions: string;
      inPersonInstructions: string | null;
      internalName: string | null;
      operationalNotes: string | null;
      internalContact: string | null;
      openingHours: string | null;
      appointmentRequired: boolean;
      walkInsAllowed: boolean;
      publicContactInstructions: string | null;
      packageLabelInstructions: string | null;
      specialHandlingInstructions: string | null;
      maximumActiveIntakes: number | null;
      warningThreshold: number | null;
      pauseReason: string | null;
      pauseEffectiveAt: string | null;
      expectedResumeAt: string | null;
      supportedCategories: Array<{ id: string }>;
    }>,
): IntakeLocationInput {
  return {
    displayName: location.displayName,
    locationType: location.locationType,
    environment: location.environment,
    status: location.status,
    acceptingNewIntakes: location.acceptingNewIntakes ?? location.intakeAvailable,
    operationallyApproved: location.operationallyApproved,
    acceptingShipments: location.acceptingShipments,
    acceptingInPerson: location.acceptingInPerson,
    receiverName: location.receiverName ?? null,
    addressLine1: location.addressLine1 ?? null,
    addressLine2: location.addressLine2 ?? null,
    city: location.city,
    region: location.region,
    postalCode: location.postalCode ?? null,
    countryCode: location.countryCode,
    acceptedCategoryIds: location.supportedCategories?.map((category) => category.id) ?? [],
    shippingInstructions: location.shippingInstructions ?? "",
    inPersonInstructions: location.inPersonInstructions ?? null,
    internalName: location.internalName ?? null,
    operationalNotes: location.operationalNotes ?? null,
    internalContact: location.internalContact ?? null,
    openingHours: location.openingHours ?? null,
    appointmentRequired: location.appointmentRequired ?? false,
    walkInsAllowed: location.walkInsAllowed ?? false,
    publicContactInstructions: location.publicContactInstructions ?? null,
    packageLabelInstructions: location.packageLabelInstructions ?? null,
    specialHandlingInstructions: location.specialHandlingInstructions ?? null,
    maximumActiveIntakes: location.maximumActiveIntakes ?? null,
    warningThreshold: location.warningThreshold ?? null,
    pauseReason: location.pauseReason ?? null,
    pauseEffectiveAt: location.pauseEffectiveAt ?? null,
    expectedResumeAt: location.expectedResumeAt ?? null,
    reason: "",
    expectedUpdatedAt: "updatedAt" in location ? location.updatedAt : undefined,
  };
}
