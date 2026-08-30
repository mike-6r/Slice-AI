import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Image as ImageIcon,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import type {
  AdminCollectibleDetail as Detail,
  AssetOperationDetailProjection,
} from "@/data/repositories";
import { useAppServices } from "@/providers/AppServicesProvider";
import {
  isEconomicActivity,
  operationWorkspaceTabLabel,
  operationWorkspaceTabs,
  type OperationWorkspaceTab,
} from "./AdminAssetOperationsDetail.presentation";
import "@/styles/admin-operations.css";

const tabs = operationWorkspaceTabs;
type DetailTab = OperationWorkspaceTab;

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
    queryFn: () => services.repositories.admin.getCollectibleDetail(assetId, "operations"),
    staleTime: 20_000,
  });
  const readiness = useQuery({
    queryKey: ["admin", "asset-operations-readiness", assetId],
    queryFn: () => services.repositories.lifecycle.getReadiness(assetId),
    staleTime: 10_000,
  });
  const operations = useQuery({
    queryKey: ["admin", "asset-operations-projection", assetId],
    queryFn: () => services.repositories.lifecycle.getOperationDetail(assetId),
    staleTime: 10_000,
  });
  const [valuePounds, setValuePounds] = useState("");
  const [confidence, setConfidence] = useState("80");
  const [policyCode, setPolicyCode] = useState("");
  const [policyUnits, setPolicyUnits] = useState("");
  const [policyReason, setPolicyReason] = useState("");
  const [approvalReason, setApprovalReason] = useState("");
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["admin", "asset-operations-detail", assetId] });
    void client.invalidateQueries({ queryKey: ["admin", "asset-operations-readiness", assetId] });
    void client.invalidateQueries({ queryKey: ["admin", "asset-operations-projection", assetId] });
    void client.invalidateQueries({ queryKey: ["admin", "asset-operations"] });
  };
  const valuation = useMutation({
    mutationFn: () =>
      services.repositories.lifecycle.recordValuation(assetId, {
        valueMinor: poundsToMinor(valuePounds),
        confidence: Number(confidence),
        methodologyCode: "MANUAL_REVIEW",
        sourceType: "MANUAL",
      }),
    onSuccess: () => {
      setValuePounds("");
      refresh();
    },
  });
  const proposeSupply = useMutation({
    mutationFn: () =>
      services.repositories.admin.proposeOwnershipSupply(assetId, {
        policyCode,
        totalUnits: policyUnits,
        reason: policyReason,
      }),
    onSuccess: refresh,
  });
  const approveSupply = useMutation({
    mutationFn: () => services.repositories.admin.approveOwnershipSupply(assetId, approvalReason),
    onSuccess: refresh,
  });
  const issueSupply = useMutation({
    mutationFn: (units: string) => services.repositories.admin.issueOwnership(assetId, units),
    onSuccess: refresh,
  });
  const approveOffering = useMutation({
    mutationFn: (offeringId: string) =>
      services.repositories.admin.approveInitialOffering(offeringId, approvalReason),
    onSuccess: refresh,
  });
  const requestOfferingChanges = useMutation({
    mutationFn: (offeringId: string) =>
      services.repositories.admin.requestInitialOfferingChanges(offeringId, approvalReason),
    onSuccess: refresh,
  });
  const activateMarket = useMutation({
    mutationFn: () => services.repositories.admin.activateTradingMarket(assetId),
    onSuccess: refresh,
  });
  const openOffering = useMutation({
    mutationFn: (offeringId: string) => services.repositories.admin.openInitialOffering(offeringId),
    onSuccess: refresh,
  });
  const publish = useMutation({
    mutationFn: () => services.repositories.lifecycle.publish(assetId),
    onSuccess: refresh,
  });

  if (detail.isLoading)
    return (
      <OperationDetailState
        title="Loading asset operations"
        detail="Reading the authoritative asset record."
      />
    );
  if (detail.isError || !detail.data)
    return (
      <OperationDetailState
        title="Asset operations unavailable"
        detail="The authoritative asset record could not be loaded safely."
        retry={() => void detail.refetch()}
      />
    );
  const item = detail.data;
  const front = item.media.find((media) => media.slot.toLowerCase() === "front") ?? item.media[0];
  const currentPolicy = item.issuance?.proposed;
  const error = [
    valuation,
    proposeSupply,
    approveSupply,
    issueSupply,
    approveOffering,
    requestOfferingChanges,
    activateMarket,
    openOffering,
    publish,
  ].find((mutation) => mutation.isError);
  return (
    <main className="admin-asset-workspace">
      <button type="button" className="admin-back-button" onClick={onBack}>
        <ArrowLeft aria-hidden="true" /> Asset Operations
      </button>
      <header className="admin-asset-workspace__header">
        <div className="admin-asset-workspace__media">
          {front?.url ? <img src={front.url} alt={item.title} /> : <ImageIcon aria-hidden="true" />}
        </div>
        <div className="admin-asset-workspace__identity">
          <p className="admin-operations-breadcrumb">
            Asset Operations <span>›</span> Economic workspace
          </p>
          <h2>{item.title}</h2>
          <p>
            {[
              item.identity.year,
              item.identity.set,
              item.identity.cardNumber ? `#${item.identity.cardNumber}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Canonical identity not fully recorded"}
          </p>
          <div className="admin-asset-workspace__badges">
            <span>{item.publicId}</span>
            <span>
              {item.grading ? `${item.grading.company} ${item.grading.grade}` : "Ungraded"}
            </span>
            {item.grading?.certificationNumber ? (
              <span>Cert {item.grading.certificationNumber}</span>
            ) : null}
            <span>{workType(item)}</span>
          </div>
          <div className="admin-asset-workspace__facts">
            <Fact label="Collector" value={item.collector?.displayName ?? "Not recorded"} />
            <Fact
              label="Operation stage"
              value={operations.data ? sentence(operations.data.operations.stage) : "Unavailable"}
              accent
            />
            <Fact
              label="Market"
              value={marketLabel(item)}
              accent={item.market.publication === "PUBLISHED"}
            />
          </div>
        </div>
        <div className="admin-asset-workspace__links">
          <a href={`/admin?section=collectibles&asset=${encodeURIComponent(assetId)}`}>
            Open collectible <ExternalLink aria-hidden="true" />
          </a>
          {item.submissions[0] ? (
            <a
              href={`/admin?section=moderation&submission=${encodeURIComponent(item.submissions[0].id)}`}
            >
              Source submission <ExternalLink aria-hidden="true" />
            </a>
          ) : null}
          {item.intake ? (
            <a href={`/admin?section=intake&intake=${encodeURIComponent(item.intake.id)}`}>
              Physical intake <ExternalLink aria-hidden="true" />
            </a>
          ) : null}
          {item.collector ? (
            <a href={`/admin?section=users&user=${encodeURIComponent(item.collector.id)}`}>
              Collector account <ExternalLink aria-hidden="true" />
            </a>
          ) : null}
          {item.market.publication === "PUBLISHED" ? (
            <a href={`/asset/${item.slug}`} target="_blank" rel="noreferrer">
              Public record <ExternalLink aria-hidden="true" />
            </a>
          ) : null}
          <button type="button" onClick={refresh}>
            <RefreshCw aria-hidden="true" /> Refresh
          </button>
        </div>
      </header>
      <EconomicWorkflow operations={operations.data} selected={selected} onOpen={onTab} />
      <nav className="admin-operation-detail__tabs" aria-label="Economic operation sections">
        {tabs.map((value) => (
          <button
            type="button"
            key={value}
            className={selected === value ? "active" : ""}
            onClick={() => onTab(value)}
          >
            {operationWorkspaceTabLabel(value)}
          </button>
        ))}
      </nav>
      <div className="admin-asset-workspace__content">
        <div className="admin-asset-workspace__main">
          {selected === "overview" ? (
            <Overview item={item} operations={operations.data} onOpen={onTab} />
          ) : null}
          {selected === "valuation" ? (
            <Valuation
              item={item}
              valuePounds={valuePounds}
              confidence={confidence}
              setValuePounds={setValuePounds}
              setConfidence={setConfidence}
              submit={() => valuation.mutate()}
              pending={valuation.isPending}
            />
          ) : null}
          {selected === "ownership" ? (
            <Ownership
              item={item}
              operations={operations.data}
              policyCode={policyCode}
              policyUnits={policyUnits}
              policyReason={policyReason}
              approvalReason={approvalReason}
              setPolicyCode={setPolicyCode}
              setPolicyUnits={setPolicyUnits}
              setPolicyReason={setPolicyReason}
              setApprovalReason={setApprovalReason}
              policyOptions={item.issuance?.policy.candidates ?? []}
              propose={() => proposeSupply.mutate()}
              approve={() => approveSupply.mutate()}
              issue={(units) => issueSupply.mutate(units)}
              pending={proposeSupply.isPending || approveSupply.isPending || issueSupply.isPending}
            />
          ) : null}
          {selected === "initial-offering" ? (
            <InitialOffering
              item={item}
              approvalReason={approvalReason}
              setApprovalReason={setApprovalReason}
              approve={() =>
                item.initialOffering && approveOffering.mutate(item.initialOffering.offeringId)
              }
              requestChanges={() =>
                item.initialOffering &&
                requestOfferingChanges.mutate(item.initialOffering.offeringId)
              }
              pending={approveOffering.isPending || requestOfferingChanges.isPending}
            />
          ) : null}
          {selected === "launch" ? (
            <Launch
              item={item}
              operations={operations.data}
              publish={() => publish.mutate()}
              issue={() => currentPolicy && issueSupply.mutate(currentPolicy.units)}
              activate={() => activateMarket.mutate()}
              open={() =>
                item.initialOffering && openOffering.mutate(item.initialOffering.offeringId)
              }
              pending={
                publish.isPending ||
                issueSupply.isPending ||
                activateMarket.isPending ||
                openOffering.isPending
              }
            />
          ) : null}
          {selected === "market" ? <Market item={item} /> : null}
          {selected === "controls" ? <Controls item={item} /> : null}
          {selected === "history" ? <History item={item} /> : null}
        </div>
        <OperationsRail item={item} operations={operations.data} onOpen={onTab} />
      </div>
      {error ? (
        <p className="admin-operation-error" role="alert">
          The server rejected that operation. No local state was changed; refresh the record before
          retrying.
        </p>
      ) : null}
    </main>
  );
}

function Overview({
  item,
  operations,
  onOpen,
}: {
  item: Detail;
  operations?: AssetOperationDetailProjection;
  onOpen: (tab: string) => void;
}) {
  const action = operations?.operations.nextAction;
  const actionTab = action ? targetTab(action.target) : "overview";
  return (
    <div className="admin-asset-workspace__grid">
      <section className="admin-operation-card admin-operation-card--wide">
        <CardHeading
          eyebrow="Current operations stage"
          title={
            operations ? sentence(operations.operations.stage) : "Operations status unavailable"
          }
          status={action?.actor === "NONE" ? "No action required" : "Action required"}
          ready={action?.actor === "NONE"}
        />
        <p className="admin-detail-muted">
          {action
            ? `${action.label}. Next actor: ${sentence(action.actor)}.`
            : "The server-side operations projection is currently unavailable."}
        </p>
        {operations?.operations.blockers.length ? (
          <ul className="admin-blocker-list">
            {operations.operations.blockers.map((blocker) => (
              <li key={blocker}>{sentence(blocker)}</li>
            ))}
          </ul>
        ) : null}
        <button
          type="button"
          className="admin-ops-button primary"
          disabled={!action || action.actor === "NONE"}
          onClick={() => {
            if (action?.target === "INTAKE" && item.intake) {
              window.location.assign(
                `/admin?section=intake&intake=${encodeURIComponent(item.intake.id)}`,
              );
              return;
            }
            onOpen(actionTab);
          }}
        >
          {action?.label ?? "Refresh operations"} <ArrowRight aria-hidden="true" />
        </button>
      </section>
      <Info title="Physical prerequisite" eyebrow="Read only">
        <Field
          label="Verification"
          value={
            operations
              ? sentence(operations.physicalPrerequisites.verification)
              : sentence(item.verification.status)
          }
        />
        <Field
          label="Custody"
          value={
            operations
              ? sentence(operations.physicalPrerequisites.custody)
              : sentence(item.custody.status)
          }
        />
        <Field
          label="Physical exceptions"
          value={operations?.physicalPrerequisites.complete ? "None" : "See blockers"}
        />
        <Field
          label="Location"
          value={
            operations?.physicalPrerequisites.location ?? item.custody.location ?? "Not recorded"
          }
        />
      </Info>
      <Info title="Economic snapshot" eyebrow="Authoritative">
        <Field
          label="Valuation"
          value={
            item.valuation.current
              ? money(item.valuation.current.minor, item.valuation.current.currency)
              : "Not recorded"
          }
          accent
        />
        <Field
          label="Ownership"
          value={
            item.issuance?.supply
              ? `${item.issuance.supply.issuedUnits} / ${item.issuance.supply.totalUnits} issued`
              : "Not configured"
          }
        />
        <Field
          label="Offering"
          value={item.initialOffering ? sentence(item.initialOffering.status) : "Not created"}
        />
        <Field
          label="Price per Slice"
          value={
            item.initialOffering
              ? money(item.initialOffering.pricePerUnitMinor, item.initialOffering.currency)
              : "Not configured"
          }
        />
      </Info>
      <Info title="Launch readiness" eyebrow="Server gates">
        <Field
          label="Publication"
          value={operations ? sentence(operations.launchReadiness.state) : "Unavailable"}
          accent={operations?.launchReadiness.state === "READY"}
        />
        <Field
          label="Market state"
          value={
            item.market.publication === "PUBLISHED"
              ? "Market live"
              : item.market.trading
                ? sentence(item.market.trading.status)
                : "Not configured"
          }
        />
        <Field
          label="Restrictions"
          value={
            item.dossier.restrictions.length
              ? `${item.dossier.restrictions.length} active`
              : "None recorded"
          }
        />
      </Info>
      <Info title="Economic reconciliation" eyebrow="Read only">
        <Field
          label="Expected ownership"
          value={operations?.reconciliation.ownership.expectedUnits ?? "Not issued"}
        />
        <Field
          label="Allocated ownership"
          value={operations?.reconciliation.ownership.allocatedUnits ?? "Not issued"}
        />
        <Field
          label="Ownership difference"
          value={operations?.reconciliation.ownership.differenceUnits ?? "Not available"}
        />
        <Field
          label="Offering proceeds"
          value={
            item.initialOffering
              ? money(
                  item.initialOffering.proceeds.availableMinor,
                  item.initialOffering.proceeds.currency,
                )
              : "Not applicable"
          }
        />
        <Field
          label="Inventory"
          value={
            item.initialOffering?.inventory
              ? `${item.initialOffering.inventory.availableUnits} available`
              : "Not created"
          }
        />
      </Info>
      <Info title="Recent economics" eyebrow="Meaningful activity">
        <ActivityPreview item={item} />
      </Info>
    </div>
  );
}

function EconomicWorkflow({
  operations,
  selected,
  onOpen,
}: {
  operations?: AssetOperationDetailProjection;
  selected: DetailTab;
  onOpen: (tab: string) => void;
}) {
  const tabFor = (key: AssetOperationDetailProjection["economicWorkflow"][number]["key"]) =>
    key === "INITIAL_OFFERING" ? "initial-offering" : key.toLowerCase();
  if (!operations)
    return (
      <section className="admin-economic-workflow admin-economic-workflow--unavailable">
        <span>Economic workflow unavailable</span>
        <p>Refresh to retrieve the authoritative operations projection.</p>
      </section>
    );
  return (
    <section className="admin-economic-workflow" aria-label="Economic workflow">
      <div className="admin-economic-workflow__intro">
        <span>Economic workflow</span>
        <p>Backend-authoritative progression</p>
      </div>
      <div className="admin-economic-workflow__steps">
        {operations.economicWorkflow.map((step, index) => {
          const tab = tabFor(step.key);
          return (
            <button
              type="button"
              key={step.key}
              className={`${step.state.toLowerCase()} ${selected === tab ? "active" : ""}`}
              onClick={() => onOpen(tab)}
            >
              <span className="admin-economic-workflow__index">{index + 1}</span>
              <span>
                <strong>{step.label}</strong>
                <small>{workflowState(step.state)}</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function OperationsRail({
  item,
  operations,
  onOpen,
}: {
  item: Detail;
  operations?: AssetOperationDetailProjection;
  onOpen: (tab: string) => void;
}) {
  const action = operations?.operations.nextAction;
  const blocked = operations?.operations.blockers ?? [];
  const commands = operations
    ? [
        operations.availableCommands.recordValuation && ["Record valuation", "valuation"],
        operations.availableCommands.configureOwnership && ["Configure ownership", "ownership"],
        operations.availableCommands.reviewOffering && [
          "Review Initial Offering",
          "initial-offering",
        ],
        operations.availableCommands.issueOwnership && ["Issue ownership", "launch"],
        operations.availableCommands.publish && ["Review launch", "launch"],
        operations.availableCommands.openOffering && ["Open Initial Offering", "launch"],
        operations.availableCommands.activateMarket && ["Activate market", "launch"],
      ].filter((command): command is [string, string] => Boolean(command))
    : [];
  return (
    <aside className="admin-operations-rail" aria-label="Asset operation controls">
      <Rail title="Next action" tone={action?.actor === "NONE" ? "ready" : "attention"}>
        <strong>{action?.label ?? "Unavailable"}</strong>
        <p>
          {action
            ? action.actor === "NONE"
              ? "This asset has no pending economic action."
              : `Next actor: ${sentence(action.actor)}.`
            : "The authoritative next action could not be loaded."}
        </p>
        {action && action.actor !== "NONE" ? (
          <button
            type="button"
            className="admin-ops-button primary"
            onClick={() => {
              if (action.target === "INTAKE" && item.intake) {
                window.location.assign(
                  `/admin?section=intake&intake=${encodeURIComponent(item.intake.id)}`,
                );
                return;
              }
              onOpen(targetTab(action.target));
            }}
          >
            Review action <ArrowRight aria-hidden="true" />
          </button>
        ) : null}
      </Rail>
      <Rail title="Blockers">
        {blocked.length ? (
          <ul className="admin-operations-rail__list">
            {blocked.map((blocker) => (
              <li key={blocker}>{sentence(blocker)}</li>
            ))}
          </ul>
        ) : (
          <p>No active operational blocker.</p>
        )}
      </Rail>
      <Rail title="Available commands">
        {commands.length ? (
          <div className="admin-operations-rail__commands">
            {commands.map(([label, tab]) => (
              <button type="button" key={label} onClick={() => onOpen(tab)}>
                {label} <ArrowRight aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : (
          <p>No additional server-authorized command is available.</p>
        )}
      </Rail>
      <Rail title="Quick links">
        <div className="admin-operations-rail__commands">
          <a href={`/admin?section=collectibles&asset=${encodeURIComponent(item.id)}`}>
            Open collectible <ExternalLink aria-hidden="true" />
          </a>
          {item.intake ? (
            <a href={`/admin?section=intake&intake=${encodeURIComponent(item.intake.id)}`}>
              Open Physical Intake <ExternalLink aria-hidden="true" />
            </a>
          ) : null}
          {item.submissions[0] ? (
            <a
              href={`/admin?section=moderation&submission=${encodeURIComponent(item.submissions[0].id)}`}
            >
              View submission <ExternalLink aria-hidden="true" />
            </a>
          ) : null}
          {item.collector ? (
            <a href={`/admin?section=users&user=${encodeURIComponent(item.collector.id)}`}>
              View collector <ExternalLink aria-hidden="true" />
            </a>
          ) : null}
        </div>
      </Rail>
    </aside>
  );
}

function Rail({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: "ready" | "attention";
  children: ReactNode;
}) {
  return (
    <section className={`admin-operations-rail__section ${tone ?? ""}`}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Valuation({
  item,
  valuePounds,
  confidence,
  setValuePounds,
  setConfidence,
  submit,
  pending,
}: {
  item: Detail;
  valuePounds: string;
  confidence: string;
  setValuePounds: (value: string) => void;
  setConfidence: (value: string) => void;
  submit: () => void;
  pending: boolean;
}) {
  return (
    <div className="admin-asset-workspace__grid">
      <Info title="Current valuation" eyebrow="Staff authority">
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
          value={item.valuation.current ? sentence(item.valuation.current.method) : "Not recorded"}
        />
        <Field
          label="As of"
          value={item.valuation.current ? dateTime(item.valuation.current.asOf) : "Not recorded"}
        />
        <Field label="Decision maker" value={item.valuation.current?.actor ?? "Not recorded"} />
      </Info>
      <section className="admin-operation-card admin-operation-card--wide">
        <CardHeading eyebrow="Valuation authority" title="Record staff valuation" />
        <p className="admin-detail-muted">
          This creates a real GBP staff decision. Market references remain evidence; no
          exchange-rate conversion is performed here.
        </p>
        <div className="admin-custody-fields">
          <label>
            Valuation (GBP)
            <input
              value={valuePounds}
              inputMode="decimal"
              onChange={(event) => setValuePounds(event.target.value)}
              placeholder="e.g. 185.00"
            />
          </label>
          <label>
            Confidence (0–100)
            <input
              value={confidence}
              inputMode="numeric"
              onChange={(event) => setConfidence(event.target.value)}
            />
          </label>
        </div>
        <button
          type="button"
          className="admin-ops-button primary"
          disabled={
            !isValidPounds(valuePounds) ||
            !/^\d+$/.test(confidence) ||
            Number(confidence) > 100 ||
            pending
          }
          onClick={submit}
        >
          Record valuation <ArrowRight aria-hidden="true" />
        </button>
      </section>
      <Info title="Market reference" eyebrow="Advisory only">
        <Field
          label="Current listing"
          value={
            item.valuation.marketReference.currentListing
              ? money(
                  item.valuation.marketReference.currentListing.minor,
                  item.valuation.marketReference.currentListing.currency,
                )
              : "Not recorded"
          }
        />
        <Field
          label="Recent sale"
          value={
            item.valuation.marketReference.recentSale
              ? money(
                  item.valuation.marketReference.recentSale.minor,
                  item.valuation.marketReference.recentSale.currency,
                )
              : "Not recorded"
          }
        />
        <Field
          label="Reference source"
          value={
            item.valuation.marketReference.recentSale?.source ??
            item.valuation.marketReference.currentListing?.source ??
            "Not recorded"
          }
        />
      </Info>
      <section className="admin-operation-card admin-operation-card--wide">
        <CardHeading eyebrow="Audit trail" title="Valuation history" />
        <HistoryRows
          events={item.valuation.history.map((entry) => ({
            id: entry.id,
            action: `${sentence(entry.status)} valuation`,
            actor: sentence(entry.method),
            detail: money(entry.minor, entry.currency),
            occurredAt: entry.asOf,
          }))}
          empty="No valuation decisions recorded."
        />
      </section>
    </div>
  );
}

function Ownership({
  item,
  operations,
  policyCode,
  policyUnits,
  policyReason,
  approvalReason,
  setPolicyCode,
  setPolicyUnits,
  setPolicyReason,
  setApprovalReason,
  policyOptions,
  propose,
  approve,
  issue,
  pending,
}: {
  item: Detail;
  operations?: AssetOperationDetailProjection;
  policyCode: string;
  policyUnits: string;
  policyReason: string;
  approvalReason: string;
  setPolicyCode: (value: string) => void;
  setPolicyUnits: (value: string) => void;
  setPolicyReason: (value: string) => void;
  setApprovalReason: (value: string) => void;
  policyOptions: string[];
  propose: () => void;
  approve: () => void;
  issue: (units: string) => void;
  pending: boolean;
}) {
  const proposed = item.issuance?.proposed;
  const supply = item.issuance?.supply;
  return (
    <div className="admin-asset-workspace__grid">
      <Info title="Ownership state" eyebrow="Authoritative ledger">
        <Field
          label="Supply policy"
          value={proposed ? sentence(proposed.status) : "Not configured"}
          accent={proposed?.status === "APPROVED"}
        />
        <Field
          label="Issued supply"
          value={supply ? `${supply.issuedUnits} of ${supply.totalUnits}` : "Not issued"}
        />
        <Field label="Owners" value={item.ownership.ownerCount ?? "Not issued"} />
        <Field label="Available units" value={item.ownership.availableUnits ?? "Not issued"} />
      </Info>
      <section className="admin-operation-card">
        <CardHeading eyebrow="Allocation" title="Ownership reconciliation" />
        <Field
          label="Expected units"
          value={operations?.reconciliation.ownership.expectedUnits ?? "Not issued"}
        />
        <Field
          label="Allocated units"
          value={operations?.reconciliation.ownership.allocatedUnits ?? "Not issued"}
        />
        <Field
          label="Difference"
          value={operations?.reconciliation.ownership.differenceUnits ?? "Not available"}
        />
        {item.initialOffering ? (
          <>
            <Field
              label="Collector retained"
              value={`${item.initialOffering.retainedUnits} (${percent(item.initialOffering.retainedPercentageBps)})`}
            />
            <Field
              label="Initial Offering inventory"
              value={`${item.initialOffering.offeredUnits} (${percent(item.initialOffering.offeredPercentageBps)})`}
            />
          </>
        ) : (
          <p className="admin-detail-muted">
            The current authority allocates issued units when an approved Initial Offering opens. No
            independent allocation draft exists.
          </p>
        )}
      </section>
      {!proposed ? (
        <section className="admin-operation-card admin-operation-card--wide">
          <CardHeading eyebrow="Supply policy" title="Propose ownership supply" />
          <p className="admin-detail-muted">
            The policy locks the unit count and price derived from the active valuation. It does not
            allocate holdings or issue ownership.
          </p>
          <div className="admin-custody-fields">
            <label>
              Policy
              <select value={policyCode} onChange={(event) => setPolicyCode(event.target.value)}>
                <option value="">Select policy</option>
                {policyOptions.map((code) => (
                  <option key={code} value={code}>
                    {sentence(code)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Total units
              <input
                value={policyUnits}
                inputMode="numeric"
                onChange={(event) => setPolicyUnits(event.target.value)}
                placeholder={item.issuance?.policy.defaultUnits ?? "Units"}
              />
            </label>
          </div>
          <label className="admin-form-field">
            Reason
            <textarea
              value={policyReason}
              onChange={(event) => setPolicyReason(event.target.value)}
              placeholder="Authoritative rationale (12–280 characters)"
            />
          </label>
          <button
            type="button"
            className="admin-ops-button primary"
            disabled={
              !policyCode ||
              !/^\d+$/.test(policyUnits) ||
              policyReason.trim().length < 12 ||
              pending
            }
            onClick={propose}
          >
            Propose supply policy <ArrowRight aria-hidden="true" />
          </button>
        </section>
      ) : (
        <section className="admin-operation-card admin-operation-card--wide">
          <CardHeading
            eyebrow="Supply policy"
            title="Proposed terms"
            status={sentence(proposed.status)}
            ready={proposed.status === "APPROVED"}
          />
          <div className="admin-operation-fact-grid">
            <Fact label="Units" value={proposed.units} />
            <Fact
              label="Unit price"
              value={money(proposed.pricePerUnitMinor, proposed.valuationCurrency)}
            />
            <Fact
              label="Whole value"
              value={money(proposed.valuationMinor, proposed.valuationCurrency)}
            />
            <Fact label="Policy" value={sentence(proposed.policyCode)} />
          </div>
          {proposed.status !== "APPROVED" ? (
            <>
              <label className="admin-form-field">
                Approval reason
                <textarea
                  value={approvalReason}
                  onChange={(event) => setApprovalReason(event.target.value)}
                  placeholder="Authoritative approval rationale (12–280 characters)"
                />
              </label>
              <button
                type="button"
                className="admin-ops-button primary"
                disabled={approvalReason.trim().length < 12 || pending}
                onClick={approve}
              >
                Approve supply policy <ArrowRight aria-hidden="true" />
              </button>
            </>
          ) : (
            <p className="admin-detail-callout">
              <ShieldCheck aria-hidden="true" /> Approved policy is immutable. Ownership issuance
              remains a separate deliberate action after the offering is approved.
            </p>
          )}
        </section>
      )}
      <section className="admin-operation-card admin-operation-card--wide">
        <CardHeading eyebrow="Positions" title="Issued ownership" />
        <p className="admin-detail-muted">
          Ownership is only issued from the approved policy; Initial Offering allocation occurs when
          an approved offering is opened.
        </p>
        {supply ? (
          <OwnershipHolders item={item} />
        ) : (
          <button
            type="button"
            className="admin-ops-button secondary"
            disabled={proposed?.status !== "APPROVED" || pending}
            onClick={() => proposed && issue(proposed.units)}
          >
            Issue {proposed?.units ?? ""} units <ArrowRight aria-hidden="true" />
          </button>
        )}
      </section>
    </div>
  );
}

function InitialOffering({
  item,
  approvalReason,
  setApprovalReason,
  approve,
  requestChanges,
  pending,
}: {
  item: Detail;
  approvalReason: string;
  setApprovalReason: (value: string) => void;
  approve: () => void;
  requestChanges: () => void;
  pending: boolean;
}) {
  const offering = item.initialOffering;
  if (!offering)
    return (
      <section className="admin-operation-card">
        <CardHeading eyebrow="Collector action" title="No Initial Offering created" />
        <p className="admin-detail-muted">
          A collector creates terms only after the asset is published, custody/insurance gates are
          satisfied, and an approved supply policy and valuation exist. Staff cannot fabricate
          collector terms from this workspace.
        </p>
      </section>
    );
  const approved =
    offering.status === "APPROVED" || offering.status === "OPEN" || offering.status === "PAUSED";
  return (
    <div className="admin-asset-workspace__grid">
      <section className="admin-operation-card admin-operation-card--wide">
        <CardHeading
          eyebrow="Initial Offering"
          title={sentence(offering.status)}
          status={sentence(offering.status)}
          ready={approved}
        />
        <div className="admin-operation-fact-grid">
          <Fact label="Total slices" value={offering.totalUnits} />
          <Fact
            label="Collector retained"
            value={`${offering.retainedUnits} (${percent(offering.retainedPercentageBps)})`}
          />
          <Fact
            label="Offered"
            value={`${offering.offeredUnits} (${percent(offering.offeredPercentageBps)})`}
          />
          <Fact
            label="Price / Slice"
            value={money(offering.pricePerUnitMinor, offering.currency)}
          />
          <Fact
            label="Gross offering"
            value={money(offering.grossOfferingMinor, offering.currency)}
          />
          <Fact
            label="Fee"
            value={`${money(offering.feeMinor, offering.currency)} (${percent(offering.feeBps)})`}
          />
          <Fact
            label="Collector proceeds"
            value={money(offering.netOfferingMinor, offering.currency)}
          />
          <Fact label="Fee schedule" value={offering.feeScheduleVersion} />
        </div>
      </section>
      <Info title="Offering gates" eyebrow="Server authority">
        <Field label="Valuation" value={offering.valuation ? "Ready" : "Blocked"} />
        <Field label="Custody" value={offering.readiness.custody ? "Ready" : "Blocked"} />
        <Field label="Insurance" value={offering.readiness.insurance ? "Ready" : "Blocked"} />
        <Field label="Publication" value={offering.readiness.publication ? "Ready" : "Blocked"} />
        <Field label="Market" value={offering.readiness.market ? "Ready" : "Blocked"} />
      </Info>
      <Info title="Inventory & proceeds" eyebrow="Financial authority">
        <Field
          label="Available inventory"
          value={offering.inventory?.availableUnits ?? "Not created"}
        />
        <Field label="Reserved" value={offering.inventory?.reservedUnits ?? "Not created"} />
        <Field
          label="Posted proceeds"
          value={money(offering.proceeds.postedMinor, offering.proceeds.currency)}
        />
        <Field
          label="Available proceeds"
          value={money(offering.proceeds.availableMinor, offering.proceeds.currency)}
        />
      </Info>
      <section className="admin-operation-card admin-operation-card--wide">
        <CardHeading eyebrow="Preview only" title="Public Initial Offering preview" />
        <p className="admin-detail-muted">
          This is a read-only rendering of the authoritative terms. It does not publish, open, or
          alter the offering.
        </p>
        <div className="admin-operation-fact-grid">
          <Fact label="Collectible" value={item.title} />
          <Fact
            label="Valuation"
            value={
              offering.valuation
                ? money(offering.valuation.minor, offering.valuation.currency)
                : "Not recorded"
            }
          />
          <Fact
            label="Available Slices"
            value={offering.inventory?.availableUnits ?? offering.offeredUnits}
          />
          <Fact
            label="Price per Slice"
            value={money(offering.pricePerUnitMinor, offering.currency)}
          />
          <Fact label="Offered" value={percent(offering.offeredPercentageBps)} />
          <Fact label="Collector retained" value={percent(offering.retainedPercentageBps)} />
          <Fact label="Status" value={sentence(offering.status)} />
        </div>
      </section>
      {offering.status === "AWAITING_APPROVAL" || offering.status === "CHANGES_REQUESTED" ? (
        <section className="admin-operation-card admin-operation-card--wide">
          <CardHeading eyebrow="Staff decision" title="Review Initial Offering" />
          <label className="admin-form-field">
            Decision reason
            <textarea
              value={approvalReason}
              onChange={(event) => setApprovalReason(event.target.value)}
              placeholder="Decision rationale (12–280 characters)"
            />
          </label>
          <div className="admin-action-list">
            <button
              type="button"
              className="admin-ops-button primary"
              disabled={approvalReason.trim().length < 12 || pending}
              onClick={approve}
            >
              Approve terms <CheckCircle2 aria-hidden="true" />
            </button>
            <button
              type="button"
              className="admin-ops-button secondary"
              disabled={approvalReason.trim().length < 12 || pending}
              onClick={requestChanges}
            >
              Request changes <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Launch({
  item,
  operations,
  publish,
  issue,
  activate,
  open,
  pending,
}: {
  item: Detail;
  operations?: AssetOperationDetailProjection;
  publish: () => void;
  issue: () => void;
  activate: () => void;
  open: () => void;
  pending: boolean;
}) {
  const offering = item.initialOffering;
  const issued = Boolean(
    item.issuance?.supply && item.issuance.supply.issuedUnits === item.issuance.supply.totalUnits,
  );
  const marketOpen = item.market.trading?.status === "OPEN" && item.market.trading.tradingEnabled;
  return (
    <div className="admin-asset-workspace__grid">
      <section className="admin-operation-card admin-operation-card--wide">
        <CardHeading eyebrow="Controlled launch" title="Authoritative launch sequence" />
        <p className="admin-detail-muted">
          Each command below is validated, audited, and idempotent. Physical intake remains
          read-only in Asset Operations.
        </p>
        <div className="admin-launch-steps">
          <LaunchStep
            label="Publish canonical asset"
            state={
              item.market.publication === "PUBLISHED"
                ? "complete"
                : operations?.availableCommands.publish
                  ? "ready"
                  : "blocked"
            }
            detail={
              item.market.publication === "PUBLISHED"
                ? "Published"
                : operations?.launchReadiness.blockers.length
                  ? operations.launchReadiness.blockers.map(sentence).join(" · ")
                  : "Server readiness unavailable"
            }
            action={publish}
            disabled={
              item.market.publication === "PUBLISHED" ||
              !operations?.availableCommands.publish ||
              pending
            }
            actionLabel="Publish asset"
          />
          <LaunchStep
            label="Approve Initial Offering"
            state={
              offering?.status === "APPROVED" || offering?.status === "OPEN"
                ? "complete"
                : "blocked"
            }
            detail={offering ? sentence(offering.status) : "Collector terms not created"}
          />
          <LaunchStep
            label="Issue ownership"
            state={issued ? "complete" : "blocked"}
            detail={
              issued
                ? `${item.issuance?.supply?.issuedUnits} units issued`
                : "Approved policy and offering required"
            }
            action={issue}
            disabled={!operations?.availableCommands.issueOwnership || pending}
            actionLabel="Issue ownership"
          />
          <LaunchStep
            label="Activate trading market"
            state={marketOpen ? "complete" : "blocked"}
            detail={marketOpen ? "Trading enabled" : "Ownership must be issued"}
            action={activate}
            disabled={!operations?.availableCommands.activateMarket || marketOpen || pending}
            actionLabel="Activate market"
          />
          <LaunchStep
            label="Open Initial Offering"
            state={offering?.status === "OPEN" ? "complete" : "blocked"}
            detail={
              offering?.status === "OPEN"
                ? "Live for investors"
                : "Ownership and market must be ready"
            }
            action={open}
            disabled={!operations?.availableCommands.openOffering || pending}
            actionLabel="Open offering"
          />
        </div>
      </section>
      <Info title="Launch reconciliation" eyebrow="Read only">
        <Field label="Publication" value={sentence(item.market.publication)} />
        <Field label="Offering" value={offering ? sentence(offering.status) : "Not created"} />
        <Field label="Ownership" value={issued ? "Issued" : "Not issued"} />
        <Field label="Trading" value={marketOpen ? "Open" : "Not open"} />
      </Info>
    </div>
  );
}

function Market({ item }: { item: Detail }) {
  const offering = item.initialOffering;
  const inventory = offering?.inventory;
  const sold = inventory ? BigInt(inventory.settledUnits) : null;
  const offered = inventory ? BigInt(inventory.offeredUnits) : null;
  const soldPercent =
    sold !== null && offered && offered > 0n ? Number((sold * 10_000n) / offered) : null;
  return (
    <div className="admin-asset-workspace__grid">
      <Info title="Market authority" eyebrow="Publication & trading">
        <Field
          label="Publication"
          value={sentence(item.market.publication)}
          accent={item.market.publication === "PUBLISHED"}
        />
        <Field
          label="Trading market"
          value={item.market.trading ? sentence(item.market.trading.status) : "Not configured"}
        />
        <Field label="Trading enabled" value={item.market.trading?.tradingEnabled ? "Yes" : "No"} />
        <Field label="Market readiness" value={sentence(item.market.readiness.status)} />
      </Info>
      <Info title="Market data" eyebrow="Reference only">
        <Field
          label="Floor"
          value={
            item.market.floor
              ? money(item.market.floor.minor, item.market.floor.currency)
              : "Not recorded"
          }
        />
        <Field
          label="Asking"
          value={
            item.market.asking
              ? money(item.market.asking.minor, item.market.asking.currency)
              : "Not recorded"
          }
        />
        <Field
          label="Recent sale average"
          value={
            item.market.salesAverage
              ? money(item.market.salesAverage.minor, item.market.salesAverage.currency)
              : "Not recorded"
          }
        />
        <Field label="Sales observed" value={item.market.salesCount} />
      </Info>
      <section className="admin-operation-card">
        <CardHeading
          eyebrow="Initial Offering progress"
          title={offering ? sentence(offering.status) : "Not created"}
        />
        {offering ? (
          <>
            <Field label="Units offered" value={offering.offeredUnits} />
            <Field label="Units sold" value={sold?.toString() ?? "Not available"} />
            <Field label="Units remaining" value={inventory?.availableUnits ?? "Not available"} />
            <Field
              label="Percentage sold"
              value={soldPercent === null ? "Not available" : percent(soldPercent)}
            />
            <Field
              label="Gross offering"
              value={money(offering.grossOfferingMinor, offering.currency)}
            />
            <Field
              label="Collector proceeds"
              value={money(offering.netOfferingMinor, offering.currency)}
            />
          </>
        ) : (
          <p className="admin-detail-muted">
            No authoritative Initial Offering exists for this asset.
          </p>
        )}
      </section>
      <section className="admin-operation-card admin-operation-card--wide">
        <CardHeading eyebrow="Restrictions" title="Market eligibility" />
        <p className="admin-detail-muted">
          {item.market.readiness.blockingCodes.length
            ? "Publication and market actions remain blocked by the server-side gates below."
            : "No active market-readiness blocker is recorded."}
        </p>
        {item.market.readiness.blockingCodes.length ? (
          <ul className="admin-blocker-list">
            {item.market.readiness.blockingCodes.map((blocker) => (
              <li key={blocker}>{sentence(blocker)}</li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
function Controls({ item }: { item: Detail }) {
  return (
    <div className="admin-asset-workspace__grid">
      <section className="admin-operation-card admin-operation-card--wide">
        <CardHeading eyebrow="Restrictions & controls" title="Authoritative restrictions" />
        {item.dossier.restrictions.length ? (
          <div className="admin-history-list">
            {item.dossier.restrictions.map((restriction, index) => (
              <div key={`${restriction.source}-${restriction.createdAt}-${index}`}>
                <span>{dateTime(restriction.createdAt)}</span>
                <strong>{sentence(restriction.status)}</strong>
                <p>{restriction.reason}</p>
                <small>{sentence(restriction.source)}</small>
              </div>
            ))}
          </div>
        ) : (
          <p className="admin-detail-muted">
            No active restriction or conflict is recorded for this asset.
          </p>
        )}
      </section>
      <Info title="Physical authority" eyebrow="Read only">
        <Field label="Physical state" value={item.dossier.snapshot.physical} />
        <Field label="Verification" value={item.dossier.snapshot.verification} />
        <Field label="Custody" value={item.dossier.snapshot.custody} />
        <Field label="Why read-only" value="Physical actions belong to Physical Intake" />
      </Info>
      <Info title="Guardrails" eyebrow="Workflow boundaries">
        <Field label="Ownership issue" value="Policy + offering approval required" />
        <Field label="Offering launch" value="Issued ownership + open market required" />
        <Field label="Publication" value="Server readiness required" />
        <Field label="Audit" value="All staff writes are audited" />
      </Info>
    </div>
  );
}
function History({ item }: { item: Detail }) {
  const events = item.activity.filter(isEconomicActivity);
  return (
    <section className="admin-operation-card">
      <CardHeading eyebrow="Audit history" title="Economic & market activity" />
      <p className="admin-detail-muted">
        Authentication telemetry and repeated readiness polling are intentionally excluded from this
        operational record.
      </p>
      <HistoryRows events={events} empty="No economic lifecycle events recorded." />
    </section>
  );
}
function Info({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <section className="admin-operation-card">
      {eyebrow ? <span className="admin-operations-intro__eyebrow">{eyebrow}</span> : null}
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
function Fact({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <span>
      <b>{label}</b>
      <strong className={accent ? "accent" : ""}>{value}</strong>
    </span>
  );
}
function CardHeading({
  eyebrow,
  title,
  status,
  ready,
}: {
  eyebrow?: string;
  title: string;
  status?: string;
  ready?: boolean;
}) {
  return (
    <div className="admin-card-heading">
      <div>
        {eyebrow ? <span className="admin-operations-intro__eyebrow">{eyebrow}</span> : null}
        <h3>{title}</h3>
      </div>
      {status ? (
        <span className={`admin-readiness ${ready ? "ready" : "blocked"}`}>
          {ready ? <CheckCircle2 aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
          {status}
        </span>
      ) : null}
    </div>
  );
}
function OwnershipHolders({ item }: { item: Detail }) {
  return item.ownership.holders?.length ? (
    <div className="admin-history-list">
      {item.ownership.holders.map((holder) => (
        <div key={holder.accountId}>
          <span>{holder.username ? `@${holder.username}` : "Ownership account"}</span>
          <strong>{holder.displayName}</strong>
          <p>
            {holder.units} units{holder.percentage === null ? "" : ` · ${holder.percentage}%`}
          </p>
        </div>
      ))}
    </div>
  ) : (
    <p className="admin-detail-muted">
      Issued supply exists; holder projection is unavailable or not yet indexed.
    </p>
  );
}
function ActivityPreview({ item }: { item: Detail }) {
  const events = item.activity.filter(isEconomicActivity).slice(0, 3);
  return events.length ? (
    <HistoryRows events={events} empty="" />
  ) : (
    <p className="admin-detail-muted">No economic activity recorded.</p>
  );
}
function HistoryRows({
  events,
  empty,
}: {
  events: Array<{
    id: string;
    action: string;
    actor: string;
    detail: string | null;
    occurredAt: string;
  }>;
  empty: string;
}) {
  return events.length ? (
    <div className="admin-history-list">
      {events.map((event) => (
        <div key={event.id}>
          <span>{dateTime(event.occurredAt)}</span>
          <strong>{sentence(event.action)}</strong>
          <p>{event.detail ?? "Recorded authoritative event"}</p>
          <small>{event.actor}</small>
        </div>
      ))}
    </div>
  ) : (
    <p className="admin-detail-muted">{empty}</p>
  );
}
function LaunchStep({
  label,
  state,
  detail,
  action,
  disabled,
  actionLabel,
}: {
  label: string;
  state: "complete" | "ready" | "blocked";
  detail: string;
  action?: () => void;
  disabled?: boolean;
  actionLabel?: string;
}) {
  return (
    <div className={`admin-launch-step ${state}`}>
      <span>
        {state === "complete" ? (
          <CheckCircle2 aria-hidden="true" />
        ) : state === "ready" ? (
          <TrendingUp aria-hidden="true" />
        ) : (
          <LockKeyhole aria-hidden="true" />
        )}
      </span>
      <div>
        <strong>{label}</strong>
        <p>{detail}</p>
      </div>
      {action && actionLabel ? (
        <button
          type="button"
          className="admin-ops-button secondary"
          disabled={disabled}
          onClick={action}
        >
          {actionLabel} <ArrowRight aria-hidden="true" />
        </button>
      ) : null}
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
function targetTab(target: string): DetailTab {
  if (target === "VALUATION") return "valuation";
  if (target === "OWNERSHIP") return "ownership";
  if (target === "MARKET") return "initial-offering";
  return "overview";
}
function marketLabel(item: Detail) {
  return item.initialOffering?.status === "OPEN"
    ? "Initial Offering live"
    : item.market.trading?.tradingEnabled
      ? "Trading enabled"
      : sentence(item.market.publication);
}
function workType(item: Detail) {
  return item.dossier.workType === "OWNER_DEMO"
    ? "Demo"
    : item.dossier.workType === "CONTROLLED_QA"
      ? "Controlled QA"
      : item.dossier.workType === "AUTOMATED_TEST"
        ? "Automated test"
        : "Production";
}
function sentence(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function workflowState(value: AssetOperationDetailProjection["economicWorkflow"][number]["state"]) {
  return value === "IN_PROGRESS"
    ? "In progress"
    : value === "NOT_STARTED"
      ? "Not started"
      : sentence(value);
}
function percent(bps: number) {
  return `${(bps / 100).toFixed(Number.isInteger(bps / 100) ? 0 : 2)}%`;
}
function isValidPounds(value: string) {
  return /^\d+(?:\.\d{1,2})?$/.test(value) && Number(value) > 0;
}
function poundsToMinor(value: string) {
  const [whole = "0", fraction = ""] = value.trim().split(".");
  return `${whole}${fraction.padEnd(2, "0")}`.replace(/^0+(?=\d)/, "");
}
function dateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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
