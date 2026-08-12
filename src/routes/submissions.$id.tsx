import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, CircleAlert, FileUp, ImagePlus, Trash2, UploadCloud } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import { ApiError } from "@/api/http-client";
import { useSession } from "@/auth/use-session";
import type { SubmissionMedia } from "@/domain/submission";
import { useAppServices } from "@/providers/AppServicesProvider";
import { mediaStatusLabel, submissionName, submissionStatusLabel } from "./-list-presentation";

export const Route = createFileRoute("/submissions/$id")({ component: SubmissionDetailPage });

const REQUIRED_EVIDENCE_SLOTS = ["front", "back"] as const;
const ACCEPTED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

function SubmissionDetailPage() {
  const { id } = Route.useParams();
  const services = useAppServices();
  const session = useSession();
  const client = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const previewUrls = useRef<Record<string, string>>({});
  const detail = useQuery({
    queryKey: ["submissions", id],
    queryFn: () => services.repositories.submissions.getOwn(id),
    enabled: session.isAuthenticated,
  });
  const categories = useQuery({
    queryKey: ["catalogue", "submission-categories"],
    queryFn: () => services.repositories.catalogue.listSubmissionCategories(),
    enabled: session.isAuthenticated,
  });

  useEffect(
    () => () => {
      Object.values(previewUrls.current).forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  const refresh = () =>
    void Promise.all([
      detail.refetch(),
      client.invalidateQueries({ queryKey: ["submissions", "mine"] }),
    ]);
  const update = useMutation({
    mutationFn: (form: FormData) =>
      services.repositories.submissions.updateDraft(id, {
        version: detail.data!.version,
        categoryId: String(form.get("categoryId") ?? detail.data!.categoryId),
        declaredMetadata: metadataFromForm(form),
      }),
    onSuccess: () => {
      setNotice("Draft saved. You can continue editing it whenever it is eligible for changes.");
      setLocalError(null);
      refresh();
      setStep(2);
    },
  });
  const submit = useMutation({
    mutationFn: () => services.repositories.submissions.submit(id, detail.data!.version),
    onSuccess: () => {
      setNotice(
        "Submission sent for review. It will not be published until the approved review workflow completes.",
      );
      setLocalError(null);
      refresh();
    },
  });
  const cancel = useMutation({
    mutationFn: () => services.repositories.submissions.cancel(id, detail.data!.version),
    onSuccess: () => {
      setNotice("Submission cancelled.");
      setConfirmCancel(false);
      refresh();
    },
  });
  const media = useMutation({
    mutationFn: async ({
      slot,
      file,
      replaceMediaId,
    }: {
      slot: string;
      file: File;
      replaceMediaId?: string;
    }) => {
      if (replaceMediaId) {
        const current = await services.repositories.submissions.getOwn(id);
        await services.repositories.submissions.removeMedia(id, replaceMediaId, current.version);
      }
      return services.repositories.submissions.createMediaIntent(id, { slot, file });
    },
    onSuccess: (_detail, variables) => {
      setNotice(
        `${slotLabel(variables.slot)} image uploaded. Its review readiness is shown below.`,
      );
      setLocalError(null);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: async ({ mediaId }: { mediaId: string; slot: string }) => {
      const current = await services.repositories.submissions.getOwn(id);
      return services.repositories.submissions.removeMedia(id, mediaId, current.version);
    },
    onSuccess: (_detail, variables) => {
      setNotice("Evidence removed from this draft.");
      clearPreview(variables.slot, previewUrls, setPreviews);
      refresh();
    },
  });

  if (!session.isAuthenticated || (detail.error instanceof ApiError && detail.error.status === 401))
    return (
      <State
        title="Sign in to view this submission"
        detail="Submissions are private to their owner."
        login
      />
    );
  if (detail.isLoading)
    return (
      <State title="Loading submission" detail="Retrieving its saved details and review status." />
    );
  if (detail.isError || !detail.data)
    return (
      <State
        title="Submission unavailable"
        detail="This submission could not be loaded, or does not belong to you."
        retry={() => void detail.refetch()}
      />
    );

  const item = detail.data;
  const editable = item.status === "DRAFT" || item.status === "CHANGES_REQUESTED";
  const cancellable = editable || item.status === "SUBMITTED";
  const actionError = update.error ?? submit.error ?? cancel.error ?? media.error ?? remove.error;
  const categoryName =
    categories.data?.find((category) => category.id === item.categoryId)?.name ?? "Saved category";
  const activeMedia = REQUIRED_EVIDENCE_SLOTS.map((slot) => findActiveMedia(item.media, slot));
  const evidenceReady = activeMedia.every((entry) => entry?.status === "SAFE");
  const detailsReady = Boolean(metadataValue(item.declaredMetadata, "name") && item.categoryId);

  const beginUpload = (slot: string, file: File, existing?: SubmissionMedia) => {
    const error = fileValidationError(file);
    if (error) {
      setLocalError(error);
      return;
    }
    setPreview(slot, file, previewUrls, setPreviews);
    media.mutate({ slot, file, replaceMediaId: existing?.id });
  };

  return (
    <main className="page-shell space-y-7 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="page-kicker">Private asset submission</p>
          <h1 className="page-title mt-2">{submissionName(item.declaredMetadata)}</h1>
          <p className="mt-2 text-sm text-subtle">
            <strong>{submissionStatusLabel(item.status)}</strong>
            {item.status === "SUBMITTED" ? " — awaiting review" : ""}
          </p>
        </div>
        <Link to="/list" className="text-sm font-semibold text-accent">
          Back to submissions
        </Link>
      </header>

      {notice ? <Notice>{notice}</Notice> : null}
      {localError ? <ErrorNotice>{localError}</ErrorNotice> : null}
      {actionError ? <ErrorNotice>{friendlyError(actionError)}</ErrorNotice> : null}

      {item.status === "SUBMITTED" ? (
        <section className="rounded-2xl border border-positive/30 bg-positive/10 p-6">
          <p className="page-kicker">Submission received</p>
          <h2 className="mt-2 text-xl font-semibold">{submissionName(item.declaredMetadata)}</h2>
          <p className="mt-2 text-sm text-subtle">
            Reference {item.id}. Your asset is in review; it is not published or market live.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/submissions/$id" params={{ id }} className="button-primary">
              View submission
            </Link>
            <Link to="/list" className="button-secondary">
              Submit another asset
            </Link>
            <Link to="/dashboard" className="button-secondary">
              Back to dashboard
            </Link>
          </div>
        </section>
      ) : null}

      <SubmissionSteps
        step={step}
        detailsReady={detailsReady}
        evidenceReady={evidenceReady}
        onSelect={setStep}
      />

      {step === 1 ? (
        <section className="rounded-2xl border border-border bg-elevated p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Asset details</h2>
              <p className="mt-1 text-sm text-subtle">Save the draft before moving on to review.</p>
            </div>
            <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-subtle">
              {categoryName}
            </span>
          </div>
          {editable ? (
            <form
              className="mt-5 grid gap-4 md:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                update.mutate(new FormData(event.currentTarget));
              }}
            >
              <label className="grid gap-2 text-sm font-medium">
                Asset category
                <select name="categoryId" defaultValue={item.categoryId}>
                  {!categories.data?.some((category) => category.id === item.categoryId) ? (
                    <option value={item.categoryId}>{categoryName}</option>
                  ) : null}
                  {categories.data?.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                name="name"
                label="Asset title"
                defaultValue={metadataValue(item.declaredMetadata, "name")}
                required
              />
              <Field
                name="manufacturer"
                label="Brand, manufacturer or creator"
                defaultValue={metadataValue(item.declaredMetadata, "manufacturer")}
              />
              <Field
                name="year"
                label="Year"
                defaultValue={metadataValue(item.declaredMetadata, "year")}
              />
              <Field
                name="condition"
                label="Condition"
                defaultValue={metadataValue(item.declaredMetadata, "condition")}
              />
              <Field
                name="grader"
                label="Grading company"
                defaultValue={metadataValue(item.declaredMetadata, "grader")}
              />
              <Field
                name="grade"
                label="Grade"
                defaultValue={metadataValue(item.declaredMetadata, "grade")}
              />
              <Field
                name="certificationNumber"
                label="Certification number"
                defaultValue={metadataValue(item.declaredMetadata, "certificationNumber")}
              />
              <Field
                name="cardNumber"
                label="Set, edition or reference number"
                defaultValue={metadataValue(item.declaredMetadata, "cardNumber")}
              />
              <Field
                name="language"
                label="Language"
                defaultValue={metadataValue(item.declaredMetadata, "language")}
              />
              <label className="grid gap-2 text-sm font-medium md:col-span-2">
                Description
                <textarea
                  name="details"
                  rows={4}
                  defaultValue={metadataValue(item.declaredMetadata, "details")}
                  maxLength={2000}
                />
              </label>
              <button className="button-primary w-fit" disabled={update.isPending}>
                {update.isPending ? "Saving…" : "Save draft"}
              </button>
            </form>
          ) : (
            <SafeMetadata metadata={item.declaredMetadata} categoryName={categoryName} />
          )}
        </section>
      ) : null}

      {step === 2 ? <TermsStep onBack={() => setStep(1)} onContinue={() => setStep(3)} /> : null}

      {step === 3 ? (
        <section className="rounded-2xl border border-border bg-elevated p-6">
          <div>
            <h2 className="text-lg font-semibold">Front and back images</h2>
            <p className="mt-1 text-sm text-subtle">
              Upload a clear image of each side. File validation and review readiness remain
              controlled by the submission service.
            </p>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {REQUIRED_EVIDENCE_SLOTS.map((slot) => {
              const existing = findActiveMedia(item.media, slot);
              const preview = previews[slot];
              return (
                <EvidenceCard
                  key={slot}
                  slot={slot}
                  existing={existing}
                  preview={preview}
                  editable={editable}
                  uploadPending={media.isPending}
                  removePending={remove.isPending}
                  onSelect={(file) => beginUpload(slot, file, existing)}
                  onRemove={() => existing && remove.mutate({ mediaId: existing.id, slot })}
                />
              );
            })}
          </div>
          <div className="mt-6 flex gap-3">
            <button type="button" className="button-secondary" onClick={() => setStep(2)}>
              Back
            </button>
            <button
              type="button"
              className="button-primary"
              disabled={!evidenceReady || media.isPending}
              onClick={() => setStep(4)}
            >
              Continue to review
            </button>
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="rounded-2xl border border-border bg-elevated p-6">
          <h2 className="text-lg font-semibold">Review and submit</h2>
          <p className="mt-1 text-sm text-subtle">
            Submitting sends this saved submission into review. It does not publish the asset.
          </p>
          <SafeMetadata metadata={item.declaredMetadata} categoryName={categoryName} />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {REQUIRED_EVIDENCE_SLOTS.map((slot) => {
              const entry = findActiveMedia(item.media, slot);
              return (
                <div
                  key={slot}
                  className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm"
                >
                  {entry?.status === "SAFE" ? (
                    <Check className="size-4 text-positive" aria-hidden />
                  ) : (
                    <CircleAlert className="size-4 text-warning" aria-hidden />
                  )}
                  <span>
                    <strong>{slotLabel(slot)} image:</strong>{" "}
                    {entry ? mediaStatusLabel(entry.status) : "Required"}
                  </span>
                </div>
              );
            })}
          </div>
          {editable ? (
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" className="button-secondary" onClick={() => setStep(3)}>
                Edit media
              </button>
              <button
                type="button"
                className="button-primary"
                disabled={submit.isPending || media.isPending}
                onClick={() => {
                  if (!evidenceReady) {
                    setLocalError(
                      "Front and back images must both be marked ready before you submit this asset for review.",
                    );
                    return;
                  }
                  submit.mutate();
                }}
              >
                {item.status === "CHANGES_REQUESTED" ? "Resubmit for review" : "Submit for review"}
              </button>
              {cancellable && !confirmCancel ? (
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => setConfirmCancel(true)}
                >
                  Cancel submission
                </button>
              ) : null}
            </div>
          ) : null}
          {cancellable && confirmCancel ? (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="text-sm text-subtle">
                Cancel this submission? This cannot be undone from this screen.
              </span>
              <button
                type="button"
                className="button-secondary"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                Confirm cancel
              </button>
              <button
                type="button"
                className="text-sm font-semibold"
                onClick={() => setConfirmCancel(false)}
              >
                Keep submission
              </button>
            </div>
          ) : null}
          {!editable && item.status !== "CANCELLED" ? (
            <p className="mt-5 rounded-lg border border-border bg-surface p-3 text-sm text-subtle">
              This submission is currently {submissionStatusLabel(item.status).toLowerCase()}.
              Editing is available only when the review workflow permits changes.
            </p>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

function SubmissionSteps({
  step,
  detailsReady,
  evidenceReady,
  onSelect,
}: {
  step: 1 | 2 | 3 | 4;
  detailsReady: boolean;
  evidenceReady: boolean;
  onSelect: (step: 1 | 2 | 3 | 4) => void;
}) {
  const steps = [
    [1, "Asset details", true],
    [2, "Details & terms", detailsReady],
    [3, "Media & documents", detailsReady],
    [4, "Review & submit", evidenceReady],
  ] as const;
  return (
    <nav aria-label="Submission steps" className="rounded-2xl border border-border bg-elevated p-3">
      <ol className="grid gap-2 sm:grid-cols-4">
        {steps.map(([number, label, available]) => (
          <li key={number}>
            <button
              type="button"
              disabled={!available}
              onClick={() => onSelect(number)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm ${step === number ? "bg-accent text-accent-foreground" : available ? "hover:bg-surface" : "cursor-not-allowed text-muted"}`}
            >
              <span className="mr-2 font-mono text-xs">{number}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function TermsStep({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  return (
    <section className="rounded-2xl border border-border bg-elevated p-6">
      <p className="page-kicker">Details &amp; terms</p>
      <h2 className="mt-2 text-lg font-semibold">Submission terms</h2>
      <p className="mt-2 text-sm text-subtle">
        Your saved asset details are private. Slice reviews collectibles separately before any
        valuation, custody, publication, or market availability decision.
      </p>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-subtle">Valuation</dt>
          <dd className="mt-1 font-medium">Set through staff review</dd>
        </div>
        <div>
          <dt className="text-xs text-subtle">Custody</dt>
          <dd className="mt-1 font-medium">Arranged only after review</dd>
        </div>
      </dl>
      <div className="mt-6 flex gap-3">
        <button type="button" className="button-secondary" onClick={onBack}>
          Back
        </button>
        <button type="button" className="button-primary" onClick={onContinue}>
          Save and continue
        </button>
      </div>
    </section>
  );
}

function EvidenceCard({
  slot,
  existing,
  preview,
  editable,
  uploadPending,
  removePending,
  onSelect,
  onRemove,
}: {
  slot: string;
  existing?: SubmissionMedia;
  preview?: string;
  editable: boolean;
  uploadPending: boolean;
  removePending: boolean;
  onSelect: (file: File) => void;
  onRemove: () => void;
}) {
  const inputId = `submission-${slot}-file`;
  return (
    <article className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex min-h-40 items-center justify-center border-b border-border bg-elevated p-4">
        {preview ? (
          <img
            src={preview}
            alt={`Selected ${slot} evidence preview`}
            className="max-h-52 rounded-lg object-contain"
          />
        ) : existing ? (
          <div className="text-center">
            <FileUp className="mx-auto size-8 text-accent" aria-hidden />
            <p className="mt-2 text-sm font-semibold">{slotLabel(slot)} image saved</p>
            <p className="mt-1 text-xs text-subtle">{mediaStatusLabel(existing.status)}</p>
          </div>
        ) : (
          <div className="text-center">
            <ImagePlus className="mx-auto size-8 text-muted" aria-hidden />
            <p className="mt-2 text-sm font-semibold">No {slot} image yet</p>
            <p className="mt-1 text-xs text-subtle">JPG, PNG or WebP up to 10 MB</p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-semibold">{slotLabel(slot)} image</p>
          {existing ? (
            <p className="mt-1 text-xs text-subtle">
              {mediaStatusLabel(existing.status)} · {formatBytes(existing.sizeBytes)}
            </p>
          ) : null}
        </div>
        {editable ? (
          <div className="flex gap-2">
            <label htmlFor={inputId} className="button-secondary cursor-pointer text-sm">
              {uploadPending ? "Uploading…" : existing ? "Replace" : "Upload"}
              <input
                id={inputId}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={uploadPending}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) onSelect(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {existing ? (
              <button
                type="button"
                className="button-secondary text-negative"
                disabled={removePending || uploadPending}
                onClick={onRemove}
                aria-label={`Remove ${slot} image`}
              >
                <Trash2 className="size-4" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function Field({
  name,
  label,
  defaultValue,
  required = false,
}: {
  name: string;
  label: string;
  defaultValue: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <input name={name} defaultValue={defaultValue} required={required} maxLength={160} />
    </label>
  );
}

function SafeMetadata({
  metadata,
  categoryName,
}: {
  metadata: Record<string, unknown> | null;
  categoryName: string;
}) {
  const rows = [
    ["Asset category", categoryName],
    ["Asset title", metadataValue(metadata, "name")],
    ["Brand, manufacturer or creator", metadataValue(metadata, "manufacturer")],
    ["Year", metadataValue(metadata, "year")],
    ["Condition", metadataValue(metadata, "condition")],
    ["Grading company", metadataValue(metadata, "grader")],
    ["Grade", metadataValue(metadata, "grade")],
    ["Certification number", metadataValue(metadata, "certificationNumber")],
    ["Set, edition or reference number", metadataValue(metadata, "cardNumber")],
    ["Language", metadataValue(metadata, "language")],
    ["Description", metadataValue(metadata, "details")],
  ].filter(([, value]) => Boolean(value));
  return (
    <dl className="mt-5 grid gap-4 text-sm md:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
          <dd className="mt-1 text-subtle">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Notice({ children }: { children: string }) {
  return (
    <p role="status" className="rounded-lg border border-positive/30 bg-positive/10 p-3 text-sm">
      <Check className="mr-2 inline size-4 text-positive" aria-hidden />
      {children}
    </p>
  );
}
function ErrorNotice({ children }: { children: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-negative/30 bg-negative/10 p-3 text-sm text-negative"
    >
      <CircleAlert className="mr-2 inline size-4" aria-hidden />
      {children}
    </p>
  );
}

function metadataFromForm(form: FormData) {
  const text = (key: string) => String(form.get(key) ?? "").trim();
  const optional = (key: string) => (text(key) ? { [key]: text(key) } : {});
  return {
    name: text("name"),
    ...optional("manufacturer"),
    ...optional("year"),
    ...optional("condition"),
    ...optional("grader"),
    ...optional("grade"),
    ...optional("certificationNumber"),
    ...optional("cardNumber"),
    ...optional("language"),
    ...optional("details"),
  };
}
function metadataValue(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : "";
}
function findActiveMedia(media: SubmissionMedia[], slot: string) {
  return media.find((entry) => entry.slot === slot && entry.status !== "DELETED");
}
function slotLabel(slot: string) {
  return slot.charAt(0).toUpperCase() + slot.slice(1);
}
function fileValidationError(file: File) {
  if (!ACCEPTED_MEDIA_TYPES.has(file.type))
    return "Choose a JPG, PNG or WebP image for this evidence slot.";
  if (file.size > MAX_MEDIA_BYTES) return "Each evidence image must be 10 MB or smaller.";
  return null;
}
function setPreview(
  slot: string,
  file: File,
  urls: MutableRefObject<Record<string, string>>,
  setPreviews: Dispatch<SetStateAction<Record<string, string>>>,
) {
  const oldUrl = urls.current[slot];
  if (oldUrl) URL.revokeObjectURL(oldUrl);
  const url = URL.createObjectURL(file);
  urls.current[slot] = url;
  setPreviews((current) => ({ ...current, [slot]: url }));
}
function clearPreview(
  slot: string,
  urls: MutableRefObject<Record<string, string>>,
  setPreviews: Dispatch<SetStateAction<Record<string, string>>>,
) {
  const oldUrl = urls.current[slot];
  if (oldUrl) URL.revokeObjectURL(oldUrl);
  delete urls.current[slot];
  setPreviews((current) => {
    const next = { ...current };
    delete next[slot];
    return next;
  });
}
function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
function friendlyError(error: unknown) {
  if (error instanceof ApiError) return error.message;
  return "The requested action could not be completed. Check the saved details and try again.";
}

function State({
  title,
  detail,
  login,
  retry,
}: {
  title: string;
  detail: string;
  login?: boolean;
  retry?: () => void;
}) {
  return (
    <main className="page-shell py-16">
      <section className="rounded-2xl border border-border bg-elevated p-8 text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-subtle">{detail}</p>
        {login ? (
          <Link to="/login" className="mt-5 inline-block text-sm font-semibold text-accent">
            Sign in
          </Link>
        ) : null}
        {retry ? (
          <button type="button" onClick={retry} className="mt-5 text-sm font-semibold text-accent">
            Retry
          </button>
        ) : null}
      </section>
    </main>
  );
}
