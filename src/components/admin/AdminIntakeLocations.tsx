import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Building2, MapPin, PackageCheck, Plus, Truck, UsersRound } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import type {
  AdminIntakeLocation,
  AdminIntakeLocationDetail,
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
  reason: "",
});

export function AdminIntakeLocations({ locationId, tab, onBack, onOpen }: Props) {
  const { repositories } = useAppServices();
  const client = useQueryClient();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | IntakeLocationStatus>("");
  const [delivery, setDelivery] = useState<"" | "SHIPPING" | "IN_PERSON">("");
  const [type, setType] = useState<"" | IntakeLocationType>("");
  const [environment, setEnvironment] = useState<"" | "beta" | "production">("");
  const [accepting, setAccepting] = useState<"" | "true" | "false">("");
  const [sort, setSort] = useState<"NAME" | "UPDATED">("NAME");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<IntakeLocationInput | null>(null);
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
      page,
    ],
    queryFn: () =>
      repositories.admin.listIntakeLocations({
        q: query.trim() || undefined,
        status: status || undefined,
        deliveryMethod: delivery || undefined,
        type: type || undefined,
        environment: environment || undefined,
        acceptingNewIntakes: accepting === "" ? undefined : accepting === "true",
        sort,
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

  const metrics = locations.data?.summary;
  const current = detail.data?.location;
  const formValues = form ?? (current ? formFromLocation(current) : null);
  const detailTab = ["overview", "intakes", "history"].includes(tab ?? "") ? tab! : "overview";
  const title = current ? current.displayName : "Intake Locations";

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
      <section className="intake-locations-workspace">
        <div className="intake-locations-header">
          <button className="admin-secondary-button" type="button" onClick={onBack}>
            <ArrowLeft aria-hidden="true" /> Intake Locations
          </button>
          <div>
            <p className="admin-console-eyebrow">Physical Intake / Receiving location</p>
            <h2>{currentLocation.displayName}</h2>
            <p>
              {locationTypeLabel(currentLocation.locationType)} ·{" "}
              {currentLocation.city || currentLocation.region}, {currentLocation.countryCode} ·{" "}
              {environmentLabel(currentLocation.environment)}
            </p>
          </div>
          <button
            className="admin-primary-button"
            type="button"
            onClick={() => setForm(formFromLocation(currentLocation))}
          >
            Edit location
          </button>
        </div>
        <div className="intake-location-status-row">
          <StatusPill status={currentLocation.status} />
          <span>
            {currentLocation.acceptingNewIntakes ? "Accepting new intakes" : "New intakes paused"}
          </span>
          <span>
            {currentLocation.operationallyApproved
              ? "Operationally approved"
              : "Not operationally approved"}
          </span>
        </div>
        <nav className="admin-filter-tabs" aria-label="Intake location detail tabs">
          {["overview", "intakes", "history"].map((value) => (
            <button
              key={value}
              type="button"
              className={detailTab === value ? "is-active" : ""}
              onClick={() => onOpen(locationId, value)}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </nav>
        {detailTab === "overview" ? <LocationOverview location={currentLocation} /> : null}
        {detailTab === "intakes" ? <LocationIntakes detail={detail.data} /> : null}
        {detailTab === "history" ? <LocationHistory detail={detail.data} /> : null}
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
      <div className="intake-location-metrics">
        <Metric label="Active Locations" value={metrics?.activeLocations} icon={<Building2 />} />
        <Metric label="Shipping Enabled" value={metrics?.shippingEnabled} icon={<Truck />} />
        <Metric label="In-Person Enabled" value={metrics?.inPersonEnabled} icon={<MapPin />} />
        <Metric label="Partner Locations" value={metrics?.partnerLocations} icon={<UsersRound />} />
        <Metric label="Unavailable" value={metrics?.unavailable} icon={<PackageCheck />} />
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
            placeholder="Search location, city, region, or country"
            aria-label="Search intake locations"
          />
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as typeof status);
              setPage(1);
            }}
            aria-label="Location status"
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="TEMPORARILY_UNAVAILABLE">Temporarily unavailable</option>
            <option value="INACTIVE">Inactive</option>
          </select>
          <select
            value={delivery}
            onChange={(event) => {
              setDelivery(event.target.value as typeof delivery);
              setPage(1);
            }}
            aria-label="Delivery method"
          >
            <option value="">All delivery methods</option>
            <option value="SHIPPING">Shipping</option>
            <option value="IN_PERSON">In-person</option>
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
            {locationTypes.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            value={environment}
            onChange={(event) => {
              setEnvironment(event.target.value as typeof environment);
              setPage(1);
            }}
            aria-label="Location environment"
          >
            <option value="">All environments</option>
            <option value="beta">Test / Beta</option>
            <option value="production">Production</option>
          </select>
          <select
            value={accepting}
            onChange={(event) => {
              setAccepting(event.target.value as typeof accepting);
              setPage(1);
            }}
            aria-label="Accepting new intakes"
          >
            <option value="">Any availability</option>
            <option value="true">Accepting new intakes</option>
            <option value="false">Paused new intakes</option>
          </select>
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as typeof sort);
              setPage(1);
            }}
            aria-label="Sort locations"
          >
            <option value="NAME">Name</option>
            <option value="UPDATED">Recently updated</option>
          </select>
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
        <span>Status</span>
        <span>Active Intakes</span>
        <span>Action</span>
      </div>
      {items.map((location) => (
        <div className="intake-location-table-row" role="row" key={location.id}>
          <div>
            <strong>{location.displayName}</strong>
            <small>
              {location.city || location.region}, {location.countryCode}
            </small>
          </div>
          <span>{locationTypeLabel(location.locationType)}</span>
          <span>{methodLabel(location)}</span>
          <span>{environmentLabel(location.environment)}</span>
          <StatusPill status={location.status} />
          <span>{location.activeIntakes}</span>
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

function LocationOverview({ location }: { location: AdminIntakeLocationDetail["location"] }) {
  return (
    <div className="intake-location-detail-grid">
      <section className="admin-panel">
        <h3>Overview</h3>
        <dl className="intake-location-definition">
          <dt>Type</dt>
          <dd>{locationTypeLabel(location.locationType)}</dd>
          <dt>Environment</dt>
          <dd>{environmentLabel(location.environment)}</dd>
          <dt>Address</dt>
          <dd>{location.customerSafeAddress || "Not configured for this demo/test location"}</dd>
          <dt>Delivery methods</dt>
          <dd>{methodLabel(location)}</dd>
          <dt>Accepting new intakes</dt>
          <dd>{location.acceptingNewIntakes ? "Yes" : "No"}</dd>
          <dt>Supported collectibles</dt>
          <dd>
            {location.supportedCategories.length
              ? location.supportedCategories.map((category) => category.name).join(", ")
              : "All supported collectibles"}
          </dd>
          <dt>Created</dt>
          <dd>{new Date(location.createdAt).toLocaleString()}</dd>
          <dt>Last updated</dt>
          <dd>{new Date(location.updatedAt).toLocaleString()}</dd>
        </dl>
      </section>
      <section className="admin-panel">
        <h3>Customer instructions</h3>
        <h4>Shipping</h4>
        <p>{location.shippingInstructions || "No shipping instructions configured."}</p>
        <h4>In-person drop-off</h4>
        <p>{location.inPersonInstructions || "No in-person instructions configured."}</p>
      </section>
    </div>
  );
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
      <div className="intake-location-table" role="table">
        <div className="intake-location-table-row intake-location-table-head" role="row">
          <span>Collectible</span>
          <span>Collector</span>
          <span>Delivery</span>
          <span>Current stage</span>
          <span>Time in stage</span>
          <span>Issue</span>
        </div>
        {detail.intakes.map((intake) => (
          <div className="intake-location-table-row" role="row" key={intake.id}>
            <div>
              <strong>{intake.title}</strong>
              <small>{intake.reference}</small>
            </div>
            <span>{intake.collector}</span>
            <span>{intake.deliveryMethod === "IN_PERSON" ? "In-person" : "Shipping"}</span>
            <span>{intake.stage.replaceAll("_", " ")}</span>
            <span>{relativeTime(intake.updatedAt)}</span>
            <span>{intake.issue?.code ?? "—"}</span>
          </div>
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
            Location name
            <input
              required
              value={values.displayName}
              onChange={(event) => set("displayName", event.target.value)}
            />
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
  value,
  icon,
}: {
  label: string;
  value: number | undefined;
  icon: ReactNode;
}) {
  return (
    <div className="admin-panel">
      <span>{icon}</span>
      <strong>{value === undefined ? "Unavailable" : value}</strong>
      <small>{label}</small>
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
    reason: "",
    expectedUpdatedAt: "updatedAt" in location ? location.updatedAt : undefined,
  };
}
