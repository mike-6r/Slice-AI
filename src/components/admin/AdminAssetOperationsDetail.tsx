import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Image as ImageIcon,
  LockKeyhole,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Snowflake,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ApiError } from "@/api/http-client";
import type {
  AdminCollectibleDetail as Detail,
  AssetOperationDetailProjection,
  PreSaleDetail,
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
type AssetControlAction =
  | "FREEZE"
  | "UNFREEZE"
  | "PAUSE_OFFERING"
  | "RESUME_OFFERING"
  | "CANCEL_OFFERING"
  | "HALT_MARKET"
  | "RESUME_MARKET";
type PendingControl = {
  action: AssetControlAction;
  label: string;
  confirmation: string;
  expectedStatus?: string | null;
};

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
  const operations = useQuery({
    queryKey: ["admin", "asset-operations-projection", assetId],
    queryFn: () => services.repositories.lifecycle.getOperationDetail(assetId),
    staleTime: 10_000,
  });
  const preSaleDetail = useQuery({
    queryKey: ["admin", "pre-sale", assetId],
    queryFn: () => services.repositories.admin.getPreSale(assetId),
    staleTime: 10_000,
  });
  const [valuePounds, setValuePounds] = useState("");
  const [confidence, setConfidence] = useState("80");
  const [policyCode, setPolicyCode] = useState("");
  const [policyUnits, setPolicyUnits] = useState("");
  const [policyReason, setPolicyReason] = useState("");
  const [approvalReason, setApprovalReason] = useState("");
  const [pendingControl, setPendingControl] = useState<PendingControl | null>(null);
  const [controlReason, setControlReason] = useState("");
  const [controlConfirmation, setControlConfirmation] = useState("");
  const [preSaleReason, setPreSaleReason] = useState("Confirming provisional Pre-Sale terms from Collector submission.");
  const [preSaleDeadline, setPreSaleDeadline] = useState("");
  const [preSaleEstimate, setPreSaleEstimate] = useState("");
  const [preSalePercent, setPreSalePercent] = useState("100");
  const [preSaleUnits, setPreSaleUnits] = useState("1000");
  const [preSalePrice, setPreSalePrice] = useState("");
  useEffect(() => {
    const setup = preSaleDetail.data;
    if (!setup || setup.status !== "NOT_CONFIGURED") return;
    if (setup.collectorEstimateMinor) setPreSaleEstimate(minorToPounds(setup.collectorEstimateMinor));
    if (setup.offeredPercentageBps) setPreSalePercent((setup.offeredPercentageBps / 100).toString());
    if (setup.totalSupply) setPreSaleUnits(setup.totalSupply);
    if (setup.pricePerUnitMinor) setPreSalePrice(minorToPounds(setup.pricePerUnitMinor));
  }, [preSaleDetail.data]);
  const configurePreSale = useMutation({
    mutationFn: () => services.repositories.admin.configurePreSale(assetId, {
      estimatedValueMinor: preSaleEstimate.trim() ? poundsToMinor(preSaleEstimate) : undefined,
      offeredPercentageBps: Math.round(Number(preSalePercent) * 100),
      totalUnits: preSaleUnits.trim() || undefined,
      pricePerUnitMinor: preSalePrice.trim() ? poundsToMinor(preSalePrice) : undefined,
      reason: preSaleReason,
    }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin", "pre-sale", assetId] });
      void client.invalidateQueries({ queryKey: ["admin", "asset-operations-detail", assetId] });
      void client.invalidateQueries({ queryKey: ["admin", "asset-operations-projection", assetId] });
    },
  });
  const preSaleCommand = useMutation({
    mutationFn: (input: { action: "open" | "pause" | "resume" | "extend" | "cancel" | "finalize" }) => {
      if (input.action === "open") return services.repositories.admin.openPreSale(assetId);
      if (input.action === "pause") return services.repositories.admin.pausePreSale(assetId, preSaleReason);
      if (input.action === "resume") return services.repositories.admin.resumePreSale(assetId, preSaleReason);
      if (input.action === "extend") return services.repositories.admin.extendPreSale(assetId, { deadlineAt: new Date(preSaleDeadline).toISOString(), reason: preSaleReason });
      if (input.action === "cancel") return services.repositories.admin.cancelPreSale(assetId, preSaleReason);
      return services.repositories.admin.finalizePreSale(assetId);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin", "pre-sale", assetId] });
      void client.invalidateQueries({ queryKey: ["admin", "asset-operations-detail", assetId] });
    },
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["admin", "asset-operations-detail", assetId] });
    void client.invalidateQueries({ queryKey: ["admin", "asset-operations-projection", assetId] });
    void client.invalidateQueries({ queryKey: ["admin", "pre-sale", assetId] });
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
  const assetControl = useMutation({
    mutationFn: async () => {
      if (!pendingControl || !operations.data)
        throw new Error("No authoritative control command is selected.");
      const offeringId = item.initialOffering?.offeringId;
      if (pendingControl.action === "FREEZE" || pendingControl.action === "UNFREEZE")
        return services.repositories.lifecycle.setOperationalControl(assetId, {
          command: pendingControl.action,
          reason: controlReason,
          confirmation: pendingControl.confirmation as
            "FREEZE_ASSET_OPERATIONS" | "UNFREEZE_ASSET_OPERATIONS",
          expectedVersion: operations.data.controls.version,
        });
      if (!offeringId && pendingControl.action.includes("OFFERING"))
        throw new Error("No authoritative Initial Offering exists.");
      if (pendingControl.action === "PAUSE_OFFERING")
        return services.repositories.admin.pauseInitialOffering(offeringId!, {
          reason: controlReason,
          confirmation: "PAUSE_INITIAL_OFFERING",
          expectedStatus: pendingControl.expectedStatus ?? "",
        });
      if (pendingControl.action === "RESUME_OFFERING")
        return services.repositories.admin.resumeInitialOffering(offeringId!, {
          reason: controlReason,
          confirmation: "RESUME_INITIAL_OFFERING",
          expectedStatus: "PAUSED",
        });
      if (pendingControl.action === "CANCEL_OFFERING")
        return services.repositories.admin.cancelInitialOffering(offeringId!, {
          reason: controlReason,
          confirmation: "CANCEL_UNLAUNCHED_OFFERING",
          expectedStatus: pendingControl.expectedStatus ?? "",
        });
      if (pendingControl.action === "HALT_MARKET")
        return services.repositories.admin.haltTradingMarket(assetId, {
          reason: controlReason,
          confirmation: "HALT_TRADING",
          expectedStatus: "OPEN",
        });
      return services.repositories.admin.resumeTradingMarket(assetId, {
        reason: controlReason,
        confirmation: "RESUME_TRADING",
        expectedStatus: "HALTED",
      });
    },
    onSuccess: () => {
      setPendingControl(null);
      setControlReason("");
      setControlConfirmation("");
      refresh();
    },
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
    assetControl,
    preSaleCommand,
    configurePreSale,
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
              value={
                operations.data
                  ? sentence(operations.data.operations.stage)
                  : operations.isLoading
                    ? "Loading"
                    : "Projection unavailable"
              }
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
      <EconomicWorkflow
        operations={operations.data}
        selected={selected}
        onOpen={onTab}
        loading={operations.isLoading}
        error={operations.isError}
        retry={() => void operations.refetch()}
      />
      <AdminPreSalePanel
        detail={preSaleDetail.data}
        canConfigure={
          operations.data?.availableCommands.configurePreSale ??
          preSaleDetail.data?.commands?.canConfigurePreSale ??
          false
        }
        error={configurePreSale.error}
        reason={preSaleReason}
        deadline={preSaleDeadline}
        setReason={setPreSaleReason}
        setDeadline={setPreSaleDeadline}
        estimate={preSaleEstimate}
        percent={preSalePercent}
        units={preSaleUnits}
        price={preSalePrice}
        setEstimate={setPreSaleEstimate}
        setPercent={setPreSalePercent}
        setUnits={setPreSaleUnits}
        setPrice={setPreSalePrice}
        configure={() => configurePreSale.mutate()}
        execute={(action) => preSaleCommand.mutate({ action })}
        pending={preSaleCommand.isPending || configurePreSale.isPending}
      />
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
      <div
        className={`admin-asset-workspace__content ${selected === "controls" ? "admin-asset-workspace__content--controls" : ""}`}
      >
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
          {selected === "controls" ? (
            <Controls
              item={item}
              operations={operations.data}
              pending={pendingControl}
              reason={controlReason}
              confirmation={controlConfirmation}
              executing={assetControl.isPending}
              setReason={setControlReason}
              setConfirmation={setControlConfirmation}
              select={setPendingControl}
              cancel={() => {
                setPendingControl(null);
                setControlReason("");
                setControlConfirmation("");
              }}
              execute={() => assetControl.mutate()}
            />
          ) : null}
          {selected === "history" ? <History item={item} /> : null}
        </div>
        {selected === "controls" ? null : (
          <OperationsRail item={item} operations={operations.data} onOpen={onTab} />
        )}
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
}: {
  item: Detail;
  operations?: AssetOperationDetailProjection;
  onOpen: (tab: string) => void;
}) {
  const action = operations?.operations.nextAction;
  return (
    <div className="admin-operations-overview">
      {operations ? (
        <section className="admin-operation-card admin-operations-overview__stage">
          <CardHeading
            title={sentence(operations.operations.stage)}
            status={action?.actor === "NONE" ? "No action required" : "Action required"}
            ready={action?.actor === "NONE"}
          />
          <div className="admin-operations-overview__stage-grid">
            <div>
              <span>Next action</span>
              <strong>{action?.label ?? "No action projected"}</strong>
            </div>
            <div>
              <span>Next actor</span>
              <strong>{action ? sentence(action.actor) : "Not assigned"}</strong>
            </div>
            <div>
              <span>Operational blockers</span>
              <strong>{operations.operations.blockers.length}</strong>
            </div>
          </div>
        </section>
      ) : null}

      <div className="admin-operations-overview__grid">
        <div className="admin-operations-overview__column">
          <Info title="Economic Snapshot">
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
              label="Ownership state"
              value={item.issuance ? sentence(item.issuance.status) : "Not configured"}
            />
            <Field
              label="Total units"
              value={
                item.issuance?.supply?.totalUnits ?? item.ownership.totalUnits ?? "Not configured"
              }
            />
            <Field
              label="Offering state"
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
            <Field label="Market state" value={marketLabel(item)} />
            <Field
              label="Gross offering"
              value={
                item.initialOffering
                  ? money(item.initialOffering.grossOfferingMinor, item.initialOffering.currency)
                  : "Not applicable"
              }
            />
            <Field
              label="Offering fee"
              value={
                item.initialOffering
                  ? `${money(item.initialOffering.feeMinor, item.initialOffering.currency)} (${percent(item.initialOffering.feeBps)})`
                  : "Not applicable"
              }
            />
            <Field
              label="Collector proceeds"
              value={
                item.initialOffering
                  ? money(item.initialOffering.netOfferingMinor, item.initialOffering.currency)
                  : "Not applicable"
              }
            />
          </Info>

          <Info title="Economic Reconciliation">
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
              label="Offered inventory"
              value={item.initialOffering?.inventory?.offeredUnits ?? "Not created"}
            />
            <Field
              label="Reserved units"
              value={item.initialOffering?.inventory?.reservedUnits ?? "Not created"}
            />
            <Field
              label="Executed units"
              value={item.initialOffering?.inventory?.settledUnits ?? "Not created"}
            />
            <Field
              label="Available units"
              value={item.initialOffering?.inventory?.availableUnits ?? "Not created"}
            />
            <Field
              label="Available proceeds"
              value={
                item.initialOffering
                  ? money(
                      item.initialOffering.proceeds.availableMinor,
                      item.initialOffering.proceeds.currency,
                    )
                  : "Not applicable"
              }
            />
          </Info>
        </div>

        <div className="admin-operations-overview__column">
          {operations ? (
            <div className="admin-operations-overview__readiness-stack">
              {operations.economicWorkflow.some((step) => step.key === "PRE_SALE_SETUP") ? (
                <ReadinessCard
                  title="Pre-Sale Readiness"
                  helper="Only the gates required to configure and launch conditional reservations."
                  readiness={operations.preSaleReadiness}
                />
              ) : null}
              <ReadinessCard
                title="Final Market Readiness"
                helper="Receipt, verification, custody, final valuation, ownership, and market launch happen after Pre-Sale."
                readiness={operations.finalMarketReadiness}
              />
            </div>
          ) : null}

          <Info title="Recent Meaningful Activity">
            <ActivityPreview item={item} />
          </Info>
        </div>
      </div>
    </div>
  );
}

function ReadinessCard({
  title,
  helper,
  readiness,
}: {
  title: string;
  helper: string;
  readiness: AssetOperationDetailProjection["preSaleReadiness"];
}) {
  return (
    <section className="admin-operation-card admin-operations-overview__gates">
      <CardHeading
        title={title}
        status={readiness.state === "READY" ? "Ready" : `${readiness.blockers.length} required`}
        ready={readiness.state === "READY"}
      />
      <p className="admin-detail-muted">{helper}</p>
      <div className="admin-launch-gates">
        {readiness.gates.map((gate) => (
          <div key={gate.blockerCode} className={`admin-launch-gate ${gate.state.toLowerCase()}`}>
            {gate.state === "SATISFIED" ? <CheckCircle2 aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
            <span>{readinessLabel(gate.blockerCode, gate.label)}</span>
            <strong>{gate.state === "SATISFIED" ? "Ready" : "Required"}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function EconomicWorkflow({
  operations,
  selected,
  onOpen,
  loading,
  error,
  retry,
}: {
  operations?: AssetOperationDetailProjection;
  selected: DetailTab;
  onOpen: (tab: string) => void;
  loading: boolean;
  error: boolean;
  retry: () => void;
}) {
  const tabFor = (key: AssetOperationDetailProjection["economicWorkflow"][number]["key"]) => {
    if (key === "INITIAL_OFFERING") return "initial-offering";
    if (key === "PRE_SALE_SETUP" || key === "PRE_SALE_LIVE") return "market";
    if (key === "PHYSICAL_INTAKE") return "overview";
    if (key === "FINALIZATION") return "launch";
    if (key === "MARKET_LIVE") return "market";
    return key.toLowerCase();
  };
  if (!operations)
    return (
      <section className="admin-economic-workflow admin-economic-workflow--unavailable">
        <div>
          <span>{loading ? "Loading economic workflow" : "Economic workflow unavailable"}</span>
          <p>
            {error
              ? "The lifecycle projection could not be loaded. The canonical record remains available and no state was inferred locally."
              : "Reading backend-authoritative progression."}
          </p>
        </div>
        {error ? (
          <button type="button" className="admin-ops-button" onClick={retry}>
            Retry projection <RefreshCw aria-hidden="true" />
          </button>
        ) : null}
      </section>
    );
  return (
    <section className="admin-economic-workflow" aria-label="Economic workflow">
      <div className="admin-economic-workflow__intro">
        <span>Economic workflow</span>
        <p>
          {operations.economicWorkflow.some((step) => step.key === "PRE_SALE_SETUP")
            ? "Conditional access through final market"
            : "Valuation through live market"}
        </p>
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
  const preSaleReady = Boolean(operations && operations.preSaleReadiness.state === "READY");
  const location =
    operations?.physicalPrerequisites.location ??
    item.intake?.vault ??
    (item.custody.location ? sentence(item.custody.location) : null) ??
    "Not recorded";
  const primaryTarget = action?.actor === "NONE" ? null : targetTab(action?.target ?? "");
  const commands: Array<[string, DetailTab]> = operations
    ? [
        operations.availableCommands.recordValuation &&
          (["Record valuation", "valuation"] as [string, DetailTab]),
        operations.availableCommands.configureOwnership &&
          (["Configure ownership", "ownership"] as [string, DetailTab]),
        operations.availableCommands.reviewOffering &&
          (["Review Initial Offering", "initial-offering"] as [string, DetailTab]),
        operations.availableCommands.issueOwnership &&
          (["Issue ownership", "launch"] as [string, DetailTab]),
        operations.availableCommands.publish &&
          (["Review launch", "launch"] as [string, DetailTab]),
        operations.availableCommands.openOffering &&
          (["Open Initial Offering", "launch"] as [string, DetailTab]),
        operations.availableCommands.activateMarket &&
          (["Activate market", "launch"] as [string, DetailTab]),
        operations.availableCommands.configurePreSale &&
          (["Configure Pre-Sale terms", "market"] as [string, DetailTab]),
        operations.availableCommands.launchPreSale &&
          (["Launch Pre-Sale", "market"] as [string, DetailTab]),
      ]
        .filter((command): command is [string, DetailTab] => Boolean(command))
        .filter(([, tab]) => tab !== primaryTarget)
    : [];
  return (
    <aside className="admin-operations-rail" aria-label="Asset operation controls">
      {operations ? (
        <Rail title="Next Action" tone={action?.actor === "NONE" ? "ready" : "attention"}>
          <strong>{action?.label ?? "No action projected"}</strong>
          <p>
            {action?.actor === "NONE"
              ? "This asset has no pending economic action."
              : `Next actor: ${sentence(action?.actor ?? "STAFF")}.`}
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
      ) : null}
      {operations ? (
        <Rail title={preSaleReady ? "Pre-Sale blockers" : "Blockers"}>
          {blocked.length ? (
            <ul className="admin-operations-rail__list">
              {blocked.map((blocker) => (
                <li key={blocker}>{sentence(blocker)}</li>
              ))}
            </ul>
          ) : (
            <p>
              {preSaleReady
                ? "No Pre-Sale blocker. Final-market work remains separate."
                : "No active operational blocker."}
            </p>
          )}
        </Rail>
      ) : null}
      {operations ? (
        <Rail title="Available Commands">
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
      ) : null}
      <Rail title="Physical Progress">
        <p>Physical completion is required for finalization, not for Pre-Sale launch.</p>
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
          value={
            operations
              ? operations.physicalPrerequisites.complete
                ? "None"
                : "Requires attention"
              : item.intake?.exception
                ? "Requires attention"
                : "None recorded"
          }
        />
        <Field label="Intake location" value={location} />
        {item.intake ? (
          <div className="admin-operations-rail__commands">
            <a href={`/admin?section=intake&intake=${encodeURIComponent(item.intake.id)}`}>
              Open Physical Intake <ExternalLink aria-hidden="true" />
            </a>
          </div>
        ) : null}
      </Rail>
      {operations ? (
        <Rail title="Final Market">
          <strong>{operations.finalMarketReadiness.state === "READY" ? "Ready" : "Not ready"}</strong>
          <p>Final valuation, ownership, and market launch follow physical completion.</p>
          {operations.finalMarketReadiness.blockers.length ? (
            <ul className="admin-operations-rail__list">
              {operations.finalMarketReadiness.blockers.slice(0, 5).map((blocker) => (
                <li key={blocker}>{readinessLabel(blocker, blocker)}</li>
              ))}
            </ul>
          ) : null}
        </Rail>
      ) : null}
      <Rail title="Quick links">
        <div className="admin-operations-rail__commands">
          <a href={`/admin?section=collectibles&asset=${encodeURIComponent(item.id)}`}>
            Open collectible <ExternalLink aria-hidden="true" />
          </a>
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
          {item.market.publication === "PUBLISHED" ? (
            <a href={`/asset/${item.slug}`} target="_blank" rel="noreferrer">
              Open public record <ExternalLink aria-hidden="true" />
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
function Controls({
  item,
  operations,
  pending,
  reason,
  confirmation,
  executing,
  setReason,
  setConfirmation,
  select,
  cancel,
  execute,
}: {
  item: Detail;
  operations?: AssetOperationDetailProjection;
  pending: PendingControl | null;
  reason: string;
  confirmation: string;
  executing: boolean;
  setReason: (value: string) => void;
  setConfirmation: (value: string) => void;
  select: (value: PendingControl) => void;
  cancel: () => void;
  execute: () => void;
}) {
  const controls = operations?.controls;
  if (!controls)
    return (
      <section className="admin-operation-card admin-operation-card--wide">
        <CardHeading eyebrow="Administrative control center" title="Controls unavailable" />
        <p className="admin-detail-muted">
          The authoritative control projection could not be loaded. No administrative command is
          available until the record is refreshed.
        </p>
      </section>
    );
  const command = controls.commands;
  const choose = (
    action: AssetControlAction,
    label: string,
    value: { confirmation: string; expectedStatus?: string | null },
  ) =>
    select({
      action,
      label,
      confirmation: value.confirmation,
      expectedStatus: value.expectedStatus,
    });
  return (
    <div className="admin-operations-control-center">
      <div className="admin-operations-control-center__main">
        <section className="admin-operation-card admin-control-status">
          <CardHeading
            eyebrow="Administrative control center"
            title={
              controls.operational.status === "FROZEN"
                ? "Asset operations frozen"
                : "Asset operations active"
            }
            status={controls.operational.status === "FROZEN" ? "Action required" : "Controlled"}
            ready={controls.operational.status !== "FROZEN"}
          />
          <p className="admin-detail-muted">
            {controls.operational.reason ??
              "No administrative freeze is active. Lifecycle authority remains with the owning services."}
          </p>
          <div className="admin-control-status__facts">
            <Field label="Control version" value={controls.version} />
            <Field
              label="Last control change"
              value={
                controls.operational.updatedAt ? dateTime(controls.operational.updatedAt) : "None"
              }
            />
            <Field label="Physical authority" value="Read only in this workspace" />
          </div>
        </section>

        <section className="admin-operation-card">
          <CardHeading eyebrow="Active policy state" title="Restrictions" />
          {controls.restrictions.length ? (
            <div className="admin-control-restrictions">
              {controls.restrictions.map((restriction) => (
                <article key={`${restriction.type}-${restriction.createdAt}`}>
                  <div>
                    <strong>{sentence(restriction.type)}</strong>
                    <span>{sentence(restriction.status)}</span>
                  </div>
                  <p>{restriction.reason}</p>
                  <dl>
                    <dt>Scope</dt>
                    <dd>{sentence(restriction.scope)}</dd>
                    <dt>Source</dt>
                    <dd>{sentence(restriction.source)}</dd>
                    <dt>Actor</dt>
                    <dd>{restriction.actor}</dd>
                    <dt>Applied</dt>
                    <dd>{dateTime(restriction.createdAt)}</dd>
                  </dl>
                  <small>{restriction.resolution}</small>
                </article>
              ))}
            </div>
          ) : (
            <p className="admin-detail-muted">
              No active asset, offering, or market restriction is recorded.
            </p>
          )}
        </section>

        <section className="admin-operation-card">
          <CardHeading eyebrow="Safe commands" title="Operational controls" />
          <div className="admin-control-actions">
            <ControlButton
              icon={<Snowflake aria-hidden="true" />}
              title="Freeze asset operations"
              detail="Stops new economic progression and halts an open market without rewriting history."
              enabled={command.freeze.available}
              unavailable={command.freeze.unavailableReason}
              onClick={() => choose("FREEZE", "Freeze asset operations", command.freeze)}
            />
            <ControlButton
              icon={<PlayCircle aria-hidden="true" />}
              title="Release operational freeze"
              detail="Restores command eligibility after integrity incidents are resolved."
              enabled={command.unfreeze.available}
              unavailable={command.unfreeze.unavailableReason}
              onClick={() => choose("UNFREEZE", "Release operational freeze", command.unfreeze)}
            />
            <ControlButton
              icon={<PauseCircle aria-hidden="true" />}
              title="Pause Initial Offering"
              detail="Pauses an active offering and safely releases its open order reservation."
              enabled={command.pauseOffering.available}
              unavailable={command.pauseOffering.unavailableReason}
              onClick={() =>
                choose("PAUSE_OFFERING", "Pause Initial Offering", command.pauseOffering)
              }
            />
            <ControlButton
              icon={<PlayCircle aria-hidden="true" />}
              title="Resume Initial Offering"
              detail="Re-evaluates authoritative gates before reopening a paused offering."
              enabled={command.resumeOffering.available}
              unavailable={command.resumeOffering.unavailableReason}
              onClick={() =>
                choose("RESUME_OFFERING", "Resume Initial Offering", command.resumeOffering)
              }
            />
            <ControlButton
              icon={<ShieldAlert aria-hidden="true" />}
              title="Halt secondary market"
              detail="Prevents new matching while retaining orders, executions, and ownership history."
              enabled={command.haltMarket.available}
              unavailable={command.haltMarket.unavailableReason}
              onClick={() => choose("HALT_MARKET", "Halt secondary market", command.haltMarket)}
            />
            <ControlButton
              icon={<PlayCircle aria-hidden="true" />}
              title="Resume secondary market"
              detail="Reopens trading only when the administrative and integrity gates permit it."
              enabled={command.resumeMarket.available}
              unavailable={command.resumeMarket.unavailableReason}
              onClick={() =>
                choose("RESUME_MARKET", "Resume secondary market", command.resumeMarket)
              }
            />
            <ControlButton
              icon={<CircleAlert aria-hidden="true" />}
              title="Cancel unlaunched offering"
              detail="Available only before execution and before investor ownership exists."
              enabled={command.cancelOffering.available}
              unavailable={command.cancelOffering.unavailableReason}
              danger
              onClick={() =>
                choose("CANCEL_OFFERING", "Cancel unlaunched offering", command.cancelOffering)
              }
            />
          </div>
        </section>

        {pending ? (
          <section className="admin-operation-card admin-control-confirmation">
            <CardHeading
              eyebrow="Material command"
              title={pending.label}
              status="Confirmation required"
            />
            <p>
              This action is permissioned, idempotent, stale-state protected, and audit logged. It
              does not delete historical records.
            </p>
            <label>
              Operator reason
              <textarea
                value={reason}
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Explain the operational reason (minimum 12 characters)."
              />
            </label>
            <label>
              Type <strong>{pending.confirmation}</strong> to confirm
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder={pending.confirmation}
              />
            </label>
            <div className="admin-control-confirmation__actions">
              <button type="button" onClick={cancel} disabled={executing}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={execute}
                disabled={
                  executing || reason.trim().length < 12 || confirmation !== pending.confirmation
                }
              >
                {executing ? "Applying…" : pending.label}
              </button>
            </div>
          </section>
        ) : null}

        {item.dossier.restrictions.length ? (
          <section className="admin-operation-card">
            <CardHeading eyebrow="Related authority" title="Compliance record" />
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
          </section>
        ) : null}
      </div>

      <aside className="admin-operations-control-center__rail">
        <section
          className={`admin-operation-card admin-investor-boundary ${
            controls.investorProtection.active ? "active" : ""
          }`}
        >
          <ShieldCheck aria-hidden="true" />
          <div>
            <span>Investor protection boundary</span>
            <h3>{controls.investorProtection.active ? "Locked" : "Monitoring"}</h3>
            <p>{controls.investorProtection.reason}</p>
          </div>
          <Field
            label="Investor-owned units"
            value={controls.investorProtection.investorOwnedUnits}
          />
          <Field
            label="Owner record visibility"
            value={
              controls.investorProtection.ownerVisibilityRequired ? "Required" : "Standard policy"
            }
          />
          <Field
            label="Public discoverability"
            value={item.market.publication === "PUBLISHED" ? "Published" : "Not published"}
          />
        </section>

        <section className="admin-operation-card">
          <CardHeading
            eyebrow="Lifecycle authority"
            title="Integrity incidents"
            status={
              controls.integrityIncidents.length
                ? `${controls.integrityIncidents.length} open`
                : "Clear"
            }
            ready={!controls.integrityIncidents.length}
          />
          {controls.integrityIncidents.length ? (
            <div className="admin-integrity-list">
              {controls.integrityIncidents.map((incident) => (
                <article key={incident.code}>
                  <strong>{incident.title}</strong>
                  <p>{incident.detail}</p>
                  <small>{incident.resolution}</small>
                </article>
              ))}
            </div>
          ) : (
            <p className="admin-detail-muted">
              No authoritative lifecycle contradiction is detected.
            </p>
          )}
        </section>

        <section className="admin-operation-card">
          <CardHeading eyebrow="Informational only" title="Permanently guarded actions" />
          <div className="admin-locked-actions">
            {controls.lockedActions.map((action) => (
              <div key={action.label}>
                <LockKeyhole aria-hidden="true" />
                <span>
                  <strong>{action.label}</strong>
                  <small>{action.reason}</small>
                </span>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}

function ControlButton({
  icon,
  title,
  detail,
  enabled,
  unavailable,
  danger,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  enabled: boolean;
  unavailable?: string | null;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={danger ? "danger" : ""}
      onClick={onClick}
      disabled={!enabled}
      title={
        !enabled ? (unavailable ?? "Unavailable in the current authoritative state.") : undefined
      }
    >
      {icon}
      <span>
        <strong>{title}</strong>
        <small>{enabled ? detail : (unavailable ?? "Unavailable in the current state.")}</small>
      </span>
      {enabled ? <ArrowRight aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}
    </button>
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
  const events = item.activity.filter(isEconomicActivity).slice(0, 5);
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
  if (target === "INITIAL_OFFERING") return "initial-offering";
  if (target === "LAUNCH") return "launch";
  if (target === "MARKET") return "market";
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
function readinessLabel(code: string, fallback: string) {
  const labels: Record<string, string> = {
    CANONICAL_ASSET_INACTIVE: "Canonical asset is active",
    APPROVED_SUBMISSION_REQUIRED: "Approved source submission",
    INTAKE_PATH_REQUIRED: "Physical intake created",
    PRESALE_TERMS_REQUIRED: "Pre-Sale terms configured",
    PRESALE_SUPPLY_REQUIRED: "Valid total supply and offered inventory",
    PRESALE_INVENTORY_INVALID: "Offered and retained inventory reconciles",
    PRESALE_PRICE_REQUIRED: "Provisional price per Slice",
    PRESALE_DEADLINE_EXPIRED: "Pre-Sale deadline is valid",
    OPERATIONAL_FREEZE_ACTIVE: "Operational freeze released",
    PRESALE_RESTRICTION_ACTIVE: "No active intake restriction",
    CATALOGUE_NOT_PUBLISHED: "Catalogue record active",
    VERIFICATION_NOT_APPROVED: "Physical verification approved",
    VALUATION_REQUIRED: "Final valuation recorded",
    CUSTODY_NOT_SECURED: "Secure custody established",
    ACTIVE_COVERAGE_REQUIRED: "Active insurance coverage",
    LIFECYCLE_EXCEPTION: "No lifecycle exception",
    OWNERSHIP_ISSUANCE_REQUIRED: "Ownership supply issued",
    INITIAL_OFFERING_REQUIRED: "Initial Offering active",
  };
  return labels[code] ?? sentence(fallback);
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
export function isPreSaleConfigureFormValid(input: {
  estimate: string;
  percent: string;
  units: string;
  price: string;
  reason: string;
}) {
  const percentage = Number(input.percent);
  return (
    (!input.estimate.trim() || isValidPounds(input.estimate)) &&
    (!input.price.trim() || isValidPounds(input.price)) &&
    (Boolean(input.estimate.trim()) || Boolean(input.price.trim())) &&
    Number.isFinite(percentage) &&
    percentage > 0 &&
    percentage <= 100 &&
    /^\d+$/.test(input.units.trim()) &&
    Number(input.units) > 0 &&
    input.reason.trim().length >= 8
  );
}
export function isPreSaleConfigureButtonEnabled(input: {
  canConfigure: boolean;
  pending: boolean;
  estimate: string;
  percent: string;
  units: string;
  price: string;
  reason: string;
}) {
  return input.canConfigure && !input.pending && isPreSaleConfigureFormValid(input);
}
function mutationErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "The server rejected Pre-Sale configuration. Refresh the record and try again.";
}
function poundsToMinor(value: string) {
  const [whole = "0", fraction = ""] = value.trim().split(".");
  return `${whole}${fraction.padEnd(2, "0")}`.replace(/^0+(?=\d)/, "");
}
function minorToPounds(value: string) {
  const minor = value.replace(/\D/g, "").padStart(3, "0");
  return `${minor.slice(0, -2).replace(/^0+(?=\d)/, "")}.${minor.slice(-2)}`;
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

function AdminPreSalePanel({
  detail,
  canConfigure,
  error,
  reason,
  deadline,
  setReason,
  setDeadline,
  estimate,
  percent,
  units,
  price,
  setEstimate,
  setPercent,
  setUnits,
  setPrice,
  configure,
  execute,
  pending,
}: {
  detail?: PreSaleDetail;
  canConfigure: boolean;
  error?: unknown;
  reason: string;
  deadline: string;
  setReason: (value: string) => void;
  setDeadline: (value: string) => void;
  estimate: string;
  percent: string;
  units: string;
  price: string;
  setEstimate: (value: string) => void;
  setPercent: (value: string) => void;
  setUnits: (value: string) => void;
  setPrice: (value: string) => void;
  configure: () => void;
  execute: (action: "open" | "pause" | "resume" | "extend" | "cancel" | "finalize") => void;
  pending: boolean;
}) {
  const status = detail?.status ?? "NOT_CONFIGURED";
  const reasonTooShort = reason.trim().length > 0 && reason.trim().length < 8;
  const estimateMinor = detail?.collectorEstimateMinor ?? (isValidPounds(estimate) ? poundsToMinor(estimate) : null);
  const unitCount = Number(units || detail?.totalSupply || 0);
  const percentage = Number(percent || (detail?.offeredPercentageBps ? detail.offeredPercentageBps / 100 : 0));
  const suggestedMinor = estimateMinor && unitCount > 0
    ? (BigInt(estimateMinor) / BigInt(unitCount)).toString()
    : null;
  const priceMinor = detail?.pricePerUnitMinor ?? (isValidPounds(price) ? poundsToMinor(price) : suggestedMinor);
  const offeredUnits = unitCount > 0 && percentage > 0
    ? Math.floor((unitCount * percentage) / 100)
    : 0;
  const retainedUnits = Math.max(0, unitCount - offeredUnits);
  const impliedMinor = priceMinor && unitCount > 0 ? (BigInt(priceMinor) * BigInt(unitCount)).toString() : null;
  const estimateMismatch = estimateMinor && impliedMinor && estimateMinor !== impliedMinor;
  return (
    <section className="admin-presale-panel" aria-label="Pre-Sale controls">
      <div className="admin-presale-panel__heading">
        <div><span className="admin-operations-eyebrow">Conditional market access</span><h2>Pre-Sale</h2></div>
        <span className={`admin-presale-status is-${status.toLowerCase()}`}>{sentence(status)}</span>
      </div>
      {detail && status !== "NOT_CONFIGURED" ? (
        <div className="admin-presale-panel__facts">
          <Field label="Provisional estimate" value={detail.collectorEstimateMinor ? money(detail.collectorEstimateMinor, detail.currency) : "Not supplied"} />
          <Field label="Price per Slice" value={detail.pricePerUnitMinor ? money(detail.pricePerUnitMinor, detail.currency) : "Not set"} />
          <Field label="Offered / retained" value={`${detail.offeredUnits} / ${Math.max(0, Number(detail.totalSupply ?? detail.offeredUnits) - Number(detail.offeredUnits))} Slices`} />
          <Field label="Maximum raise" value={detail.pricePerUnitMinor ? money((BigInt(detail.pricePerUnitMinor) * BigInt(detail.offeredUnits)).toString(), detail.currency) : "Not set"} />
          <Field label="Physical state" value={sentence(detail.physicalStatus)} />
          <Field label="Reserved" value={`${detail.reservedUnits} / ${detail.offeredUnits} Slices`} />
          <Field label="Deadline" value={detail.deadlineAt ? dateTime(detail.deadlineAt) : "Not set"} />
          <Field label="Next step" value={detail.nextStep} />
        </div>
      ) : (
        <>
          <p className="admin-detail-muted">Set the provisional terms used for conditional reservations. Receipt, verification, custody, final valuation, and final market launch are completed later.</p>
          <div className="admin-presale-panel__setup-grid">
            <label className="admin-form-field">Collector estimate (GBP)<input type="number" min="0.01" step="0.01" value={estimate} onChange={(event) => setEstimate(event.target.value)} placeholder="e.g. 2500.00" /></label>
            <label className="admin-form-field">Offer percentage<input type="number" min="0.01" max="100" step="0.01" value={percent} onChange={(event) => setPercent(event.target.value)} /></label>
            <label className="admin-form-field">Total supply<input type="number" min="1" step="1" value={units} onChange={(event) => setUnits(event.target.value)} /></label>
            <label className="admin-form-field">Price per Slice (optional)<input type="number" min="0.01" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Uses estimate ÷ supply" />{suggestedMinor ? <button type="button" className="admin-ops-inline-action" onClick={() => setPrice(minorToPounds(suggestedMinor))}>Use suggested price · {money(suggestedMinor, detail?.currency ?? "GBP")}</button> : null}</label>
          </div>
          <div className="admin-presale-panel__summary" aria-label="Pre-Sale calculation summary">
            <div><span>Implied total</span><strong>{impliedMinor ? money(impliedMinor, detail?.currency ?? "GBP") : "—"}</strong></div>
            <div><span>Collector retains</span><strong>{retainedUnits.toLocaleString()} Slices · {Math.max(0, 100 - percentage).toFixed(2).replace(/\.00$/, "")} %</strong></div>
            <div><span>Offered to buyers</span><strong>{offeredUnits.toLocaleString()} Slices · {percentage.toFixed(2).replace(/\.00$/, "")} %</strong></div>
            <div><span>Maximum raise</span><strong>{priceMinor ? money((BigInt(priceMinor) * BigInt(offeredUnits)).toString(), detail?.currency ?? "GBP") : "—"}</strong></div>
          </div>
          {estimateMismatch ? <p className="admin-presale-panel__warning">The selected price implies {money(impliedMinor!, detail?.currency ?? "GBP")} across supply versus the estimate of {money(estimateMinor!, detail?.currency ?? "GBP")}. Confirm this provisional basis before saving.</p> : null}
        </>
      )}
      {error ? <p className="admin-presale-panel__error" role="alert">{mutationErrorMessage(error)}</p> : null}
      <label className="admin-form-field">Reason <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Confirming provisional Pre-Sale terms from Collector submission." aria-describedby="admin-presale-reason-help" /></label>
      <p id="admin-presale-reason-help" className={reasonTooShort ? "admin-presale-panel__field-hint is-error" : "admin-presale-panel__field-hint"}>
        {reasonTooShort ? "Add at least 8 characters so the audit record explains this change." : "Use a short audit note explaining why these provisional terms are being saved."}
      </p>
      {detail && (status === "ACTIVE" || status === "PAUSED") ? (
        <label className="admin-form-field">Extend deadline <input type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
      ) : null}
      <div className="admin-presale-panel__actions">
        {status === "NOT_CONFIGURED" ? <button type="button" className="admin-ops-button primary" disabled={!isPreSaleConfigureButtonEnabled({ canConfigure, pending, estimate, percent, units, price, reason })} title={reasonTooShort ? "Enter an audit reason of at least 8 characters." : !canConfigure ? "This asset is not currently in the Pre-Sale setup stage." : undefined} onClick={configure}>Configure Pre-Sale <ArrowRight aria-hidden="true" /></button> : null}
        {detail?.id && status === "DRAFT" ? <button type="button" className="admin-ops-button primary" disabled={pending} onClick={() => execute("open")}>Launch Pre-Sale <ArrowRight aria-hidden="true" /></button> : null}
        {status === "ACTIVE" ? <button type="button" className="admin-ops-button" disabled={pending || reason.trim().length < 8} onClick={() => execute("pause")}><PauseCircle aria-hidden="true" /> Pause</button> : null}
        {status === "PAUSED" ? <button type="button" className="admin-ops-button" disabled={pending || reason.trim().length < 8} onClick={() => execute("resume")}><PlayCircle aria-hidden="true" /> Resume</button> : null}
        {detail && (status === "ACTIVE" || status === "PAUSED") ? <button type="button" className="admin-ops-button" disabled={pending || reason.trim().length < 8 || !deadline} onClick={() => execute("extend")}>Extend deadline</button> : null}
        {detail && status !== "CONVERTED" && status !== "CANCELLED" ? <button type="button" className="admin-ops-button danger" disabled={pending || reason.trim().length < 8} onClick={() => execute("cancel")}>Cancel</button> : null}
        {detail && detail.physicalStatus === "CUSTODY_ESTABLISHED" && status !== "CONVERTED" && status !== "CANCELLED" ? <button type="button" className="admin-ops-button primary" disabled={pending} onClick={() => execute("finalize")}>Finalize conversion <CheckCircle2 aria-hidden="true" /></button> : null}
      </div>
    </section>
  );
}
