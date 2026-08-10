import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ApiError } from "@/api/http-client";
import { useSession } from "@/auth/use-session";
import { useAppServices } from "@/providers/AppServicesProvider";

export const Route = createFileRoute("/submissions/$id")({ component: SubmissionDetailPage });

function SubmissionDetailPage() {
  const { id } = Route.useParams();
  const services = useAppServices();
  const session = useSession();
  const client = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const detail = useQuery({
    queryKey: ["submissions", id],
    queryFn: () => services.repositories.submissions.getOwn(id),
    enabled: session.isAuthenticated,
  });
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
        declaredMetadata: {
          name: String(form.get("name") ?? "").trim(),
          ...(String(form.get("manufacturer") ?? "").trim()
            ? { manufacturer: String(form.get("manufacturer")).trim() }
            : {}),
          ...(String(form.get("year") ?? "").trim()
            ? { year: String(form.get("year")).trim() }
            : {}),
          ...(String(form.get("details") ?? "").trim()
            ? { details: String(form.get("details")).trim() }
            : {}),
          ...(String(form.get("condition") ?? "").trim()
            ? { condition: String(form.get("condition")).trim() }
            : {}),
          ...(String(form.get("certificationNumber") ?? "").trim()
            ? { certificationNumber: String(form.get("certificationNumber")).trim() }
            : {}),
          ...(String(form.get("cardNumber") ?? "").trim()
            ? { cardNumber: String(form.get("cardNumber")).trim() }
            : {}),
          ...(String(form.get("language") ?? "").trim()
            ? { language: String(form.get("language")).trim() }
            : {}),
        },
      }),
    onSuccess: () => {
      setNotice("Saved from the authoritative submission service.");
      refresh();
    },
  });
  const submit = useMutation({
    mutationFn: () => services.repositories.submissions.submit(id, detail.data!.version),
    onSuccess: () => {
      setNotice("Submission sent for review.");
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
    mutationFn: ({ slot, file }: { slot: string; file: File }) =>
      services.repositories.submissions.createMediaIntent(id, { slot, file }),
    onSuccess: () => {
      setNotice("Evidence uploaded and checked by the approved submission storage workflow.");
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (mediaId: string) =>
      services.repositories.submissions.removeMedia(id, mediaId, detail.data!.version),
    onSuccess: refresh,
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
    return <State title="Loading submission" detail="Retrieving its authoritative status." />;
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
  const actionError = update.error ?? submit.error ?? cancel.error ?? media.error ?? remove.error;
  return (
    <main className="page-shell space-y-7 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="page-kicker">Private asset submission</p>
          <h1 className="page-title mt-2">
            {String(item.declaredMetadata?.name ?? "Untitled asset")}
          </h1>
          <p className="mt-2 text-sm text-subtle">
            Status: <strong>{item.status.replaceAll("_", " ")}</strong>
            {item.decisionCode ? ` — ${item.decisionCode.replaceAll("_", " ")}` : ""}
          </p>
        </div>
        <Link to="/list" className="text-sm font-semibold text-accent">
          Back to submissions
        </Link>
      </header>
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-positive/30 bg-positive/10 p-3 text-sm"
        >
          {notice}
        </p>
      )}
      {actionError && (
        <p
          role="alert"
          className="rounded-lg border border-negative/30 bg-negative/10 p-3 text-sm text-negative"
        >
          The requested server action was not completed. Refresh and try again.
        </p>
      )}
      <section className="rounded-2xl border border-border bg-elevated p-6">
        <h2 className="text-lg font-semibold">Submission details</h2>
        {editable ? (
          <form
            className="mt-4 grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              update.mutate(new FormData(event.currentTarget));
            }}
          >
            <Field
              name="name"
              label="Asset name"
              defaultValue={String(item.declaredMetadata?.name ?? "")}
              required
            />
            <Field
              name="manufacturer"
              label="Manufacturer or issuer"
              defaultValue={String(item.declaredMetadata?.manufacturer ?? "")}
            />
            <Field
              name="year"
              label="Year"
              defaultValue={String(item.declaredMetadata?.year ?? "")}
            />
            <Field
              name="condition"
              label="Condition / grade"
              defaultValue={String(item.declaredMetadata?.condition ?? "")}
            />
            <Field
              name="certificationNumber"
              label="Certification number"
              defaultValue={String(item.declaredMetadata?.certificationNumber ?? "")}
            />
            <Field
              name="cardNumber"
              label="Edition / reference number"
              defaultValue={String(item.declaredMetadata?.cardNumber ?? "")}
            />
            <Field
              name="language"
              label="Language"
              defaultValue={String(item.declaredMetadata?.language ?? "")}
            />
            <label className="grid gap-2 text-sm font-medium md:col-span-2">
              Description
              <textarea
                name="details"
                rows={4}
                defaultValue={String(item.declaredMetadata?.details ?? "")}
              />
            </label>
            <input type="hidden" name="categoryId" value={item.categoryId} />
            <button className="button-primary w-fit" disabled={update.isPending}>
              {update.isPending ? "Saving…" : "Save changes"}
            </button>
          </form>
        ) : (
          <SafeMetadata metadata={item.declaredMetadata} />
        )}
      </section>
      <section className="rounded-2xl border border-border bg-elevated p-6">
        <h2 className="text-lg font-semibold">Evidence</h2>
        <p className="mt-1 text-sm text-subtle">
          Required evidence slots are front and back. File acceptance and scanning remain
          backend-controlled.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {["front", "back"].map((slot) => {
            const existing = item.media.find(
              (entry) => entry.slot === slot && entry.status !== "DELETED",
            );
            return (
              <div key={slot} className="rounded-lg border border-border p-3">
                <p className="text-sm font-semibold capitalize">{slot}</p>
                <p className="mt-1 text-xs text-muted">
                  {existing
                    ? `${existing.status.replaceAll("_", " ")} · ${existing.mimeType}`
                    : "No evidence selected"}
                </p>
                {editable && !existing && (
                  <label className="mt-3 block text-sm font-medium">
                    Select evidence
                    <input
                      aria-label={`Select ${slot} evidence`}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="mt-2 block w-full text-xs"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) media.mutate({ slot, file });
                      }}
                    />
                  </label>
                )}
                {editable && existing && (
                  <button
                    type="button"
                    className="mt-3 text-sm font-semibold text-negative"
                    onClick={() => remove.mutate(existing.id)}
                  >
                    Remove evidence
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
      <section className="flex flex-wrap gap-3 rounded-2xl border border-border bg-elevated p-6">
        {editable && (
          <button
            type="button"
            className="button-primary"
            disabled={submit.isPending}
            onClick={() => submit.mutate()}
          >
            {item.status === "CHANGES_REQUESTED" ? "Resubmit for review" : "Submit for review"}
          </button>
        )}
        {editable && !confirmCancel && (
          <button type="button" className="button-secondary" onClick={() => setConfirmCancel(true)}>
            Cancel submission
          </button>
        )}
        {editable && confirmCancel && (
          <>
            <span className="self-center text-sm text-subtle">Cancel this submission?</span>
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
              Keep it
            </button>
          </>
        )}
      </section>
    </main>
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
function SafeMetadata({ metadata }: { metadata: Record<string, unknown> | null }) {
  return (
    <dl className="mt-4 grid gap-3 text-sm">
      {Object.entries(metadata ?? {})
        .filter(([key]) =>
          [
            "name",
            "manufacturer",
            "year",
            "details",
            "condition",
            "certificationNumber",
            "cardNumber",
            "language",
          ].includes(key),
        )
        .map(([key, value]) => (
          <div key={key}>
            <dt className="font-medium capitalize">{key}</dt>
            <dd className="text-subtle">{String(value)}</dd>
          </div>
        ))}
    </dl>
  );
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
