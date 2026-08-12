import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileImage,
  ImagePlus,
  Link2,
  LoaderCircle,
  ScanSearch,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ApiError } from "@/api/http-client";
import { useSession } from "@/auth/use-session";
import type {
  AssetSubmission,
  CollectibleReferenceImport,
  CreateSubmissionDraft,
  MarketResearchSnapshot,
  SubmissionDetail,
  SubmissionMedia,
} from "@/domain";
import { useAppServices } from "@/providers/AppServicesProvider";
import { useCurrency } from "@/currency/CurrencyProvider";
import { asSupportedCurrency, formatDisplayMoney } from "@/currency/currency-presentation";
import { getCurrencyPresentation } from "@/currency/currency-store";
import { formatDate } from "@/lib/format";
import { mediaStatusLabel, submissionName, submissionStatusLabel } from "./-list-presentation";

export const Route = createFileRoute("/list")({
  head: () => ({ meta: [{ title: "List an asset | Slice" }] }),
  component: SubmissionPage,
});

const REQUIRED_SLOTS = ["front", "back"] as const;
const OPTIONAL_SLOTS = [
  ["grading-label", "Grading label close-up", "Help us read the label and certification number."],
  ["condition-detail", "Condition detail", "Show any damage or condition detail clearly."],
  ["additional-image", "Additional evidence", "Add another well-lit view of the collectible."],
] as const;
const ACCEPTED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

type ListingForm = {
  categoryId: string;
  name: string;
  manufacturer: string;
  year: string;
  set: string;
  cardNumber: string;
  playerOrCharacter: string;
  variant: string;
  language: string;
  grader: string;
  grade: string;
  certificationNumber: string;
  condition: string;
  details: string;
  termsAcknowledged: boolean;
  customerReference: CreateSubmissionDraft["declaredMetadata"]["customerReference"];
};

const blank: ListingForm = {
  categoryId: "",
  name: "",
  manufacturer: "",
  year: "",
  set: "",
  cardNumber: "",
  playerOrCharacter: "",
  variant: "",
  language: "",
  grader: "",
  grade: "",
  certificationNumber: "",
  condition: "",
  details: "",
  termsAcknowledged: false,
  customerReference: undefined,
};

export function SubmissionPage() {
  useCurrency();
  const services = useAppServices();
  const session = useSession();
  const client = useQueryClient();
  const [form, setForm] = useState<ListingForm>(blank);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<AssetSubmission | null>(null);
  const [marketResearch, setMarketResearch] = useState<MarketResearchSnapshot | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [referenceUrl, setReferenceUrl] = useState("");
  const [referenceResult, setReferenceResult] = useState<CollectibleReferenceImport | null>(null);
  const lastSaved = useRef<string | null>(null);
  const version = useRef<number | null>(null);
  const saveStopped = useRef(false);
  const previewUrls = useRef<Record<string, string>>({});

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
  const detail = useQuery({
    queryKey: ["submissions", draft?.id],
    queryFn: () => services.repositories.submissions.getOwn(draft!.id),
    enabled: Boolean(draft?.id),
  });

  const validIdentity = Boolean(form.categoryId && form.name.trim());
  const marketReady = Boolean(
    validIdentity && form.year.trim() && form.set.trim() && form.cardNumber.trim(),
  );
  const metadata = metadataFromForm(form);
  const payloadFingerprint = JSON.stringify({
    categoryId: form.categoryId,
    metadata,
  });

  const create = useMutation({
    mutationFn: async ({ nextStep }: { nextStep?: number }) => {
      const fingerprint = payloadFingerprint;
      const created = await services.repositories.submissions.createDraft({
        categoryId: form.categoryId,
        declaredMetadata: metadata,
        ...(marketResearch ? { marketResearchId: marketResearch.id } : {}),
      });
      return { created, fingerprint };
    },
    onSuccess: async ({ created, fingerprint }, variables) => {
      setDraft(created);
      version.current = created.version;
      lastSaved.current = fingerprint;
      saveStopped.current = false;
      setNotice("Draft saved privately.");
      if (variables.nextStep) setStep(variables.nextStep);
      await client.invalidateQueries({ queryKey: ["submissions", "mine"] });
    },
  });
  const update = useMutation({
    mutationFn: async ({ nextStep }: { nextStep?: number } = {}) => {
      if (!draft || version.current === null) throw new Error("Your draft is still loading.");
      const fingerprint = payloadFingerprint;
      const updated = await services.repositories.submissions.updateDraft(draft.id, {
        version: version.current,
        categoryId: form.categoryId,
        declaredMetadata: metadata,
        ...(marketResearch ? { marketResearchId: marketResearch.id } : {}),
      });
      return { updated, fingerprint };
    },
    onSuccess: async ({ updated, fingerprint }, variables) => {
      version.current = updated.version;
      lastSaved.current = fingerprint;
      saveStopped.current = false;
      setNotice("Saved");
      client.setQueryData(["submissions", draft?.id], updated);
      await client.invalidateQueries({ queryKey: ["submissions", "mine"] });
      if (variables.nextStep) setStep(variables.nextStep);
    },
    onError: () => {
      saveStopped.current = true;
      setLocalError("We couldn't save your draft. Please try again.");
    },
  });
  const importReference = useMutation({
    mutationFn: () => services.repositories.submissions.importReference({ url: referenceUrl }),
    onSuccess: (result) => {
      setReferenceResult(result);
      setLocalError(null);
    },
  });
  const saveDraft = update.mutate;
  const checkMarket = useMutation({
    mutationFn: () =>
      services.repositories.submissions.checkMarket({
        categoryId: form.categoryId,
        declaredMetadata: metadata,
        refresh: Boolean(marketResearch),
      }),
    onSuccess: (research) => {
      setMarketResearch(research);
      setNotice("Market check updated. Save this step to attach it to your draft.");
    },
    onError: () => setLocalError("Market data couldn't be loaded right now. Try again."),
  });
  const media = useMutation({
    mutationFn: async ({
      slot,
      file,
      existing,
    }: {
      slot: string;
      file: File;
      existing?: SubmissionMedia;
    }) => {
      if (!detail.data) throw new Error("Save your card details before adding photos.");
      if (existing) {
        await services.repositories.submissions.removeMedia(
          detail.data.id,
          existing.id,
          detail.data.version,
        );
      }
      return services.repositories.submissions.createMediaIntent(detail.data.id, { slot, file });
    },
    onSuccess: async (_updated, variables) => {
      setNotice(`${slotLabel(variables.slot)} photo uploaded and ready for processing.`);
      await detail.refetch();
    },
  });
  const removeMedia = useMutation({
    mutationFn: ({ mediaId }: { mediaId: string }) => {
      if (!detail.data) throw new Error("Your draft is still loading.");
      return services.repositories.submissions.removeMedia(
        detail.data.id,
        mediaId,
        detail.data.version,
      );
    },
    onSuccess: async () => {
      setNotice("Photo removed from this draft.");
      await detail.refetch();
    },
  });
  const submit = useMutation({
    mutationFn: () => {
      if (!detail.data) throw new Error("Your draft is still loading.");
      return services.repositories.submissions.submit(detail.data.id, detail.data.version);
    },
    onSuccess: async (submitted) => {
      setDraft(submitted);
      setNotice("Submission received.");
      await Promise.all([
        detail.refetch(),
        client.invalidateQueries({ queryKey: ["submissions", "mine"] }),
      ]);
    },
  });

  useEffect(() => {
    const urls = previewUrls.current;
    return () => Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
  }, []);
  useEffect(() => {
    if (
      !draft ||
      !validIdentity ||
      update.isPending ||
      saveStopped.current ||
      lastSaved.current === payloadFingerprint
    )
      return;
    const timer = window.setTimeout(() => saveDraft({}), 900);
    return () => window.clearTimeout(timer);
  }, [draft, payloadFingerprint, saveDraft, update.isPending, validIdentity]);

  const change = <K extends keyof ListingForm>(key: K, value: ListingForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    saveStopped.current = false;
    if (key !== "termsAcknowledged") setMarketResearch(null);
  };
  const useImportedDetails = () => {
    if (!referenceResult?.customerReference) return;
    const identity = referenceResult.identity;
    const category = categories.data?.find((item) => item.slug === identity.categorySlug);
    setForm((current) => ({
      ...current,
      categoryId: category?.id ?? current.categoryId,
      name: identity.name ?? current.name,
      manufacturer: identity.manufacturer ?? current.manufacturer,
      year: identity.year ?? current.year,
      set: identity.set ?? current.set,
      cardNumber: identity.cardNumber ?? current.cardNumber,
      playerOrCharacter: identity.playerOrCharacter ?? current.playerOrCharacter,
      variant: identity.variant ?? current.variant,
      customerReference: referenceResult.customerReference ?? undefined,
    }));
    saveStopped.current = false;
    setMarketResearch(null);
    setNotice("Card details added. Please check them, then continue.");
  };
  const saveAndContinue = () => {
    setLocalError(null);
    if (!validIdentity) {
      setLocalError("Choose a category and add the card or collectible name to continue.");
      return;
    }
    if (draft) update.mutate({ nextStep: Math.min(step + 1, 5) });
    else create.mutate({ nextStep: Math.min(step + 1, 5) });
  };
  const selectPhoto = (slot: string, file: File, existing?: SubmissionMedia) => {
    const error = fileError(file);
    if (error) return setLocalError(error);
    const existingUrl = previewUrls.current[slot];
    if (existingUrl) URL.revokeObjectURL(existingUrl);
    const url = URL.createObjectURL(file);
    previewUrls.current[slot] = url;
    setPreviews((current) => ({ ...current, [slot]: url }));
    setLocalError(null);
    media.mutate({ slot, file, existing });
  };

  const authRequired =
    !session.isAuthenticated || (drafts.error instanceof ApiError && drafts.error.status === 401);
  if (authRequired)
    return (
      <ListState
        title="Sign in to list a collectible"
        detail="Your submission and photos remain private to your account."
        login
      />
    );
  if (categories.isLoading || drafts.isLoading)
    return (
      <ListState
        title="Loading your listing workspace"
        detail="Preparing your saved drafts and supported categories."
      />
    );
  if (categories.isError || drafts.isError)
    return (
      <ListState
        title="Listing workspace unavailable"
        detail="Your submission information could not be loaded safely."
        retry={() => {
          void categories.refetch();
          void drafts.refetch();
        }}
      />
    );

  const selectedCategory = categories.data?.find((category) => category.id === form.categoryId);
  const submission = detail.data;
  const evidenceReady = REQUIRED_SLOTS.every(
    (slot) => activeMedia(submission, slot)?.status === "SAFE",
  );
  const submitted = submission?.status === "SUBMITTED";
  const actionError =
    create.error ??
    update.error ??
    checkMarket.error ??
    media.error ??
    removeMedia.error ??
    submit.error;

  if (submitted) {
    return <SubmissionReceived submission={submission} />;
  }

  return (
    <main className="list-page list-page--guided">
      <div className="list-guided-shell">
        <header className="list-guided-heading">
          <div>
            <p className="page-kicker">List a collectible</p>
            <h1>List your card in a few simple steps.</h1>
            <p>
              Slice reviews every submission before valuation, custody, or marketplace eligibility.
            </p>
          </div>
          <Link
            to="/submissions/$id"
            params={{ id: drafts.data?.items[0]?.id ?? "" }}
            className="list-guided-drafts"
            disabled={!drafts.data?.items[0]}
          >
            My submissions <ChevronRight aria-hidden="true" />
          </Link>
        </header>

        <StepProgress
          step={step}
          onSelect={setStep}
          available={Boolean(draft)}
          evidenceReady={evidenceReady}
        />
        {notice ? (
          <p className="list-guided-notice" role="status">
            <Check aria-hidden="true" /> {notice}
          </p>
        ) : null}
        {localError || actionError ? (
          <p className="list-guided-error" role="alert">
            <CircleAlert aria-hidden="true" /> {localError ?? friendlyError(actionError)}
          </p>
        ) : null}

        <section className="list-guided-card">
          {step === 1 ? (
            <IdentityStep
              categories={categories.data ?? []}
              form={form}
              onChange={change}
              referenceUrl={referenceUrl}
              onReferenceUrl={setReferenceUrl}
              onIdentify={() => importReference.mutate()}
              identifying={importReference.isPending}
              referenceResult={referenceResult}
              onUseImportedDetails={useImportedDetails}
            />
          ) : null}
          {step === 2 ? <DetailsStep form={form} onChange={change} /> : null}
          {step === 3 ? (
            <MarketStep
              ready={marketReady}
              research={marketResearch}
              pending={checkMarket.isPending}
              onCheck={() => checkMarket.mutate()}
            />
          ) : null}
          {step === 4 ? (
            <PhotosStep
              submission={submission}
              previews={previews}
              graded={Boolean(form.grader && form.grader !== "Ungraded")}
              uploadPending={media.isPending}
              removePending={removeMedia.isPending}
              onSelect={selectPhoto}
              onRemove={(entry) => removeMedia.mutate({ mediaId: entry.id })}
            />
          ) : null}
          {step === 5 ? (
            <ReviewStep
              form={form}
              category={selectedCategory?.name ?? "Not selected"}
              research={marketResearch ?? submission?.marketResearch ?? null}
              submission={submission}
              evidenceReady={evidenceReady}
              onEdit={setStep}
            />
          ) : null}
        </section>

        <footer className="list-guided-actions">
          {step > 1 ? (
            <button type="button" className="button-secondary" onClick={() => setStep(step - 1)}>
              <ChevronLeft aria-hidden="true" /> Back
            </button>
          ) : (
            <Link to="/dashboard" className="button-secondary">
              Cancel
            </Link>
          )}
          <span className="list-guided-save-status">
            {create.isPending || update.isPending
              ? "Saving…"
              : draft
                ? "Saved privately"
                : "Your first save creates a private draft"}
          </span>
          {step < 5 ? (
            <button
              type="button"
              className="button-primary"
              disabled={
                !validIdentity ||
                create.isPending ||
                update.isPending ||
                (step === 4 && !evidenceReady)
              }
              onClick={saveAndContinue}
            >
              {step === 1 && !draft
                ? "Save and continue"
                : step === 3
                  ? "Save market check"
                  : step === 4
                    ? "Review submission"
                    : "Continue"}{" "}
              <ChevronRight aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              className="button-primary"
              disabled={!evidenceReady || !form.termsAcknowledged || submit.isPending}
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? "Submitting…" : "Submit to Slice for review"}{" "}
              <ChevronRight aria-hidden="true" />
            </button>
          )}
        </footer>

        <MySubmissions submissions={drafts.data?.items ?? []} />
      </div>
    </main>
  );
}

function StepProgress({
  step,
  onSelect,
  available,
  evidenceReady,
}: {
  step: number;
  onSelect: (step: number) => void;
  available: boolean;
  evidenceReady: boolean;
}) {
  const steps = [
    "What are you listing?",
    "Tell us about the card",
    "Check the market",
    "Add photos",
    "Review & submit",
  ];
  return (
    <nav className="list-step-progress" aria-label="Listing progress">
      <ol>
        {steps.map((label, index) => {
          const number = index + 1;
          const unlocked =
            number === 1 || (available && number <= 4) || (number === 5 && evidenceReady);
          return (
            <li
              key={label}
              className={step === number ? "is-current" : step > number ? "is-complete" : ""}
            >
              <button type="button" disabled={!unlocked} onClick={() => onSelect(number)}>
                <span>{step > number ? <Check aria-hidden="true" /> : number}</span>
                <strong>{label}</strong>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function IdentityStep({
  categories,
  form,
  onChange,
  referenceUrl,
  onReferenceUrl,
  onIdentify,
  identifying,
  referenceResult,
  onUseImportedDetails,
}: {
  categories: Array<{ id: string; name: string }>;
  form: ListingForm;
  onChange: <K extends keyof ListingForm>(key: K, value: ListingForm[K]) => void;
  referenceUrl: string;
  onReferenceUrl: (value: string) => void;
  onIdentify: () => void;
  identifying: boolean;
  referenceResult: CollectibleReferenceImport | null;
  onUseImportedDetails: () => void;
}) {
  return (
    <div className="list-step">
      <p className="page-kicker">Step 1</p>
      <h2>What are you listing?</h2>
      <p>Start with the category and the name printed on the card or slab.</p>
      <section
        className="rounded-xl border border-emerald-400/20 bg-emerald-950/20 p-4"
        aria-label="Paste a marketplace or pricing link"
      >
        <div>
          <p className="page-kicker">Start faster</p>
          <h3 className="mt-1 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Link2 className="h-4 w-4 text-accent" aria-hidden="true" /> Paste marketplace / pricing
            link
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-subtle">
            PriceCharting links can prefill supported card details. eBay import is available when
            Slice’s approved provider integration is configured.
          </p>
        </div>
        <div className="mt-3 flex min-w-0 gap-2 max-sm:grid">
          <input
            type="url"
            className="min-w-0 flex-1"
            value={referenceUrl}
            onChange={(event) => onReferenceUrl(event.target.value)}
            placeholder="Paste a trusted card link"
            maxLength={2048}
          />
          <button
            type="button"
            className="button-secondary shrink-0 max-sm:w-full"
            disabled={!referenceUrl.trim() || identifying}
            onClick={onIdentify}
          >
            {identifying ? "Identifying…" : "Identify card"}
          </button>
        </div>
        {referenceResult ? (
          <div className="mt-3 grid gap-2 rounded-lg border border-border bg-background/50 p-3 text-xs">
            <strong className="text-accent">{referenceResult.status.replaceAll("_", " ")}</strong>
            <p className="text-subtle">{referenceResult.message}</p>
            {referenceResult.customerReference ? (
              <>
                <dl className="grid gap-1 text-subtle">
                  <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
                    <dt>Source</dt>
                    <dd className="truncate text-foreground">
                      {referenceResult.customerReference.provider}
                    </dd>
                  </div>
                  <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
                    <dt>Imported identity</dt>
                    <dd className="truncate text-foreground">
                      {referenceResult.customerReference.originalTitle}
                    </dd>
                  </div>
                </dl>
                <button
                  type="button"
                  className="button-primary inline-flex w-fit items-center gap-1"
                  onClick={onUseImportedDetails}
                >
                  Use these details <ChevronRight aria-hidden="true" />
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </section>
      <div className="list-simple-fields">
        <label>
          Category
          <select
            value={form.categoryId}
            onChange={(event) => onChange("categoryId", event.target.value)}
          >
            <option value="">Choose a category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Card or collectible name
          <input
            value={form.name}
            onChange={(event) => onChange("name", event.target.value)}
            placeholder="e.g. Umbreon VMAX"
            maxLength={160}
          />
        </label>
      </div>
      <aside className="list-help-card">
        <ShieldCheck aria-hidden="true" />
        <div>
          <strong>Keep it simple</strong>
          <p>
            You can add set, grade, and card number in the next step. Slice uses the full
            identity—not just the title—to check the market.
          </p>
        </div>
      </aside>
    </div>
  );
}

function DetailsStep({
  form,
  onChange,
}: {
  form: ListingForm;
  onChange: <K extends keyof ListingForm>(key: K, value: ListingForm[K]) => void;
}) {
  const isUngraded = form.grader === "Ungraded";
  return (
    <div className="list-step">
      <p className="page-kicker">Step 2</p>
      <h2>Tell us about the card.</h2>
      <p>Only the details a reviewer and market check need to identify your collectible.</p>
      <div className="list-simple-fields list-simple-fields--details">
        <Input
          label="Year"
          value={form.year}
          onChange={(value) => onChange("year", value)}
          placeholder="e.g. 2021"
          inputMode="numeric"
        />
        <Input
          label="Set"
          value={form.set}
          onChange={(value) => onChange("set", value)}
          placeholder="e.g. Evolving Skies"
        />
        <Input
          label="Card number"
          value={form.cardNumber}
          onChange={(value) => onChange("cardNumber", value)}
          placeholder="e.g. 215/203"
        />
        <Input
          label="Player or character"
          value={form.playerOrCharacter}
          onChange={(value) => onChange("playerOrCharacter", value)}
          placeholder="Optional"
        />
        <Input
          label="Variant or parallel"
          value={form.variant}
          onChange={(value) => onChange("variant", value)}
          placeholder="e.g. Alternate Art"
        />
        <Input
          label="Language"
          value={form.language}
          onChange={(value) => onChange("language", value)}
          placeholder="e.g. English"
        />
        <label>
          Grading company
          <select value={form.grader} onChange={(event) => onChange("grader", event.target.value)}>
            <option value="">Select if applicable</option>
            <option>PSA</option>
            <option>BGS</option>
            <option>CGC</option>
            <option>Ungraded</option>
          </select>
        </label>
        {!isUngraded ? (
          <>
            <Input
              label="Grade"
              value={form.grade}
              onChange={(value) => onChange("grade", value)}
              placeholder="e.g. 10"
            />
            <Input
              label="Certification number"
              value={form.certificationNumber}
              onChange={(value) => onChange("certificationNumber", value)}
              placeholder="Optional"
            />
          </>
        ) : (
          <Input
            label="Condition"
            value={form.condition}
            onChange={(value) => onChange("condition", value)}
            placeholder="e.g. Near Mint"
          />
        )}
      </div>
      <details className="list-more-details">
        <summary>Add optional details</summary>
        <div className="list-simple-fields">
          <Input
            label="Manufacturer / brand"
            value={form.manufacturer}
            onChange={(value) => onChange("manufacturer", value)}
            placeholder="Optional"
          />
          <label className="list-field-wide">
            Anything else we should know?
            <textarea
              value={form.details}
              onChange={(event) => onChange("details", event.target.value)}
              maxLength={500}
              placeholder="Condition, history, or relevant details"
            />
          </label>
        </div>
      </details>
      <label className="list-terms-check">
        <input
          type="checkbox"
          checked={form.termsAcknowledged}
          onChange={(event) => onChange("termsAcknowledged", event.target.checked)}
        />
        <span>
          I understand submission does not guarantee acceptance, valuation, custody, or marketplace
          publication.
        </span>
      </label>
    </div>
  );
}

function MarketStep({
  ready,
  research,
  pending,
  onCheck,
}: {
  ready: boolean;
  research: MarketResearchSnapshot | null;
  pending: boolean;
  onCheck: () => void;
}) {
  return (
    <div className="list-step">
      <p className="page-kicker">Step 3</p>
      <h2>Check the market.</h2>
      <p>
        Slice separates recent completed sales from current asking prices. This is reference data
        only; staff valuation remains authoritative.
      </p>
      <button
        type="button"
        className="button-primary"
        disabled={!ready || pending}
        onClick={onCheck}
      >
        {pending ? <LoaderCircle className="animate-spin" /> : <ScanSearch />}{" "}
        {pending ? "Checking market…" : research ? "Refresh market check" : "Check market"}
      </button>
      {!ready ? (
        <p className="list-step-hint">
          Add a year, set, and card number in the previous step to improve comparable matching.
        </p>
      ) : null}
      {research ? <MarketResults research={research} /> : null}
    </div>
  );
}

function MarketResults({ research }: { research: MarketResearchSnapshot }) {
  const sales = research.snapshot.sales;
  const listings = research.snapshot.listings;
  return (
    <section className="list-market-result">
      <div className="list-market-result__top">
        <span>Market check</span>
        <strong>
          {research.state === "FOUND"
            ? "Comparable data found"
            : research.state === "LIMITED"
              ? "Limited market data"
              : "No reliable comparable sales found"}
        </strong>
      </div>
      <div className="list-market-result__metrics">
        <Metric label="Recent completed sales" value={sales ? range(sales) : "Unavailable"} />
        <Metric
          label="Median recent sale"
          value={sales?.medianMinor ? money(sales.medianMinor, sales.currency) : "Unavailable"}
        />
        <Metric label="Current listings" value={listings ? range(listings) : "Unavailable"} />
        <Metric label="Exact comparable sales" value={String(research.snapshot.exactCompCount)} />
        <Metric label="Sources" value={String(research.sourceCoverage.available)} />
        <Metric label="Updated" value={formatDate(research.collectedAt)} />
      </div>
      <details>
        <summary>View comparable sales</summary>
        <MarketObservations
          title="Completed sales"
          items={research.observations.filter((item) => item.observationType === "SALE")}
        />
        <MarketObservations
          title="Current listings"
          items={research.observations.filter((item) => item.observationType === "LISTING")}
        />
      </details>
    </section>
  );
}

function PhotosStep({
  submission,
  previews,
  graded,
  uploadPending,
  removePending,
  onSelect,
  onRemove,
}: {
  submission?: SubmissionDetail;
  previews: Record<string, string>;
  graded: boolean;
  uploadPending: boolean;
  removePending: boolean;
  onSelect: (slot: string, file: File, existing?: SubmissionMedia) => void;
  onRemove: (entry: SubmissionMedia) => void;
}) {
  return (
    <div className="list-step">
      <p className="page-kicker">Step 4</p>
      <h2>Add clear photos.</h2>
      <p>
        Front and back photos are required. On a phone, <strong>Take photo</strong> opens your
        camera; on desktop, use <strong>Upload photo</strong>.
      </p>
      <div className="list-photo-guidance">
        <span>
          <Check /> Full card visible
        </span>
        <span>
          <Check /> Good lighting
        </span>
        <span>
          <Check /> Readable label
        </span>
        <span>× No glare or cropped edges</span>
      </div>
      <div className="list-photo-grid">
        {REQUIRED_SLOTS.map((slot) => (
          <PhotoCard
            key={slot}
            slot={slot}
            required
            helper={
              slot === "front"
                ? "Take a clear photo of the entire front of the card or slab."
                : "Take a clear photo of the entire back, including edges and corners."
            }
            existing={activeMedia(submission, slot)}
            preview={previews[slot]}
            editable={Boolean(submission)}
            busy={uploadPending || removePending}
            onSelect={onSelect}
            onRemove={onRemove}
          />
        ))}
      </div>
      {graded ? (
        <p className="list-step-hint">
          For graded cards, make sure the grading label and certification number are readable.
        </p>
      ) : null}
      <h3>Optional supporting photos</h3>
      <div className="list-photo-grid list-photo-grid--optional">
        {OPTIONAL_SLOTS.map(([slot, title, helper]) => (
          <PhotoCard
            key={slot}
            slot={slot}
            title={title}
            helper={helper}
            existing={activeMedia(submission, slot)}
            preview={previews[slot]}
            editable={Boolean(submission)}
            busy={uploadPending || removePending}
            onSelect={onSelect}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  );
}

function PhotoCard({
  slot,
  title = slotLabel(slot),
  helper,
  required = false,
  existing,
  preview,
  editable,
  busy,
  onSelect,
  onRemove,
}: {
  slot: string;
  title?: string;
  helper: string;
  required?: boolean;
  existing?: SubmissionMedia;
  preview?: string;
  editable: boolean;
  busy: boolean;
  onSelect: (slot: string, file: File, existing?: SubmissionMedia) => void;
  onRemove: (entry: SubmissionMedia) => void;
}) {
  const uploadId = `upload-${slot}`;
  const cameraId = `camera-${slot}`;
  return (
    <article className="list-photo-card">
      <div className="list-photo-card__preview">
        {preview ? (
          <img src={preview} alt={`${title} preview`} />
        ) : existing ? (
          <>
            <FileImage />
            <strong>{slotLabel(slot)} photo saved</strong>
            <span>{mediaStatusLabel(existing.status)}</span>
          </>
        ) : (
          <>
            <ImagePlus />
            <span>No photo added yet</span>
          </>
        )}
      </div>
      <div className="list-photo-card__body">
        <div>
          <h3>
            {title} {required ? <em>Required</em> : null}
          </h3>
          <p>{helper}</p>
          {existing ? (
            <small>
              {mediaStatusLabel(existing.status)} · {formatBytes(existing.sizeBytes)}
            </small>
          ) : null}
        </div>
        {editable ? (
          <div className="list-photo-card__actions">
            <label htmlFor={cameraId} className="button-secondary">
              <Camera /> Take photo
              <input
                id={cameraId}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                disabled={busy}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) onSelect(slot, file, existing);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <label htmlFor={uploadId} className="button-secondary">
              <Upload /> {existing ? "Replace" : "Upload photo"}
              <input
                id={uploadId}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) onSelect(slot, file, existing);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {existing ? (
              <button
                type="button"
                className="list-photo-remove"
                disabled={busy}
                onClick={() => onRemove(existing)}
                aria-label={`Remove ${title}`}
              >
                <Trash2 />
              </button>
            ) : null}
          </div>
        ) : (
          <p className="list-step-hint">Save your card details first to add photos.</p>
        )}
      </div>
    </article>
  );
}

function ReviewStep({
  form,
  category,
  research,
  submission,
  evidenceReady,
  onEdit,
}: {
  form: ListingForm;
  category: string;
  research: MarketResearchSnapshot | null;
  submission?: SubmissionDetail;
  evidenceReady: boolean;
  onEdit: (step: number) => void;
}) {
  return (
    <div className="list-step">
      <p className="page-kicker">Step 5</p>
      <h2>Review your submission.</h2>
      <p>
        Everything stays private until Slice has reviewed the collectible, evidence, and market
        references.
      </p>
      <div className="list-review-grid">
        <ReviewBlock
          title="Card"
          edit={() => onEdit(1)}
          rows={[
            ["Name", form.name],
            ["Category", category],
            [
              "Identity",
              [form.year, form.set, form.cardNumber].filter(Boolean).join(" · ") || "Not added",
            ],
            [
              "Grade",
              [form.grader, form.grade].filter(Boolean).join(" ") || form.condition || "Not added",
            ],
          ]}
        />
        <ReviewBlock
          title="Market check"
          edit={() => onEdit(3)}
          rows={[
            [
              "Completed sales",
              research?.snapshot.sales ? range(research.snapshot.sales) : "Not checked",
            ],
            [
              "Current listings",
              research?.snapshot.listings ? range(research.snapshot.listings) : "Not checked",
            ],
            ["Updated", research ? formatDate(research.collectedAt) : "—"],
          ]}
        />
        <ReviewBlock
          title="Photos"
          edit={() => onEdit(4)}
          rows={REQUIRED_SLOTS.map((slot) => [
            slotLabel(slot),
            mediaStatusLabel(activeMedia(submission, slot)?.status ?? "PENDING_UPLOAD"),
          ])}
        />
        <ReviewBlock
          title="Details"
          edit={() => onEdit(2)}
          rows={[
            ["Variant", form.variant || "Not added"],
            ["Certification", form.certificationNumber || "Not added"],
            ["Terms", form.termsAcknowledged ? "Acknowledged" : "Still required"],
          ]}
        />
      </div>
      <aside className="list-submit-notice">
        <ShieldCheck />
        <p>
          <strong>Submitting does not guarantee acceptance or marketplace publication.</strong>{" "}
          Slice reviews the collectible, evidence and market data before valuation and custody
          steps.
        </p>
      </aside>
      {!evidenceReady ? (
        <p className="list-step-hint">
          Front and back photos must both be marked Ready before you submit.
        </p>
      ) : null}
    </div>
  );
}

function ReviewBlock({
  title,
  rows,
  edit,
}: {
  title: string;
  rows: Array<[string, string]>;
  edit: () => void;
}) {
  return (
    <section className="list-review-block">
      <header>
        <h3>{title}</h3>
        <button type="button" onClick={edit}>
          Edit
        </button>
      </header>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
function MySubmissions({ submissions }: { submissions: AssetSubmission[] }) {
  return (
    <section className="list-my-submissions">
      <header>
        <div>
          <p className="page-kicker">My submissions</p>
          <h2>Track your saved cards.</h2>
        </div>
      </header>
      {submissions.length ? (
        <div>
          {submissions.slice(0, 6).map((item) => (
            <Link key={item.id} to="/submissions/$id" params={{ id: item.id }}>
              <FileImage />
              <span>
                <strong>{submissionName(item.declaredMetadata)}</strong>
                <small>
                  {submissionStatusLabel(item.status)} · Updated {formatDate(item.updatedAt)}
                </small>
              </span>
              <ChevronRight />
            </Link>
          ))}
        </div>
      ) : (
        <p>Your drafts and submitted collectibles will appear here.</p>
      )}
    </section>
  );
}
function SubmissionReceived({ submission }: { submission: SubmissionDetail }) {
  return (
    <main className="list-page list-page--guided">
      <div className="list-guided-shell">
        <section className="list-received">
          <Check />
          <p className="page-kicker">Submission received</p>
          <h1>{submissionName(submission.declaredMetadata)}</h1>
          <p>
            Reference {submission.id}. Slice will review your collectible, evidence, and market
            reference data. It is not published or market live.
          </p>
          <ol>
            <li>Submitted</li>
            <li>Slice review</li>
            <li>Valuation</li>
            <li>Custody / verification</li>
            <li>Marketplace eligibility</li>
          </ol>
          <div>
            <Link to="/submissions/$id" params={{ id: submission.id }} className="button-primary">
              View submission
            </Link>
            <Link to="/list" className="button-secondary">
              List another card
            </Link>
            <Link to="/dashboard" className="button-secondary">
              Go to dashboard
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
function Input({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  inputMode?: "numeric";
}) {
  return (
    <label>
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={160}
      />
    </label>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
function MarketObservations({
  title,
  items,
}: {
  title: string;
  items: MarketResearchSnapshot["observations"];
}) {
  if (!items.length) return null;
  return (
    <section className="list-market-observations">
      <h4>{title}</h4>
      {items
        .filter((item) => item.includedInSnapshot)
        .map((item) => (
          <a
            key={`${item.providerCode}-${item.externalReferenceId}`}
            href={item.externalUrl ?? undefined}
            target="_blank"
            rel="noreferrer"
          >
            <span>
              <strong>{item.providerCode.replaceAll("_", " ")}</strong>
              <small>
                {item.grader && item.grade ? `${item.grader} ${item.grade}` : "Ungraded"} ·{" "}
                {formatDate(item.soldAt ?? item.observedAt)}
              </small>
            </span>
            <b>{money(item.amountMinor, item.currency)}</b>
          </a>
        ))}
    </section>
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
        <h1 className="page-title">{title}</h1>
        <p className="mt-3 text-subtle">{detail}</p>
        {login ? (
          <Link to="/login" className="button-primary mt-5 inline-flex">
            Sign in
          </Link>
        ) : null}
        {retry ? (
          <button type="button" className="button-primary mt-5" onClick={retry}>
            Retry
          </button>
        ) : null}
      </section>
    </main>
  );
}
function metadataFromForm(form: ListingForm): CreateSubmissionDraft["declaredMetadata"] {
  type TextField = Exclude<keyof ListingForm, "termsAcknowledged" | "customerReference">;
  const value = (key: TextField) => form[key].trim();
  const optional = (key: TextField) => (value(key) ? { [key]: value(key) } : {});
  return {
    name: value("name"),
    ...optional("manufacturer"),
    ...optional("year"),
    ...optional("set"),
    ...optional("cardNumber"),
    ...optional("language"),
    ...optional("condition"),
    ...optional("grader"),
    ...optional("grade"),
    ...optional("certificationNumber"),
    ...optional("details"),
    ...optional("playerOrCharacter"),
    ...optional("variant"),
    ...(form.customerReference ? { customerReference: form.customerReference } : {}),
    termsAcknowledged: form.termsAcknowledged,
  };
}
function activeMedia(submission: SubmissionDetail | undefined, slot: string) {
  return submission?.media.find((item) => item.slot === slot && item.status !== "DELETED");
}
function slotLabel(slot: string) {
  return slot.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function fileError(file: File) {
  if (!ACCEPTED_MEDIA_TYPES.has(file.type)) return "Choose a JPG, PNG, or WebP photo.";
  if (file.size > MAX_MEDIA_BYTES) return "Each photo must be 10 MB or smaller.";
  return null;
}
function formatBytes(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function money(amount: string, currency = "GBP") {
  const presentation = getCurrencyPresentation();
  return formatDisplayMoney(
    amount,
    asSupportedCurrency(currency) ?? "GBP",
    presentation.currency,
    presentation.rates,
    {
      maximumFractionDigits: 0,
    },
  );
}
function range(value: { lowMinor?: string; highMinor?: string; currency?: string }) {
  return `${value.lowMinor ? money(value.lowMinor, value.currency) : "—"} – ${value.highMinor ? money(value.highMinor, value.currency) : "—"}`;
}
function friendlyError(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : "That action could not be completed. Please try again.";
}
