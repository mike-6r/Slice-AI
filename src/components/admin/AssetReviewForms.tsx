import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { SubmissionReviewDetail } from "@/domain/submission";
import { useAppServices } from "@/providers/AppServicesProvider";
import { canReviewCommand } from "./assetReviewGuide";

type Props = { review: SubmissionReviewDetail; busy: boolean; onSaved: () => Promise<void> };

export function AssetReviewForms({
  mode,
  ...props
}: Props & { mode: "identity" | "certification" }) {
  return mode === "identity" ? <IdentityForm {...props} /> : <CertificationForm {...props} />;
}

function IdentityForm({ review, busy, onSaved }: Props) {
  const services = useAppServices();
  const [fields, setFields] = useState({
    name: review.collectible?.title ?? "",
    year: review.collectible?.year ?? "",
    set: review.collectible?.set ?? "",
    cardNumber: review.collectible?.cardNumber ?? "",
    variant: review.collectible?.variant ?? "",
    note: "",
  });
  const allowed = canReviewCommand(review, "canEditReviewIdentity");
  const save = useMutation({
    mutationKey: ["admin", "asset-record", "write"],
    mutationFn: () => {
      if (!allowed) throw new Error("This reviewer cannot edit identity.");
      return services.repositories.reviews.saveIdentity(review.id, {
        ...fields,
        name: fields.name.trim(),
        note: fields.note.trim(),
        version: review.version,
      });
    },
    onSuccess: onSaved,
  });
  return (
    <form
      className="asset-guide__form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && allowed && fields.name.trim() && fields.note.trim().length >= 5) save.mutate();
      }}
    >
      <h3>Save the reviewed identity</h3>
      <p>Changes affect the reviewed identity, not the collector's original submission.</p>
      <fieldset disabled={busy || !allowed}>
        <div className="asset-guide__fields">
          {(
            [
              ["name", "Item name"],
              ["year", "Year"],
              ["set", "Set"],
              ["cardNumber", "Card number"],
              ["variant", "Variant"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                required={key === "name"}
                value={fields[key]}
                onChange={(event) => setFields({ ...fields, [key]: event.target.value })}
              />
            </label>
          ))}
        </div>
        <label>
          What did you check or correct?
          <textarea
            required
            minLength={5}
            value={fields.note}
            onChange={(event) => setFields({ ...fields, note: event.target.value })}
            placeholder="Describe the evidence used to confirm or correct the identity."
          />
        </label>
        <button
          className="is-primary"
          type="submit"
          disabled={!fields.name.trim() || fields.note.trim().length < 5}
        >
          Save reviewed identity
        </button>
      </fieldset>
      {!allowed ? (
        <p>Identity is read-only for this reviewer. Check the review owner and permissions.</p>
      ) : null}
      <SaveStatus error={save.error} saved={save.isSuccess} />
    </form>
  );
}

function CertificationForm({ review, busy, onSaved }: Props) {
  const services = useAppServices();
  const [confirmed, setConfirmed] = useState(false);
  const [fields, setFields] = useState({
    name: review.collectible?.title ?? "",
    year: review.collectible?.year ?? "",
    set: review.collectible?.set ?? "",
    cardNumber: review.collectible?.cardNumber ?? "",
    grade: "",
    reference: "",
  });
  const allowed = canReviewCommand(review, "canReviewCertification");
  const save = useMutation({
    mutationKey: ["admin", "asset-record", "write"],
    mutationFn: () => {
      if (!allowed || !confirmed)
        throw new Error("Confirm the official certification evidence before saving.");
      return services.repositories.reviews.manualVerifyCertification(review.id, {
        verifiedIdentity: {
          name: fields.name.trim(),
          year: fields.year.trim(),
          set: fields.set.trim(),
          cardNumber: fields.cardNumber.trim(),
          companyCode: review.collectible?.grader ?? "",
        },
        verifiedGrade: fields.grade.trim(),
        providerReference: fields.reference.trim(),
      });
    },
    onSuccess: onSaved,
  });
  if (
    review.readiness?.progress.find((item) => item.key === "certification")?.status ===
    "NOT_APPLICABLE"
  )
    return (
      <p className="asset-guide__notice">
        No certificate is required for this item. Continue to the decision step.
      </p>
    );
  if (!review.certificationVerification)
    return (
      <p className="asset-guide__notice">
        No certification record is available. Check the grading details; do not assume verification
        has passed.
      </p>
    );
  return (
    <form
      className="asset-guide__form"
      onSubmit={(event) => {
        event.preventDefault();
        if (
          !busy &&
          allowed &&
          confirmed &&
          fields.grade.trim() &&
          fields.reference.trim() &&
          fields.name.trim()
        )
          save.mutate();
      }}
    >
      <h3>Record an official certification check</h3>
      <p>
        Copy the verified details from the grading company's official record. Report a mismatch
        instead of confirming incorrect details.
      </p>
      {review.certificationVerification.officialVerificationUrl ? (
        <a
          href={review.certificationVerification.officialVerificationUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open official verification
        </a>
      ) : null}
      <fieldset disabled={busy || !allowed}>
        <div className="asset-guide__fields">
          {(
            [
              ["name", "Verified item name"],
              ["year", "Verified year"],
              ["set", "Verified set"],
              ["cardNumber", "Verified card number"],
              ["grade", "Verified grade"],
              ["reference", "Official source / reference"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                required={["name", "grade", "reference"].includes(key)}
                value={fields[key]}
                onChange={(event) => {
                  setConfirmed(false);
                  setFields({ ...fields, [key]: event.target.value });
                }}
              />
            </label>
          ))}
        </div>
        <label className="asset-guide__checkbox">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />{" "}
          I checked these details against the official certification record.
        </label>
        <button
          className="is-primary"
          type="submit"
          disabled={
            !confirmed || !fields.grade.trim() || !fields.reference.trim() || !fields.name.trim()
          }
        >
          Save certification check
        </button>
      </fieldset>
      {!allowed ? <p>Certification changes are not permitted for this reviewer.</p> : null}
      <SaveStatus error={save.error} saved={save.isSuccess} />
    </form>
  );
}

export function ReviewFindings({ review, busy, onSaved }: Props) {
  const services = useAppServices();
  const [reason, setReason] = useState("");
  const save = useMutation({
    mutationKey: ["admin", "asset-record", "write"],
    mutationFn: (findingId: string) =>
      services.repositories.reviews.updateFinding(review.id, findingId, {
        version: review.version,
        status: "RESOLVED",
        resolutionNote: reason.trim(),
      }),
    onSuccess: onSaved,
  });
  const findings = review.reviewFindings?.filter((item) => item.status === "OPEN") ?? [];
  if (!findings.length) return null;
  return (
    <div className="asset-guide__form">
      <h3>Open review findings</h3>
      <p>Resolve a finding only after checking that the underlying issue is corrected.</p>
      <label>
        How was the issue resolved?
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} />
      </label>
      {findings.map((finding) => (
        <div key={finding.id} className="asset-guide__finding">
          <strong>{finding.title}</strong>
          <p>{finding.detail}</p>
          <button
            type="button"
            disabled={
              busy || reason.trim().length < 5 || !canReviewCommand(review, "canResolveFinding")
            }
            onClick={() => save.mutate(finding.id)}
          >
            Record resolution
          </button>
        </div>
      ))}
      <SaveStatus error={save.error} saved={save.isSuccess} />
    </div>
  );
}

function SaveStatus({ error, saved }: { error: Error | null; saved: boolean }) {
  return error ? (
    <p role="alert">
      {error.message} Could not confirm this save. Refresh the record before retrying.
    </p>
  ) : saved ? (
    <p role="status">Saved. Progress reflects the latest server checks.</p>
  ) : null;
}
