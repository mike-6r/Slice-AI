import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Check,
  ChevronRight,
  CircleAlert,
  FileUp,
  ImagePlus,
  MapPin,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { useState } from "react";

import { ApiError } from "@/api/http-client";
import { useSession } from "@/auth/use-session";
import { useAppServices } from "@/providers/AppServicesProvider";
import { LISTING_STEPS, submissionName, SUBMISSION_EMPTY } from "./-list-presentation";

export const Route = createFileRoute("/list")({
  head: () => ({ meta: [{ title: "Submit an asset | Slice" }] }),
  component: SubmissionPage,
});

type ListingForm = {
  categoryId: string;
  name: string;
  manufacturer: string;
  year: string;
  condition: string;
  certificationNumber: string;
  cardNumber: string;
  language: string;
  details: string;
};
const blank: ListingForm = {
  categoryId: "",
  name: "",
  manufacturer: "",
  year: "",
  condition: "",
  certificationNumber: "",
  cardNumber: "",
  language: "",
  details: "",
};

export function SubmissionPage() {
  const services = useAppServices();
  const session = useSession();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState<ListingForm>(blank);
  const categories = useQuery({
    queryKey: ["catalogue", "submission-categories"],
    queryFn: () => services.repositories.catalogue.listSubmissionCategories(),
    enabled: session.isAuthenticated,
  });
  const drafts = useQuery({
    queryKey: ["submissions", "mine"],
    queryFn: () => services.repositories.submissions.listOwn({ limit: 20 }),
    enabled: session.isAuthenticated,
  });
  const create = useMutation({
    mutationFn: () =>
      services.repositories.submissions.createDraft({
        categoryId: form.categoryId,
        declaredMetadata: {
          name: form.name.trim(),
          ...(form.manufacturer.trim() ? { manufacturer: form.manufacturer.trim() } : {}),
          ...(form.year.trim() ? { year: form.year.trim() } : {}),
          ...(form.condition.trim() ? { condition: form.condition.trim() } : {}),
          ...(form.certificationNumber.trim()
            ? { certificationNumber: form.certificationNumber.trim() }
            : {}),
          ...(form.cardNumber.trim() ? { cardNumber: form.cardNumber.trim() } : {}),
          ...(form.language.trim() ? { language: form.language.trim() } : {}),
          ...(form.details.trim() ? { details: form.details.trim() } : {}),
        },
      }),
    onSuccess: async (draft) => {
      await client.invalidateQueries({ queryKey: ["submissions", "mine"] });
      await navigate({ to: "/submissions/$id", params: { id: draft.id } });
    },
  });
  const authRequired =
    !session.isAuthenticated || (drafts.error instanceof ApiError && drafts.error.status === 401);
  if (authRequired)
    return (
      <ListState
        title="Sign in to submit an asset"
        detail="Asset submissions belong to your private authenticated account."
        login
      />
    );
  if (categories.isLoading || drafts.isLoading) return <ListLoading />;
  if (categories.isError || drafts.isError)
    return (
      <ListState
        title="Submission workspace unavailable"
        detail="Your submission information could not be loaded safely."
        retry={() => {
          void categories.refetch();
          void drafts.refetch();
        }}
      />
    );
  const selectedCategory = categories.data?.find((category) => category.id === form.categoryId);
  const valid = Boolean(form.categoryId && form.name.trim());
  const checklist = [
    ["Add a clear title", Boolean(form.name.trim())],
    ["Choose an asset category", Boolean(form.categoryId)],
    ["Provide asset details", Boolean(form.details.trim() || form.condition.trim())],
    ["Add required evidence", false],
    ["Review before submitting", false],
  ] as const;
  const update = <K extends keyof ListingForm>(key: K, value: ListingForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <main className="list-page">
      <div className="list-shell">
        <ListSidebar drafts={drafts.data?.items ?? []} />
        <form
          className="list-workspace"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) create.mutate();
          }}
        >
          <header className="list-heading">
            <p className="page-kicker">Asset submission</p>
            <h1>Create your submission</h1>
            <p>
              Save an asset submission for Slice review. Publication, valuation, custody and
              marketplace availability are staff-controlled stages.
            </p>
          </header>
          <div className="list-grid">
            <div className="list-main">
              <Panel
                title="Basic information"
                detail="Provide the basic information about your asset."
              >
                <div className="list-form-grid">
                  <Field label="Asset title" required>
                    <input
                      value={form.name}
                      onChange={(e) => update("name", e.target.value)}
                      maxLength={160}
                      placeholder="Describe your collectible"
                      required
                    />
                  </Field>
                  <Field label="Asset category" required>
                    <select
                      value={form.categoryId}
                      onChange={(e) => update("categoryId", e.target.value)}
                      required
                    >
                      <option value="">Select category</option>
                      {categories.data?.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                    {!categories.data?.length ? (
                      <small className="list-inline-note">{SUBMISSION_EMPTY.categories}</small>
                    ) : null}
                  </Field>
                  <Field label="Manufacturer / creator">
                    <input
                      value={form.manufacturer}
                      onChange={(e) => update("manufacturer", e.target.value)}
                      maxLength={500}
                      placeholder="Optional"
                    />
                  </Field>
                  <Field label="Year">
                    <input
                      value={form.year}
                      onChange={(e) => update("year", e.target.value)}
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="Optional"
                    />
                  </Field>
                  <Field label="Description" required className="list-span-full">
                    <textarea
                      value={form.details}
                      onChange={(e) => update("details", e.target.value)}
                      maxLength={500}
                      rows={4}
                      placeholder="Describe condition, history and other relevant details."
                    />
                    <small>{form.details.length}/500 characters</small>
                  </Field>
                </div>
              </Panel>
              <Panel
                title="Asset specifics"
                detail="Add category-relevant details that help reviewers assess your submission."
              >
                <div className="list-form-grid">
                  <Field label="Condition / grade">
                    <input
                      value={form.condition}
                      onChange={(e) => update("condition", e.target.value)}
                      maxLength={500}
                      placeholder="Optional submitted condition"
                    />
                  </Field>
                  <Field label="Certification number">
                    <input
                      value={form.certificationNumber}
                      onChange={(e) => update("certificationNumber", e.target.value)}
                      maxLength={500}
                      placeholder="Optional; not externally verified"
                    />
                  </Field>
                  <Field label="Edition / reference number">
                    <input
                      value={form.cardNumber}
                      onChange={(e) => update("cardNumber", e.target.value)}
                      maxLength={500}
                      placeholder="Optional"
                    />
                  </Field>
                  <Field label="Language">
                    <input
                      value={form.language}
                      onChange={(e) => update("language", e.target.value)}
                      maxLength={500}
                      placeholder="Optional"
                    />
                  </Field>
                </div>
              </Panel>
              <Panel
                title="Media & documents"
                detail="Evidence is added after this draft is saved through the approved upload and scanning workflow."
              >
                <div className="list-upload-unavailable">
                  <span>
                    <UploadCloud aria-hidden="true" />
                  </span>
                  <div>
                    <strong>Save the draft before adding evidence</strong>
                    <p>
                      Front and back evidence use signed upload intent, checksum completion, and
                      scanning. Supported image types and limits are enforced by Slice.
                    </p>
                  </div>
                </div>
                <p className="list-media-policy">
                  Required evidence slots: front and back. Images only; maximum 10 MiB each.
                </p>
              </Panel>
            </div>
            <div className="list-terms">
              <Panel title="Submission terms" detail="Customer-submitted facts only.">
                <div className="list-term">
                  <ShieldCheck aria-hidden="true" />
                  <div>
                    <strong>Valuation pending</strong>
                    <p>Final valuation and publication terms are determined through review.</p>
                  </div>
                </div>
                <div className="list-term">
                  <FileUp aria-hidden="true" />
                  <div>
                    <strong>Auction and offers unavailable</strong>
                    <p>
                      Slice does not accept customer-created auction or offer terms in this
                      workflow.
                    </p>
                  </div>
                </div>
                <div className="list-term">
                  <MapPin aria-hidden="true" />
                  <div>
                    <strong>Custody details after review</strong>
                    <p>
                      Shipping and collection instructions are provided through the custody workflow
                      when applicable.
                    </p>
                  </div>
                </div>
              </Panel>
              <Panel title="Draft status" detail="Your changes become authoritative when saved.">
                <p className="list-status-note">
                  {valid
                    ? "Ready to save as a draft."
                    : "Add a title and category to save your draft."}
                </p>
                {drafts.data?.items[0] ? (
                  <Link
                    to="/submissions/$id"
                    params={{ id: drafts.data.items[0].id }}
                    className="list-resume-link"
                  >
                    {`Resume: ${submissionName(drafts.data.items[0].declaredMetadata)}`}
                    <ChevronRight aria-hidden="true" />
                  </Link>
                ) : (
                  <p className="list-resume-link is-disabled" aria-disabled="true">
                    {SUBMISSION_EMPTY.drafts}
                  </p>
                )}
              </Panel>
            </div>
            <aside className="list-preview-stack">
              <Panel
                title="Submission preview"
                detail="This private preview updates from your current draft inputs."
              >
                <div className="list-preview-image">
                  <ImagePlus aria-hidden="true" />
                  <span>No media added yet</span>
                </div>
                <div className="list-preview-copy">
                  <p>{form.name.trim() || "Untitled submission"}</p>
                  <span>{selectedCategory?.name ?? "Category not selected"}</span>
                  <small>Valuation pending</small>
                </div>
              </Panel>
              <Panel
                title="Submission checklist"
                detail="Complete these steps before sending the submission for review."
              >
                <ul className="list-checklist">
                  {checklist.map(([label, done]) => (
                    <li key={label} className={done ? "is-done" : ""}>
                      {done ? <Check aria-hidden="true" /> : <span aria-hidden="true" />}
                      <div>
                        <strong>{label}</strong>
                        <small>{done ? "Complete" : "Pending"}</small>
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>
            </aside>
          </div>
          {create.error ? (
            <p className="list-save-error">
              <CircleAlert aria-hidden="true" />
              Unable to save draft. No listing, valuation, custody, or financial action was created.
            </p>
          ) : null}
          <footer className="list-action-bar">
            <div>
              <strong>Save as draft</strong>
              <span>Your submission is stored privately and can be resumed later.</span>
            </div>
            <Link to="/dashboard" className="list-cancel">
              Cancel
            </Link>
            <button type="submit" disabled={!valid || create.isPending}>
              {create.isPending ? "Saving…" : "Save and continue"}
              <ChevronRight aria-hidden="true" />
            </button>
          </footer>
        </form>
      </div>
    </main>
  );
}

function ListSidebar({
  drafts,
}: {
  drafts: Array<{ id: string; declaredMetadata: Record<string, unknown> | null }>;
}) {
  return (
    <aside className="list-sidebar">
      <p className="page-kicker">List an asset</p>
      <h2>Create your submission</h2>
      <p>Follow the steps to prepare your collectible for review.</p>
      <ol>
        {LISTING_STEPS.map(([title, detail], index) => (
          <li key={title} className={index === 0 ? "is-active" : ""}>
            <span>{index + 1}</span>
            <div>
              <strong>{title}</strong>
              <small>{detail}</small>
            </div>
          </li>
        ))}
      </ol>
      {drafts.length ? (
        <section className="list-drafts">
          <strong>Saved drafts</strong>
          {drafts.slice(0, 3).map((draft) => (
            <Link key={draft.id} to="/submissions/$id" params={{ id: draft.id }}>
              {submissionName(draft.declaredMetadata)}
            </Link>
          ))}
        </section>
      ) : null}
      <section className="list-help">
        <ShieldCheck aria-hidden="true" />
        <strong>Need help?</strong>
        <p>Submissions are reviewed before any custody or publication stage.</p>
      </section>
    </aside>
  );
}
function Panel({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <section className="list-panel">
      <header>
        <h2>{title}</h2>
        <p>{detail}</p>
      </header>
      {children}
    </section>
  );
}
function Field({
  label,
  required,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`list-field ${className}`}>
      {label}
      {required ? <b aria-label="required">*</b> : null}
      {children}
    </label>
  );
}
function ListLoading() {
  return (
    <main className="page-shell py-16">
      <section className="customer-state">
        <p className="page-kicker">Asset submission</p>
        <h1 className="page-title mt-3">Loading submission workspace</h1>
        <p className="mt-4 text-subtle">
          Loading your private drafts and the authoritative catalogue.
        </p>
      </section>
    </main>
  );
}
function ListState({
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
      <section className="customer-state text-center">
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
