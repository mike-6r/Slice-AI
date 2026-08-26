import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Image as ImageIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useAppServices } from "@/providers/AppServicesProvider";
import type { AdminCollectibleDetail as Detail } from "@/data/repositories";
import { formatMinorAmount, formatPricePerUnit } from "@/lib/market-presentation";
import "@/styles/admin-collectible-detail.css";

const tabs = [
  "overview",
  "physical",
  "valuation",
  "ownership",
  "issuance",
  "offering",
  "market",
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
    mutationFn: () => services.repositories.admin.confirmIntakeReceipt(detail.data!.intake!.id, {
      packageCondition: "UNKNOWN",
      checklist: {
        packageReceived: true,
        correctIntakeReference: true,
        correctCollectible: true,
        visibleConditionAcceptable: true,
        tamperDamageChecked: true,
        trackingMatches: true,
      },
    }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["admin", "collectible", assetId] }),
  });
  if (detail.isLoading)
    return (
      <DetailState
        title="Loading collectible"
        detail="Reading the authoritative catalogue record."
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
  const front = item.media.find((media) => media.slot.toLowerCase() === "front") ?? item.media[0];
  const physical = item.intake ? sentence(item.intake.status) : "Not recorded";
  const market =
    item.marketLifecycle?.admin.publicState ??
    (item.market.publication === "PUBLISHED"
      ? "Published"
      : sentence(item.market.readiness.status));
  return (
    <main className="admin-collectible-detail">
      <div className="admin-detail-header">
        <button type="button" className="admin-back-button" onClick={onBack}>
          <ArrowLeft aria-hidden="true" /> Collectibles
        </button>
        <div className="admin-detail-heading">
          <div>
            <p className="admin-breadcrumb">
              Collectibles <span>›</span> Collectible detail
            </p>
            <h2>{item.title}</h2>
            <p className="admin-detail-meta">
              {item.identity.year ?? "Year unavailable"} · {item.identity.set ?? "Set unavailable"}{" "}
              ·{" "}
              {item.identity.cardNumber
                ? `#${item.identity.cardNumber}`
                : "Card number unavailable"}
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
              View public page <ExternalLink aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
      <section className="admin-detail-hero">
        <div className="admin-detail-hero__media">
          {front?.url ? (
            <img src={front.url} alt={item.title} />
          ) : (
            <div>
              <ImageIcon aria-hidden="true" />
              <span>No approved public image</span>
            </div>
          )}
        </div>
        <div className="admin-detail-hero__identity">
          <p className="admin-detail-eyebrow">Canonical collectible</p>
          <h3>{item.identity.category}</h3>
          <p>
            {item.identity.manufacturer ?? "Manufacturer unavailable"} ·{" "}
            {item.identity.variant ?? "Standard variant"} ·{" "}
            {item.identity.language ?? "Language unavailable"}
          </p>
          <div className="admin-detail-chip-row">
            <Chip label="Physical" value={physical} />
            <Chip label="Market" value={market} />
            <Chip label="Owners" value={String(item.ownership.ownerCount ?? 0)} />
            <Chip
              label="Valuation"
              value={
                item.valuation.current
                  ? money(item.valuation.current.minor, item.valuation.current.currency)
                  : "Not recorded"
              }
            />
          </div>
        </div>
        <div className="admin-detail-hero__facts">
          <Field label="Collectible ID" value={item.publicId} />
          <Field
            label="Grading"
            value={
              item.grading
                ? `${item.grading.company} ${item.grading.grade} · ${item.grading.label}`
                : "Raw / ungraded"
            }
          />
          <Field label="Card number" value={item.identity.cardNumber} />
          <Field label="Last updated" value={date(item.updatedAt)} />
        </div>
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
  receipt: { mutate: () => void; isPending: boolean };
}) {
  const current = item.lifecycle.stages.filter((stage) => stage.state === "complete").at(-1);
  return (
    <div className="admin-detail-grid">
      <div className="admin-detail-main">
        <section className="admin-detail-card">
          <div className="admin-card-heading">
            <h3>Where this collectible is now</h3>
            <span>
              {item.marketLifecycle?.admin.internalState ?? sentence(item.lifecycle.current)}
            </span>
          </div>
          <div className="admin-journey admin-journey--compact">
            {item.lifecycle.stages.map((stage) => (
              <div className={`admin-journey-step ${stage.state}`} key={stage.key}>
                <span>
                  {stage.state === "complete" ? "✓" : stage.state === "current" ? "•" : ""}
                </span>
                <strong>{stage.label}</strong>
                <small>
                  {stage.at
                    ? date(stage.at)
                    : stage.state === "current"
                      ? "Current"
                      : "Not recorded"}
                </small>
              </div>
            ))}
          </div>
          {current ? (
            <p className="admin-detail-muted">
              Last confirmed milestone: <strong>{current.label}</strong>
              {current.at ? ` · ${date(current.at)}` : ""}
            </p>
          ) : null}
        </section>
        <div className="admin-detail-card-grid admin-detail-card-grid--three">
          {item.marketLifecycle ? (
            <InfoCard title="Market lifecycle">
              <Field label="Public state" value={item.marketLifecycle.admin.publicState} accent />
              <Field label="Internal state" value={item.marketLifecycle.admin.internalState} />
              <Field label="Next action" value={item.marketLifecycle.admin.nextAction} />
              <Field label="Dependency" value={item.marketLifecycle.admin.blockingDependency} />
            </InfoCard>
          ) : null}
          <InfoCard title="Identity">
            <Field label="Set" value={item.identity.set} />
            <Field label="Year" value={item.identity.year} />
            <Field label="Edition" value={item.identity.edition} />
            <Field label="Rarity" value={item.identity.rarity} />
          </InfoCard>
          <InfoCard title="Ownership">
            <Field label="Issued" value={item.ownership.issuedUnits} />
            <Field label="Available" value={item.ownership.availableUnits} />
            <Field label="Owners" value={item.ownership.ownerCount} />
            <LinkButton href={`/asset/${item.slug}`}>View public ownership</LinkButton>
          </InfoCard>
          <InfoCard title="Custody">
            <Field label="Status" value={sentence(item.custody.status)} accent />
            <Field
              label="Location"
              value={
                item.custody.location
                  ? item.custody.location
                  : item.custody.status === "SECURED"
                    ? "Secured vault · location restricted"
                    : "Not recorded"
              }
            />
            <Field
              label="Secured"
              value={item.custody.securedAt ? date(item.custody.securedAt) : null}
            />
          </InfoCard>
        </div>
        <div className="admin-detail-card-grid admin-detail-card-grid--three">
          <InfoCard title="Valuation">
            <Field
              label="Supported value"
              value={
                item.valuation.current
                  ? money(item.valuation.current.minor, item.valuation.current.currency)
                  : null
              }
              accent
            />
            <Field
              label="Method"
              value={item.valuation.current ? valuationMethod(item.valuation.current.method) : null}
            />
            <Field
              label="As of"
              value={item.valuation.current ? date(item.valuation.current.asOf) : null}
            />
          </InfoCard>
          <InfoCard title="Market reference">
            <Field
              label="Current asking"
              value={
                item.market.asking
                  ? money(item.market.asking.minor, item.market.asking.currency)
                  : "Not observed"
              }
            />
            <Field label="Completed sales" value={item.market.salesCount || "None recorded"} />
            <Field label="Readiness" value={sentence(item.market.readiness.status)} />
          </InfoCard>
          <InfoCard title="Collector">
            <Field label="Name" value={item.collector?.displayName} />
            <Field
              label="Username"
              value={item.collector?.username ? `@${item.collector.username}` : null}
            />
            <Field label="Submissions" value={item.collector?.submissions} />
          </InfoCard>
        </div>
      </div>
      <aside className="admin-detail-rail">
        <InfoCard title="Admin actions">
          <LinkButton href={`/operations/assets?asset=${item.id}`}>
            Open lifecycle operations
          </LinkButton>
          <LinkButton href={`/admin?section=assetOperations&asset=${item.id}&tab=valuation`}>
            Review valuation
          </LinkButton>
          <LinkButton href={`/admin?section=assetOperations&asset=${item.id}&tab=marketplace`}>
            Review market readiness
          </LinkButton>
        </InfoCard>
        <InfoCard title="Recent activity">
          <ActivityList item={item} />
        </InfoCard>
        <InfoCard title="Physical intake">
          {item.intake ? (
            <>
              <Field label="Status" value={sentence(item.intake.status)} />
              <Field label="Tracking" value={item.intake.tracking} />
              {item.intake.deliveredAt && !item.intake.receiptConfirmedAt ? (
                <button
                  className="admin-button primary"
                  type="button"
                  onClick={receipt.mutate}
                  disabled={receipt.isPending}
                >
                  Confirm receipt
                </button>
              ) : null}
            </>
          ) : (
            <p className="admin-empty-detail">
              No intake record. This does not imply a shipment or receipt.
            </p>
          )}
        </InfoCard>
      </aside>
    </div>
  );
}

function TabContent({ item, tab }: { item: Detail; tab: DetailTab }) {
  if (tab === "physical") return <PhysicalTab item={item} />;
  if (tab === "valuation") return <ValuationTab item={item} />;
  if (tab === "ownership") return <OwnershipTab item={item} />;
  if (tab === "issuance") {
    const issuance = item.issuance;
    return issuance ? (
      <IssuanceTab item={{ ...item, issuance }} />
    ) : (
      <UnavailableEnrichment
        title="Issuance unavailable"
        detail="Ownership issuance data could not be loaded. No issuance values were assumed."
      />
    );
  }
  if (tab === "offering") return <InitialOfferingTab item={item} />;
  if (tab === "market") return <MarketTab item={item} />;
  return (
    <section className="admin-detail-card admin-detail-tab-panel">
      <div className="admin-card-heading">
        <h3>History</h3>
        <span>Audit events only</span>
      </div>
      <ActivityList item={item} expanded />
    </section>
  );
}
function InitialOfferingTab({ item }: { item: Detail }) {
  const services = useAppServices();
  const client = useQueryClient();
  const offering = item.initialOffering;
  const [reason, setReason] = useState("");
  const invalidate = () => void client.invalidateQueries({ queryKey: ["admin", "collectible", item.id] });
  const approve = useMutation({
    mutationFn: () => services.repositories.admin.approveInitialOffering(offering!.offeringId, reason.trim()),
    onSuccess: () => { setReason(""); invalidate(); },
  });
  const requestChanges = useMutation({
    mutationFn: () => services.repositories.admin.requestInitialOfferingChanges(offering!.offeringId, reason.trim()),
    onSuccess: () => { setReason(""); invalidate(); },
  });
  const open = useMutation({
    mutationFn: () => services.repositories.admin.openInitialOffering(offering!.offeringId),
    onSuccess: invalidate,
  });
  const pause = useMutation({
    mutationFn: () => services.repositories.admin.pauseInitialOffering(offering!.offeringId),
    onSuccess: invalidate,
  });
  const cancel = useMutation({
    mutationFn: () => services.repositories.admin.cancelInitialOffering(offering!.offeringId),
    onSuccess: invalidate,
  });
  if (!offering) {
    return (
      <section className="admin-detail-card admin-detail-tab-panel">
        <div className="admin-card-heading"><h3>Initial offering</h3><span>Not configured</span></div>
        <p className="admin-detail-muted">
          No collector offering has been submitted. This is separate from Slice Treasury liquidity and does not create ownership units.
        </p>
      </section>
    );
  }
  const busy = approve.isPending || requestChanges.isPending || open.isPending || pause.isPending || cancel.isPending;
  const status = offering.status;
  return (
    <section className="admin-detail-card admin-detail-tab-panel admin-offering-panel">
      <div className="admin-card-heading">
        <div>
          <h3>Collector initial offering</h3>
          <p className="admin-detail-muted">A collector-originated sale of part of the approved ownership supply.</p>
        </div>
        <span className={`admin-detail-status ${status.toLowerCase()}`}>{sentence(status)}</span>
      </div>
      <div className="admin-detail-card-grid admin-detail-card-grid--three">
        <InfoCard title="Collector terms">
          <Field label="Collector" value={offering.collector.displayName} />
          <Field label="Offered" value={`${offering.offeredUnits} units · ${formatOfferingBps(offering.offeredPercentageBps)}`} accent />
          <Field label="Collector retains" value={`${offering.retainedUnits} units · ${formatOfferingBps(offering.retainedPercentageBps)}`} />
          <Field label="Price per unit" value={money(offering.pricePerUnitMinor, offering.currency)} />
          <Field label="Gross proceeds" value={money(offering.grossOfferingMinor, offering.currency)} />
        </InfoCard>
        <InfoCard title="Settlement">
          <Field label="Fee policy" value={`${offering.feeScheduleVersion} · ${offering.feeBps / 100}%`} />
          <Field label="Fee" value={money(offering.feeMinor, offering.currency)} />
          <Field label="Collector net" value={money(offering.netOfferingMinor, offering.currency)} accent />
          <Field label="Valuation" value={offering.valuation ? money(offering.valuation.minor, offering.valuation.currency) : "Not recorded"} />
          <Field label="Supply policy" value={offering.supplyPolicy ? sentence(offering.supplyPolicy.status) : "Not approved"} />
        </InfoCard>
        <InfoCard title="Readiness">
          <Field label="Publication" value={offering.readiness.publication ? "Published" : "Required"} />
          <Field label="Custody" value={offering.readiness.custody ? "Secured" : "Required"} />
          <Field label="Insurance" value={offering.readiness.insurance ? "Active" : "Required"} />
          <Field label="Trading market" value={offering.readiness.market ? "Open" : "Not open"} />
          <Field label="Inventory" value={offering.inventory ? `${offering.inventory.availableUnits} available · ${offering.inventory.settledUnits} settled` : "Not issued"} />
        </InfoCard>
      </div>
      <div className="admin-offering-ledger-note">
        <strong>Initial offering inventory</strong>
        <span>Collector-originated inventory and proceeds are tracked separately from Slice Treasury liquidity.</span>
      </div>
      {offering.changeRequestReason ? (
        <div className="admin-detail-callout"><strong>Collector action needed:</strong> {offering.changeRequestReason}</div>
      ) : null}
      {(status === "AWAITING_APPROVAL" || status === "CHANGES_REQUESTED") ? (
        <div className="admin-issuance-form">
          <label>
            Review note
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain the approval or requested change." />
          </label>
          <div className="admin-button-row">
            <button className="admin-button secondary" type="button" disabled={busy || reason.trim().length < 12} onClick={() => requestChanges.mutate()}>
              {requestChanges.isPending ? "Sending…" : "Request changes"}
            </button>
            <button className="admin-button primary" type="button" disabled={busy || reason.trim().length < 12} onClick={() => approve.mutate()}>
              {approve.isPending ? "Approving…" : "Approve offering"}
            </button>
          </div>
        </div>
      ) : null}
      {status === "APPROVED" ? (
        <button className="admin-button primary" type="button" disabled={busy} onClick={() => open.mutate()}>{open.isPending ? "Opening…" : "Open initial offering"}</button>
      ) : null}
      {status === "OPEN" || status === "PARTIALLY_FILLED" ? (
        <div className="admin-button-row">
          <button className="admin-button secondary" type="button" disabled={busy} onClick={() => pause.mutate()}>{pause.isPending ? "Pausing…" : "Pause offering"}</button>
          <button className="admin-button danger" type="button" disabled={busy} onClick={() => cancel.mutate()}>{cancel.isPending ? "Cancelling…" : "Cancel offering"}</button>
        </div>
      ) : null}
    </section>
  );
}
function IssuanceTab({ item }: { item: Detail & { issuance: NonNullable<Detail["issuance"]> } }) {
  const services = useAppServices();
  const client = useQueryClient();
  const policy = item.issuance;
  const [units, setUnits] = useState(
    item.issuance.proposed?.units ?? item.issuance.policy.defaultUnits,
  );
  const [reason, setReason] = useState("");
  const propose = useMutation({
    mutationFn: () =>
      services.repositories.admin.proposeOwnershipSupply(item.id, {
        policyCode: item.issuance.policy.code,
        totalUnits: units,
        reason: reason.trim(),
      }),
    onSuccess: () => {
      setReason("");
      void client.invalidateQueries({ queryKey: ["admin", "collectible", item.id] });
    },
  });
  const approve = useMutation({
    mutationFn: () => services.repositories.admin.approveOwnershipSupply(item.id, reason.trim()),
    onSuccess: () => {
      setReason("");
      void client.invalidateQueries({ queryKey: ["admin", "collectible", item.id] });
    },
  });
  const issue = useMutation({
    mutationFn: () =>
      services.repositories.admin.issueOwnership(item.id, policy.proposed?.units ?? ""),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["admin", "collectible", item.id] }),
  });
  const canPropose = !policy.proposed || policy.status === "REJECTED";
  const canApprove = policy.status === "PROPOSED";
  const canIssue = policy.status === "APPROVED" && policy.readiness.ready && !policy.supply;
  return (
    <section className="admin-detail-card admin-detail-tab-panel">
      <div className="admin-card-heading">
        <div>
          <h3>Issuance policy</h3>
          <p className="admin-detail-muted">
            Configure supply before any ownership units or market activity exist.
          </p>
        </div>
        <span className={`admin-detail-status ${policy.status.toLowerCase()}`}>
          {sentence(policy.status)}
        </span>
      </div>
      <div className="admin-issuance-grid">
        <InfoCard title="Readiness">
          <Field
            label="Publication"
            value={
              policy.readiness.blockers.includes("CATALOGUE_NOT_PUBLISHED") ? "Blocked" : "Ready"
            }
          />
          <Field
            label="Valuation"
            value={
              policy.valuation
                ? money(policy.valuation.minor, policy.valuation.currency)
                : "Required"
            }
          />
          <Field label="Insurance" value={policy.insurance.active ? "Active" : "Required"} />
          <Field
            label="Custody"
            value={
              policy.readiness.blockers.includes("CUSTODY_NOT_SECURED") ? "Not secured" : "Secured"
            }
          />
          <Field
            label="Approval"
            value={
              policy.status === "APPROVED" || policy.status === "ISSUED" ? "Approved" : "Required"
            }
            accent
          />
        </InfoCard>
        <InfoCard title="Configured product policy">
          <Field label="Template" value={policy.policy.label} />
          <Field
            label="Allowed range"
            value={`${policy.policy.minimumUnits}–${policy.policy.maximumUnits} units`}
          />
          <Field label="Rounding" value="Floor; retain remainder" />
          <Field
            label="Supply"
            value={policy.supply ? `${policy.supply.totalUnits} units` : "Not issued"}
          />
        </InfoCard>
      </div>
      <div className="admin-issuance-preview">
        <div className="admin-card-heading">
          <h4>Price preview from authoritative valuation</h4>
          <span>{policy.valuation ? policy.valuation.currency : "No valuation"}</span>
        </div>
        <div className="admin-issuance-options">
          {policy.previews.map((preview) => (
            <button
              type="button"
              key={preview.units}
              className={units === preview.units ? "active" : ""}
              onClick={() => setUnits(preview.units)}
              disabled={!canPropose}
            >
              <strong>{preview.units} units</strong>
              <span>
                {formatPricePerUnit(
                  preview.pricePerUnitMinor,
                  preview.currency,
                  preview.remainderMinor,
                )}{" "}
                / slice
              </span>
              <small>
                {preview.remainderMinor === null
                  ? "Retained remainder unavailable"
                  : `${formatMinorAmount(preview.remainderMinor, preview.currency)} retained remainder`}
              </small>
            </button>
          ))}
        </div>
        {policy.proposed ? (
          <div className="admin-issuance-proposed">
            <strong>Proposed: {policy.proposed.units} units</strong>
            <span>
              {formatPricePerUnit(
                policy.proposed.pricePerUnitMinor,
                policy.proposed.valuationCurrency,
                policy.proposed.remainderMinor,
              )}{" "}
              per slice ·{" "}
              {formatMinorAmount(policy.proposed.remainderMinor, policy.proposed.valuationCurrency)}{" "}
              retained remainder
            </span>
          </div>
        ) : null}
      </div>
      {policy.readiness.blockers.length ? (
        <div className="admin-detail-callout">
          <strong>Blocked until ready:</strong>{" "}
          {policy.readiness.blockers.map(sentence).join(" · ")}
        </div>
      ) : null}
      {canPropose || canApprove ? (
        <div className="admin-issuance-form">
          <label>
            Decision note
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain why this supply is appropriate for the collectible."
            />
          </label>
          <div className="admin-issuance-form__actions">
            {canPropose ? (
              <button
                className="admin-button primary"
                type="button"
                disabled={!reason.trim() || propose.isPending}
                onClick={() => propose.mutate()}
              >
                {propose.isPending ? "Saving…" : `Propose ${units} units`}
              </button>
            ) : null}
            {canApprove ? (
              <button
                className="admin-button secondary"
                type="button"
                disabled={approve.isPending}
                onClick={() => approve.mutate()}
              >
                {approve.isPending ? "Approving…" : "Approve proposed supply"}
              </button>
            ) : null}
            {canIssue ? (
              <button
                className="admin-button primary"
                type="button"
                disabled={issue.isPending}
                onClick={() => issue.mutate()}
              >
                {issue.isPending ? "Issuing…" : `Issue ${policy.proposed?.units ?? ""} units`}
              </button>
            ) : null}
          </div>
          {propose.isError || approve.isError || issue.isError ? (
            <p className="admin-form-error">
              The issuance step could not be completed. Refresh and review the authoritative
              blocker.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="admin-detail-muted">
          {policy.supply
            ? `Ownership is issued: ${policy.supply.issuedUnits} units.`
            : "Supply is approved or not yet ready. Issuance remains a separate guarded operation."}
        </p>
      )}
    </section>
  );
}
function UnavailableEnrichment({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="admin-detail-card admin-detail-tab-panel">
      <div className="admin-card-heading">
        <h3>{title}</h3>
        <span className="admin-detail-status pending">Unavailable</span>
      </div>
      <p className="admin-empty-detail">{detail}</p>
    </section>
  );
}
function PhysicalTab({ item }: { item: Detail }) {
  return (
    <section className="admin-detail-card admin-detail-tab-panel">
      <div className="admin-card-heading">
        <h3>Physical record</h3>
        <span>Recorded evidence and custody</span>
      </div>
      <div className="admin-detail-card-grid admin-detail-card-grid--three">
        <InfoCard title="Submission">
          <Field
            label="Status"
            value={
              item.submissions[0] ? sentence(item.submissions[0].status) : "No linked submission"
            }
          />
          <Field
            label="Submitted"
            value={item.submissions[0]?.submittedAt ? date(item.submissions[0].submittedAt) : null}
          />
          <Field label="Reviewer" value={item.submissions[0]?.reviewer} />
        </InfoCard>
        <InfoCard title="Evidence">
          <MediaList item={item} />
        </InfoCard>
        <InfoCard title="Custody">
          <Field label="Status" value={sentence(item.custody.status)} accent />
          {item.custody.controlledBetaPhysicalBypass ? (
            <Field label="Beta QA exception" value="Applied · physical state unchanged" accent />
          ) : null}
          <Field
            label="Received"
            value={item.custody.receivedAt ? date(item.custody.receivedAt) : "Not recorded"}
          />
          <Field
            label="Secured"
            value={item.custody.securedAt ? date(item.custody.securedAt) : "Not recorded"}
          />
        </InfoCard>
      </div>
    </section>
  );
}
function ValuationTab({ item }: { item: Detail }) {
  return (
    <section className="admin-detail-card admin-detail-tab-panel">
      <div className="admin-card-heading">
        <h3>Valuation & external references</h3>
        <span>Amounts and sources kept separate</span>
      </div>
      <div className="admin-detail-card-grid admin-detail-card-grid--three">
        <InfoCard title="Slice supported value">
          <Field
            label="Value"
            value={
              item.valuation.current
                ? money(item.valuation.current.minor, item.valuation.current.currency)
                : "Not recorded"
            }
            accent
          />
          <Field
            label="Method"
            value={item.valuation.current ? valuationMethod(item.valuation.current.method) : null}
          />
          <Field label="Decision maker" value={item.valuation.current?.actor} />
        </InfoCard>
        <InfoCard title="External market reference">
          <Field
            label="Current asking"
            value={
              item.valuation.marketReference.currentListing
                ? money(
                    item.valuation.marketReference.currentListing.minor,
                    item.valuation.marketReference.currentListing.currency,
                  )
                : "Not observed"
            }
          />
          <Field label="Source" value={item.valuation.marketReference.currentListing?.source} />
          <Field
            label="Observed"
            value={
              item.valuation.marketReference.currentListing
                ? date(item.valuation.marketReference.currentListing.observedAt)
                : null
            }
          />
        </InfoCard>
        <InfoCard title="Decision history">
          {item.valuation.history.length ? (
            item.valuation.history.slice(0, 8).map((entry) => (
              <div className="admin-sale-row" key={entry.id}>
                <span>{date(entry.asOf)}</span>
                <strong>{money(entry.minor, entry.currency)}</strong>
                <small>
                  {valuationMethod(entry.method)} · {sentence(entry.status)}
                </small>
              </div>
            ))
          ) : (
            <p className="admin-empty-detail">No valuation decisions recorded.</p>
          )}
        </InfoCard>
      </div>
    </section>
  );
}
function OwnershipTab({ item }: { item: Detail }) {
  const holders = item.ownership.holders ?? [];
  const treasury = item.treasuryLiquidity;
  return (
    <div className="admin-detail-tab-panel admin-ownership-tab-stack">
      {treasury ? (
        <section className="admin-detail-card admin-treasury-liquidity">
          <div className="admin-card-heading">
            <div>
              <h3>Treasury liquidity</h3>
              <p className="admin-detail-muted">
                Authoritative inventory and public sell listings.
              </p>
            </div>
            <span className={`admin-detail-status ${treasury.marketStatus.toLowerCase()}`}>
              {sentence(treasury.marketStatus)}
            </span>
          </div>
          <div className="admin-treasury-metrics">
            <InfoCard title="Treasury inventory">
              <Field label="Settled units" value={treasury.settledUnits} />
              <Field label="Reserved" value={treasury.reservedUnits} />
              <Field label="Available to list" value={treasury.availableUnits} accent />
            </InfoCard>
            <InfoCard title="Public listings">
              <Field label="Active listings" value={treasury.openSellOrders} />
              <Field label="Public listed" value={`${treasury.listedUnits} units`} accent />
              <Field label="Partially filled" value={`${treasury.partiallyFilledUnits} units`} />
            </InfoCard>
          </div>
          <p className="admin-treasury-note">
            Available to list is Treasury inventory after reservations. Public listed is the portion
            currently visible to buyers.
          </p>
          {treasury.listings.length ? (
            <div className="admin-treasury-listings" aria-label="Active Treasury sell listings">
              {treasury.listings.map((listing) => (
                <div className="admin-treasury-listing" key={listing.id}>
                  <div>
                    <strong>Sell listing</strong>
                    <small>
                      {listing.originalUnits} original · {listing.filledUnits} filled ·{" "}
                      {listing.remainingUnits} remaining
                    </small>
                  </div>
                  <strong>
                    {money(listing.limitPriceMinor, item.valuation.current?.currency ?? "GBP")}
                  </strong>
                  <span>{sentence(listing.status)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
      <section className="admin-detail-card">
        <div className="admin-card-heading">
          <h3>Ownership breakdown</h3>
          <span>Authoritative settled positions</span>
        </div>
        <div className="admin-detail-card-grid admin-detail-card-grid--three">
          <InfoCard title="Supply">
            <Field label="Total units" value={item.ownership.totalUnits} />
            <Field label="Issued" value={item.ownership.issuedUnits} />
            <Field label="Available" value={item.ownership.availableUnits} />
            <Field label="Owners" value={item.ownership.ownerCount} />
          </InfoCard>
          <div className="admin-detail-card admin-detail-card--wide">
            <h4>Holders</h4>
            {holders.length ? (
              <div className="admin-holder-table">
                {holders.map((holder) => (
                  <div className="admin-holder-row" key={holder.accountId}>
                    <div>
                      <strong>{holder.displayName}</strong>
                      <small>
                        {holder.username
                          ? `@${holder.username}`
                          : holder.userId
                            ? "Verified account"
                            : "System treasury"}
                      </small>
                    </div>
                    <strong>
                      {holder.percentage === null ? "—" : `${holder.percentage.toFixed(2)}%`}
                    </strong>
                    <span>{holder.units} units</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="admin-empty-detail">No settled user positions are recorded.</p>
            )}
          </div>
        </div>
        <p className="admin-detail-muted">
          Ownership is read-only here. Changes must come from the ownership ledger and settlement
          workflow.
        </p>
      </section>
    </div>
  );
}
function MarketTab({ item }: { item: Detail }) {
  const services = useAppServices();
  const client = useQueryClient();
  const refresh = useMutation({
    mutationFn: () => services.repositories.admin.refreshMarketData(item.id),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["admin", "collectible", item.id] }),
  });
  const activate = useMutation({
    mutationFn: () => services.repositories.admin.activateTradingMarket(item.id),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["admin", "collectible", item.id] }),
  });
  return (
    <section className="admin-detail-card admin-detail-tab-panel">
      <div className="admin-card-heading">
        <h3>Market lifecycle</h3>
        <span>
          {item.marketLifecycle?.admin.internalState ??
            "Publication is not the same as tradeability"}
        </span>
      </div>
      <div className="admin-detail-card-grid admin-detail-card-grid--three">
        <InfoCard title="Publication">
          {item.marketLifecycle ? (
            <>
              <Field label="Public state" value={item.marketLifecycle.admin.publicState} accent />
              <Field label="Next action" value={item.marketLifecycle.admin.nextAction} />
              <Field label="Dependency" value={item.marketLifecycle.admin.blockingDependency} />
            </>
          ) : null}
          <Field label="Publication" value={sentence(item.market.publication)} accent />
          <Field label="Readiness" value={sentence(item.market.readiness.status)} />
          <Field
            label="Blocking items"
            value={item.market.readiness.blockingCodes.length || "None"}
          />
          <Field
            label="Trading market"
            value={item.market.trading ? sentence(item.market.trading.status) : "Not created"}
            accent
          />
          {!item.market.trading ? (
            <button
              className="admin-button primary"
              type="button"
              disabled={activate.isPending || item.issuance?.status !== "ISSUED"}
              onClick={() => activate.mutate()}
            >
              {activate.isPending ? "Activating…" : "Activate trading market"}
            </button>
          ) : null}
        </InfoCard>
        <InfoCard title="Market data">
          <div className="admin-market-refresh-row">
            <div>
              <strong>
                {item.market.reference ? "PriceCharting reference" : "Market reference"}
              </strong>
              <small>
                {item.market.reference
                  ? `${item.market.reference.externalId} · ${date(item.market.reference.observedAt)}`
                  : "No persisted provider observation"}
              </small>
            </div>
            <button
              className="admin-button secondary"
              type="button"
              disabled={refresh.isPending}
              onClick={() => refresh.mutate()}
            >
              {refresh.isPending ? "Queueing…" : "Refresh market data"}
            </button>
          </div>
          <Field
            label="Market reference"
            value={
              item.market.reference
                ? money(item.market.reference.minor, item.market.reference.currency)
                : "Not observed"
            }
          />
          <Field
            label="Next refresh"
            value={
              item.market.reference?.nextRefreshAt
                ? date(item.market.reference.nextRefreshAt)
              : null
            }
          />
          <Field label="Mapping status" value={item.market.reference?.status} />
          <Field
            label="Last successful refresh"
            value={item.market.reference?.lastSuccessAt ? date(item.market.reference.lastSuccessAt) : "Not recorded"}
          />
          <Field
            label="History points"
            value={item.market.reference ? String(item.market.reference.observationCount) : "0"}
          />
          <Field
            label="30D movement"
            value={
              item.market.reference?.movement30dBps === null || item.market.reference?.movement30dBps === undefined
                ? "Unavailable"
                : `${(item.market.reference.movement30dBps / 100).toFixed(2)}%`
            }
          />
          {item.market.reference?.lastFailureCode ? (
            <Field label="Last provider failure" value={item.market.reference.lastFailureCode} />
          ) : null}
          <Field
            label="Current asking"
            value={
              item.market.asking
                ? money(item.market.asking.minor, item.market.asking.currency)
                : "Not observed"
            }
          />
          <Field label="Completed sales" value={item.market.salesCount || "None recorded"} />
          <Field
            label="Last update"
            value={item.market.lastUpdated ? date(item.market.lastUpdated) : null}
          />
        </InfoCard>
        <InfoCard title="Recent completed sales">
          {item.recentSales.length ? (
            item.recentSales.slice(0, 5).map((sale) => (
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
      </div>
    </section>
  );
}
function MediaList({ item }: { item: Detail }) {
  return item.media.length ? (
    <div className="admin-media-list">
      {item.media.map((media) => (
        <div key={`${media.slot}-${media.filename}`}>
          <span>{sentence(media.slot)}</span>
          {media.url ? (
            <a href={media.url} target="_blank" rel="noreferrer">
              View approved media <ExternalLink aria-hidden="true" />
            </a>
          ) : (
            <small>{sentence(media.status)}</small>
          )}
        </div>
      ))}
    </div>
  ) : (
    <p className="admin-empty-detail">No approved media recorded.</p>
  );
}
function ActivityList({ item, expanded = false }: { item: Detail; expanded?: boolean }) {
  return item.activity.length ? (
    <div className="admin-activity-list">
      {item.activity.slice(0, expanded ? 50 : 5).map((event) => (
        <div className="admin-activity-row" key={event.id}>
          <strong>{sentence(event.action)}</strong>
          <small>
            {event.actor} · {date(event.occurredAt)}
          </small>
          {event.detail ? <span>{event.detail}</span> : null}
        </div>
      ))}
    </div>
  ) : (
    <p className="admin-empty-detail">No audit events recorded.</p>
  );
}
function Chip({ label: name, value }: { label: string; value: string }) {
  return (
    <div className="admin-detail-chip">
      <small>{name}</small>
      <strong>{value}</strong>
    </div>
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
        {value === null || value === undefined || value === "" ? "Not recorded" : String(value)}
      </strong>
    </div>
  );
}
function LinkButton({ href, children }: { href?: string; children: ReactNode }) {
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
  return value === "physical"
    ? "Physical"
    : value === "market"
      ? "Market"
      : value === "issuance"
      ? "Issuance"
      : value === "offering"
        ? "Offering"
        : value[0].toUpperCase() + value.slice(1);
}
function formatOfferingBps(value: number) {
  return `${(value / 100).toLocaleString("en-GB", { maximumFractionDigits: 2 })}%`;
}
function valuationMethod(value: string) {
  if (value === "ILLUSTRATIVE_STAGING_SHARE_BASIS") return "Illustrative valuation";
  if (value === "PRICE_GUIDE") return "Price guide reference";
  return sentence(value);
}
function date(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
function money(minor: string, currency: string) {
  return formatMinorAmount(minor, currency);
}
