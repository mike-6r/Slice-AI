import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Image as ImageIcon,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import type { AdminCollectibleDetail as Detail } from "@/data/repositories";
import type { PublicationReadiness } from "@/domain";
import { useAppServices } from "@/providers/AppServicesProvider";
import "@/styles/admin-operations.css";

const tabs = [
  "overview",
  "verification",
  "valuation",
  "custody",
  "market-readiness",
  "history",
] as const;
type DetailTab = (typeof tabs)[number];

export function AdminAssetOperationsDetail({
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
    queryKey: ["admin", "asset-operations-detail", assetId],
    queryFn: () => services.repositories.admin.getCollectibleDetail(assetId, "overview"),
    staleTime: 20_000,
  });
  const readiness = useQuery({
    queryKey: ["admin", "asset-operations-readiness", assetId],
    queryFn: () => services.repositories.lifecycle.getReadiness(assetId),
    staleTime: 10_000,
  });
  const [providerCode, setProviderCode] = useState("");
  const [facilityCode, setFacilityCode] = useState("");
  const [providerRef, setProviderRef] = useState("");
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["admin", "asset-operations-detail", assetId] });
    void client.invalidateQueries({ queryKey: ["admin", "asset-operations-readiness", assetId] });
    void client.invalidateQueries({ queryKey: ["admin", "asset-operations"] });
  };
  const handoff = useMutation({
    mutationFn: () =>
      services.repositories.lifecycle.handoff(assetId, { providerCode, facilityCode, providerRef }),
    onSuccess: refresh,
  });
  const custody = useMutation({
    mutationFn: (toStatus: string) =>
      services.repositories.lifecycle.transitionCustody(assetId, toStatus, providerRef),
    onSuccess: refresh,
  });
  const publish = useMutation({
    mutationFn: () => services.repositories.lifecycle.publish(assetId),
    onSuccess: refresh,
  });
  const [valueMinor, setValueMinor] = useState("");
  const [confidence, setConfidence] = useState("80");
  const valuation = useMutation({
    mutationFn: () =>
      services.repositories.lifecycle.recordValuation(assetId, {
        valueMinor,
        confidence: Number(confidence),
        methodologyCode: "MANUAL_REVIEW",
        sourceType: "MANUAL",
      }),
    onSuccess: () => {
      setValueMinor("");
      refresh();
    },
  });

  if (detail.isLoading)
    return (
      <OperationDetailState
        title="Loading operation"
        detail="Reading the authoritative collectible and lifecycle record."
      />
    );
  if (detail.isError || !detail.data)
    return (
      <OperationDetailState
        title="Operation unavailable"
        detail="This post-receipt operation could not be loaded safely."
        retry={() => void detail.refetch()}
      />
    );
  const item = detail.data;
  const front = item.media.find((media) => media.slot.toLowerCase() === "front") ?? item.media[0];
  const completed = item.lifecycle.stages.filter((stage) => stage.state === "complete").at(-1);
  return (
    <main className="admin-operation-detail">
      <button type="button" className="admin-back-button" onClick={onBack}>
        <ArrowLeft aria-hidden="true" /> Asset Operations
      </button>
      <header className="admin-operation-detail__header">
        <div>
          <p className="admin-operations-breadcrumb">
            Asset Operations <span>›</span> Operation detail
          </p>
          <h2>{item.title}</h2>
          <p>
            {item.identity.year ?? "Year unavailable"} · {item.identity.set ?? "Set unavailable"} ·{" "}
            {item.identity.cardNumber ? `#${item.identity.cardNumber}` : "Card number unavailable"}
          </p>
        </div>
        <div className="admin-operation-detail__actions">
          <span className="admin-stage-badge">{stageLabel(item.lifecycle.current)}</span>
          <a
            className="admin-ops-button secondary"
            href={`/asset/${item.slug}`}
            target="_blank"
            rel="noreferrer"
          >
            Public record <ExternalLink aria-hidden="true" />
          </a>
        </div>
      </header>
      <section className="admin-operation-detail__hero">
        <div className="admin-operation-detail__media">
          {front?.url ? (
            <img src={front.url} alt={item.title} />
          ) : (
            <div>
              <ImageIcon aria-hidden="true" />
              <span>No approved front media</span>
            </div>
          )}
        </div>
        <div>
          <span className="admin-operations-intro__eyebrow">Canonical collectible</span>
          <h3>{item.identity.category}</h3>
          <p>
            {item.identity.manufacturer ?? "Manufacturer unavailable"} ·{" "}
            {item.identity.variant ?? "Standard variant"} ·{" "}
            {item.identity.language ?? "Language unavailable"}
          </p>
          <div className="admin-operation-facts">
            <span>
              <b>Collector</b>
              {item.collector?.displayName ?? "Unavailable"}
            </span>
            <span>
              <b>Physical intake</b>
              {item.intake ? sentence(item.intake.status) : "Not recorded"}
            </span>
            <span>
              <b>Custody</b>
              {sentence(item.custody.status)}
            </span>
            <span>
              <b>Market</b>
              {item.market.publication === "PUBLISHED"
                ? "Published"
                : sentence(item.market.readiness.status)}
            </span>
          </div>
        </div>
      </section>
      <section className="admin-operation-progress" aria-label="Post-receipt lifecycle">
        <span className="admin-operations-intro__eyebrow">Lifecycle progress</span>
        <div>
          {item.lifecycle.stages.map((stage) => (
            <span key={stage.key} className={`admin-progress-step ${stage.state}`}>
              <i>{stage.state === "complete" ? "✓" : stage.state === "current" ? "•" : ""}</i>
              {stage.label}
            </span>
          ))}
        </div>
        <p>
          {completed
            ? `Last confirmed milestone: ${completed.label}${completed.at ? ` · ${date(completed.at)}` : ""}`
            : "No milestone has been confirmed yet."}
        </p>
      </section>
      <nav className="admin-operation-detail__tabs" aria-label="Operation detail sections">
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
          readiness={readiness.data}
          providerCode={providerCode}
          facilityCode={facilityCode}
          providerRef={providerRef}
          setProviderCode={setProviderCode}
          setFacilityCode={setFacilityCode}
          setProviderRef={setProviderRef}
          onHandoff={() => handoff.mutate()}
          handoffPending={handoff.isPending}
        />
      ) : null}
      {selected === "verification" ? <Verification item={item} /> : null}
      {selected === "valuation" ? (
        <Valuation
          item={item}
          valueMinor={valueMinor}
          setValueMinor={setValueMinor}
          confidence={confidence}
          setConfidence={setConfidence}
          submit={() => valuation.mutate()}
          pending={valuation.isPending}
        />
      ) : null}
      {selected === "custody" ? (
        <Custody
          item={item}
          providerRef={providerRef}
          setProviderRef={setProviderRef}
          transition={(status) => custody.mutate(status)}
          pending={custody.isPending}
        />
      ) : null}
      {selected === "market-readiness" ? (
        <MarketReadiness
          item={item}
          readiness={readiness.data}
          publish={() => publish.mutate()}
          pending={publish.isPending}
        />
      ) : null}
      {selected === "history" ? <History item={item} /> : null}
      {[handoff, custody, valuation, publish].some((mutation) => mutation.isError) ? (
        <p className="admin-operation-error" role="alert">
          The lifecycle service refused that action. Refresh the operation and readiness before
          retrying.
        </p>
      ) : null}
    </main>
  );
}

function Overview({
  item,
  readiness,
  providerCode,
  facilityCode,
  providerRef,
  setProviderCode,
  setFacilityCode,
  setProviderRef,
  onHandoff,
  handoffPending,
}: {
  item: Detail;
  readiness?: PublicationReadiness;
  providerCode: string;
  facilityCode: string;
  providerRef: string;
  setProviderCode: (value: string) => void;
  setFacilityCode: (value: string) => void;
  setProviderRef: (value: string) => void;
  onHandoff: () => void;
  handoffPending: boolean;
}) {
  return (
    <div className="admin-operation-detail__grid">
      <section className="admin-operation-card admin-operation-card--wide">
        <div className="admin-card-heading">
          <div>
            <span className="admin-operations-intro__eyebrow">What needs attention</span>
            <h3>
              {readiness?.status === "READY"
                ? "Ready for market readiness"
                : "Work remains before publication"}
            </h3>
          </div>
          <span
            className={`admin-readiness ${readiness?.status === "READY" ? "ready" : "blocked"}`}
          >
            {readiness?.status === "READY" ? (
              <>
                <CheckCircle2 aria-hidden="true" /> Ready
              </>
            ) : (
              <>
                <CircleAlert aria-hidden="true" /> Blocked
              </>
            )}
          </span>
        </div>
        {readiness?.blockingCodes.length ? (
          <ul className="admin-blocker-list">
            {readiness.blockingCodes.map((code) => (
              <li key={code}>{sentence(code)}</li>
            ))}
          </ul>
        ) : (
          <p className="admin-detail-muted">All authoritative readiness gates are satisfied.</p>
        )}
        {!item.intake ? (
          <p className="admin-detail-callout">
            <ShieldCheck aria-hidden="true" /> No physical receipt is recorded. This collectible
            should remain outside post-receipt operations.
          </p>
        ) : null}
        {!item.intake ? (
          <div className="admin-custody-fields">
            <label>Provider code<input value={providerCode} onChange={(event) => setProviderCode(event.target.value)} placeholder="Approved operator code" /></label>
            <label>Facility code<input value={facilityCode} onChange={(event) => setFacilityCode(event.target.value)} placeholder="Approved facility" /></label>
            <label>Handoff reference<input value={providerRef} onChange={(event) => setProviderRef(event.target.value)} placeholder="Receipt or operator reference" /></label>
          </div>
        ) : null}
        <button
          type="button"
          className="admin-ops-button primary"
          onClick={onHandoff}
          disabled={handoffPending || Boolean(item.intake) || !providerCode.trim() || !facilityCode.trim() || !providerRef.trim()}
        >
          {" "}
          {item.intake ? "Receipt already recorded" : "Start custody handoff"}{" "}
          <ArrowRight aria-hidden="true" />
        </button>
      </section>
      <Info title="Verification">
        <Field label="Status" value={sentence(item.verification.status)} />
        <Field label="Decision" value={item.verification.decision} />
        <Field
          label="Verified at"
          value={item.verification.verifiedAt ? date(item.verification.verifiedAt) : null}
        />
      </Info>
      <Info title="Valuation">
        <Field
          label="Current value"
          value={
            item.valuation.current
              ? money(item.valuation.current.minor, item.valuation.current.currency)
              : "Not recorded"
          }
          accent
        />
        <Field
          label="Method"
          value={item.valuation.current ? sentence(item.valuation.current.method) : null}
        />
      </Info>
      <Info title="Custody">
        <Field label="Status" value={sentence(item.custody.status)} accent />
        <Field label="Location" value={item.custody.location ?? "Restricted / not recorded"} />
        <Field
          label="Secured"
          value={item.custody.securedAt ? date(item.custody.securedAt) : null}
        />
      </Info>
    </div>
  );
}
function Verification({ item }: { item: Detail }) {
  return (
    <div className="admin-operation-detail__grid">
      <Info title="Identity verification">
        <Field label="Status" value={sentence(item.verification.status)} accent />
        <Field label="Decision" value={item.verification.decision} />
        <Field label="Reviewer" value={item.verification.verifiedBy} />
        <Field
          label="Completed"
          value={item.verification.verifiedAt ? date(item.verification.verifiedAt) : null}
        />
      </Info>
      <section className="admin-operation-card">
        <h3>Approved evidence</h3>
        <div className="admin-evidence-grid">
          {item.evidence.length ? (
            item.evidence.map((media) => (
              <div key={`${media.slot}-${media.filename}`}>
                {media.url ? (
                  <img src={media.url} alt={media.slot} />
                ) : (
                  <ImageIcon aria-hidden="true" />
                )}
                <span>
                  {sentence(media.slot)} · {sentence(media.status)}
                </span>
              </div>
            ))
          ) : (
            <p className="admin-detail-muted">No approved evidence recorded.</p>
          )}
        </div>
      </section>
    </div>
  );
}
function Valuation({
  item,
  valueMinor,
  setValueMinor,
  confidence,
  setConfidence,
  submit,
  pending,
}: {
  item: Detail;
  valueMinor: string;
  setValueMinor: (value: string) => void;
  confidence: string;
  setConfidence: (value: string) => void;
  submit: () => void;
  pending: boolean;
}) {
  return (
    <div className="admin-operation-detail__grid">
      <Info title="Current valuation">
        <Field
          label="Supported value"
          value={
            item.valuation.current
              ? money(item.valuation.current.minor, item.valuation.current.currency)
              : "Not recorded"
          }
          accent
        />
        <Field
          label="Method"
          value={item.valuation.current ? sentence(item.valuation.current.method) : null}
        />
        <Field
          label="As of"
          value={item.valuation.current ? date(item.valuation.current.asOf) : null}
        />
      </Info>
      <section className="admin-operation-card">
        <h3>Record a decision</h3>
        <p className="admin-detail-muted">
          Use a supported value in GBP minor units. External market research remains advisory
          evidence.
        </p>
        <label className="admin-form-field">
          Value in GBP minor units
          <input
            value={valueMinor}
            inputMode="numeric"
            onChange={(event) => setValueMinor(event.target.value)}
          />
        </label>
        <label className="admin-form-field">
          Confidence (0–100)
          <input
            value={confidence}
            inputMode="numeric"
            onChange={(event) => setConfidence(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="admin-ops-button primary"
          disabled={!valueMinor || pending}
          onClick={submit}
        >
          Save valuation <ArrowRight aria-hidden="true" />
        </button>
      </section>
    </div>
  );
}
function Custody({
  item,
  providerRef,
  setProviderRef,
  transition,
  pending,
}: {
  item: Detail;
  providerRef: string;
  setProviderRef: (value: string) => void;
  transition: (status: string) => void;
  pending: boolean;
}) {
  return (
    <div className="admin-operation-detail__grid">
      <Info title="Custody record">
        <Field label="Current status" value={sentence(item.custody.status)} accent />
        <Field label="Location" value={item.custody.location ?? "Restricted / not recorded"} />
        <Field
          label="Received"
          value={item.custody.receivedAt ? date(item.custody.receivedAt) : null}
        />
        <Field
          label="Secured"
          value={item.custody.securedAt ? date(item.custody.securedAt) : null}
        />
      </Info>
      <section className="admin-operation-card">
        <h3>Allowed transitions</h3>
        <p className="admin-detail-muted">
          Transitions are validated and audited by the lifecycle service.
        </p>
        <label className="admin-form-field">
          Evidence or operator reference
          <input value={providerRef} onChange={(event) => setProviderRef(event.target.value)} placeholder="Reference for this custody step" />
        </label>
        <div className="admin-action-list">
          {["RECEIVED", "INSPECTED", "SECURED", "EXCEPTION"].map((status) => (
            <button
              type="button"
              key={status}
              className="admin-ops-button secondary"
              onClick={() => transition(status)}
              disabled={pending}
            >
              {sentence(status)} <ArrowRight aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
function MarketReadiness({
  item,
  readiness,
  publish,
  pending,
}: {
  item: Detail;
  readiness?: PublicationReadiness;
  publish: () => void;
  pending: boolean;
}) {
  return (
    <div className="admin-operation-detail__grid">
      <section className="admin-operation-card admin-operation-card--wide">
        <div className="admin-card-heading">
          <h3>Publication gates</h3>
          <span
            className={`admin-readiness ${readiness?.status === "READY" ? "ready" : "blocked"}`}
          >
            {readiness?.status === "READY" ? "Ready" : "Blocked"}
          </span>
        </div>
        {readiness?.blockingCodes.length ? (
          <ul className="admin-blocker-list">
            {readiness.blockingCodes.map((code) => (
              <li key={code}>{sentence(code)}</li>
            ))}
          </ul>
        ) : (
          <p className="admin-detail-muted">
            Every readiness gate is satisfied. Publishing remains a deliberate staff action.
          </p>
        )}
        <button
          type="button"
          className="admin-ops-button primary"
          disabled={
            readiness?.status !== "READY" || pending || item.market.publication === "PUBLISHED"
          }
          onClick={publish}
        >
          {item.market.publication === "PUBLISHED" ? "Published" : "Publish to market"}{" "}
          <ArrowRight aria-hidden="true" />
        </button>
      </section>
      <Info title="Market context">
        <Field label="Publication" value={sentence(item.market.publication)} />
        <Field
          label="Last updated"
          value={item.market.lastUpdated ? date(item.market.lastUpdated) : null}
        />
        <Field label="Sales observed" value={item.market.salesCount} />
      </Info>
    </div>
  );
}
function History({ item }: { item: Detail }) {
  return (
    <section className="admin-operation-card">
      <div className="admin-card-heading">
        <h3>Lifecycle history</h3>
        <span>{item.activity.length} recorded events</span>
      </div>
      {item.activity.length ? (
        <div className="admin-history-list">
          {item.activity.map((event) => (
            <div key={event.id}>
              <span>{date(event.occurredAt)}</span>
              <strong>{sentence(event.action)}</strong>
              <p>{event.detail ?? "No additional detail"}</p>
              <small>{event.actor}</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="admin-detail-muted">No lifecycle events recorded.</p>
      )}
    </section>
  );
}
function Info({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="admin-operation-card">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
function Field({ label, value, accent }: { label: string; value: unknown; accent?: boolean }) {
  return (
    <div className="admin-operation-field">
      <span>{label}</span>
      <strong className={accent ? "accent" : ""}>
        {value === null || value === undefined || value === "" ? "Not recorded" : String(value)}
      </strong>
    </div>
  );
}
function OperationDetailState({
  title,
  detail,
  retry,
}: {
  title: string;
  detail: string;
  retry?: () => void;
}) {
  return (
    <section className="admin-operations-state">
      <h2>{title}</h2>
      <p>{detail}</p>
      {retry ? (
        <button type="button" onClick={retry}>
          Retry
        </button>
      ) : null}
    </section>
  );
}
function label(value: string) {
  return value === "market-readiness"
    ? "Market readiness"
    : value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function stageLabel(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function sentence(value: string) {
  return stageLabel(value);
}
function date(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
function money(minor: string, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
      Number(BigInt(minor)) / 100,
    );
  } catch {
    return `${currency} ${minor}`;
  }
}
