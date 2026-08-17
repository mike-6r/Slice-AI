import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Info } from "lucide-react";
import { useState } from "react";
import type { CollectorWorkspaceAsset } from "@/domain";
import type { InitialOfferingPreview, InitialOfferingProjection } from "@/data/repositories";
import { useAppServices } from "@/providers/AppServicesProvider";
import { formatMinorAmount } from "@/lib/market-presentation";

const choices = [25, 50, 75, 100];

export function CollectorInitialOfferingTab({ asset }: { asset: CollectorWorkspaceAsset }) {
  const services = useAppServices();
  const client = useQueryClient();
  const assetId = asset.assetId;
  const [percentage, setPercentage] = useState(25);
  const [custom, setCustom] = useState("");
  const selectedBps = Math.round((Number(custom || percentage) || 0) * 100);
  const eligible = Boolean(assetId && asset.submissionStatus === "APPROVED");
  const offering = useQuery({
    queryKey: ["collector", "initial-offering", assetId],
    queryFn: () => services.repositories.collectorWorkspace.getInitialOffering(assetId!),
    enabled: eligible,
    retry: false,
    staleTime: 15_000,
  });
  const preview = useQuery({
    queryKey: ["collector", "initial-offering-preview", assetId, selectedBps],
    queryFn: () =>
      services.repositories.collectorWorkspace.getInitialOfferingPreview(assetId!, selectedBps),
    enabled: eligible && selectedBps > 0 && selectedBps <= 10_000,
    retry: false,
    staleTime: 15_000,
  });
  const existing = offering.data;
  const canEdit =
    !existing || existing.status === "AWAITING_APPROVAL" || existing.status === "CHANGES_REQUESTED";
  const save = useMutation({
    mutationFn: () => {
      const units = preview.data?.offeredUnits;
      if (!units) throw new Error("Choose a valid offering percentage first.");
      return existing
        ? services.repositories.collectorWorkspace.updateInitialOffering(existing.offeringId, units)
        : services.repositories.collectorWorkspace.proposeInitialOffering(assetId!, units);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["collector", "initial-offering", assetId] });
      void client.invalidateQueries({
        queryKey: ["collector", "initial-offering-preview", assetId],
      });
    },
  });

  if (!eligible) {
    return (
      <section className="collector-offering-empty">
        <span className="collector-offering-icon">
          <Info aria-hidden="true" />
        </span>
        <div>
          <h3>Initial offering</h3>
          <p>
            Once your collectible is approved and secured, you can choose whether to offer part of
            it through Slice.
          </p>
        </div>
      </section>
    );
  }
  if (offering.isLoading)
    return <p className="collector-detail-muted">Loading offering options…</p>;
  return (
    <div className="collector-offering-stack">
      <section className="collector-offering-intro">
        <div>
          <span className="collector-detail-kicker">Collector offering</span>
          <h3>Choose the portion you want to offer</h3>
          <p>
            You keep the rest. Slice turns the offered portion into clear ownership units and shows
            the complete economics before you submit it for review.
          </p>
        </div>
        <span
          className={`collector-offering-status is-${(existing?.status ?? "DRAFT").toLowerCase()}`}
        >
          {statusLabel(existing?.status ?? "DRAFT")}
        </span>
      </section>
      {existing?.changeRequestReason ? (
        <div className="collector-offering-callout">
          <strong>Changes requested</strong>
          <span>{existing.changeRequestReason}</span>
        </div>
      ) : null}
      {existing && !canEdit ? (
        <OfferingSummary offering={existing} />
      ) : (
        <>
          <div className="collector-offering-choice-row" aria-label="Choose offered percentage">
            {choices.map((value) => (
              <button
                key={value}
                type="button"
                className={!custom && percentage === value ? "is-active" : ""}
                onClick={() => {
                  setPercentage(value);
                  setCustom("");
                }}
              >
                {value}%
              </button>
            ))}
            <label className="collector-offering-custom">
              Custom
              <input
                inputMode="decimal"
                value={custom}
                placeholder="%"
                onChange={(event) => setCustom(event.target.value.replace(/[^0-9.]/g, ""))}
              />
            </label>
          </div>
          {preview.isLoading ? (
            <p className="collector-detail-muted">Calculating your preview…</p>
          ) : null}
          {preview.data ? (
            <OfferingPreview preview={preview.data} />
          ) : preview.isError ? (
            <p className="collector-form-error">
              This percentage is not available for the approved supply.
            </p>
          ) : null}
          <div className="collector-offering-confirm">
            <strong>Confirmation</strong>
            <p>
              I understand that Slice will review this offering before it opens. The collectible
              remains mine until a supported buyer settles a purchase.
            </p>
          </div>
          <button
            className="collector-button collector-button--primary"
            type="button"
            disabled={!preview.data || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending
              ? "Submitting…"
              : existing
                ? "Resubmit offering for review"
                : "Submit offering for review"}{" "}
            <ArrowRight aria-hidden="true" />
          </button>
          {save.isError ? (
            <p className="collector-form-error">
              We couldn&apos;t save this offering. Review the terms and try again.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function OfferingPreview({ preview }: { preview: InitialOfferingPreview }) {
  return (
    <div className="collector-offering-preview">
      <div className="collector-offering-preview__hero">
        <span>You offer</span>
        <strong>{formatPercentage(preview.offeredPercentageBps)}</strong>
        <small>{preview.offeredUnits} units</small>
      </div>
      <dl>
        <PreviewField
          label="Slice valuation"
          value={formatMinorAmount(preview.valuationMinor, preview.currency)}
        />
        <PreviewField
          label="Price per unit"
          value={formatMinorAmount(preview.pricePerUnitMinor, preview.currency)}
        />
        <PreviewField
          label="Gross proceeds"
          value={formatMinorAmount(preview.grossOfferingMinor, preview.currency)}
        />
        <PreviewField
          label="Fees"
          value={
            preview.feeMinor === "0"
              ? "No fee configured"
              : formatMinorAmount(preview.feeMinor, preview.currency)
          }
        />
        <PreviewField
          label="Estimated collector proceeds"
          value={formatMinorAmount(preview.netOfferingMinor, preview.currency)}
          accent
        />
        <PreviewField
          label="You retain"
          value={`${formatPercentage(preview.retainedPercentageBps)} · ${preview.retainedUnits} units`}
        />
      </dl>
    </div>
  );
}

function OfferingSummary({ offering }: { offering: InitialOfferingProjection }) {
  return (
    <div className="collector-offering-preview collector-offering-preview--summary">
      <div className="collector-offering-preview__hero">
        <span>Submitted offering</span>
        <strong>{formatPercentage(offering.offeredPercentageBps)}</strong>
        <small>{offering.offeredUnits} units</small>
      </div>
      <dl>
        <PreviewField
          label="Price per unit"
          value={formatMinorAmount(offering.pricePerUnitMinor, offering.currency)}
        />
        <PreviewField
          label="Gross proceeds"
          value={formatMinorAmount(offering.grossOfferingMinor, offering.currency)}
        />
        <PreviewField
          label="Estimated collector proceeds"
          value={formatMinorAmount(offering.netOfferingMinor, offering.currency)}
          accent
        />
        <PreviewField
          label="You retain"
          value={`${formatPercentage(offering.retainedPercentageBps)} · ${offering.retainedUnits} units`}
        />
      </dl>
    </div>
  );
}

function PreviewField({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className={accent ? "is-accent" : ""}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatPercentage(bps: number) {
  return `${(bps / 100).toLocaleString("en-GB", { maximumFractionDigits: 2 })}%`;
}

function statusLabel(value: string) {
  return value === "DRAFT"
    ? "Not submitted"
    : value
        .toLowerCase()
        .replaceAll("_", " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
