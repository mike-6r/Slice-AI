import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  CircleOff,
  Expand,
  FileImage,
  Focus,
  Info,
  ImagePlus,
  Link2,
  Lightbulb,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  PackageCheck,
  ScanLine,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Trash2,
  Truck,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { ApiError } from "@/api/http-client";
import { useSession } from "@/auth/use-session";
import type {
  AssetSubmission,
  CollectibleReferenceImport,
  CustomerReference,
  CreateSubmissionDraft,
  GradeOption,
  GradingCompanyOption,
  MarketResearchSnapshot,
  SubmissionDetail,
  SubmissionMedia,
  RawCardPreGrade,
  RawCardVisualization,
  CertificationVerification,
} from "@/domain";
import { useAppServices } from "@/providers/AppServicesProvider";
import { useCurrency } from "@/currency/CurrencyProvider";
import { asSupportedCurrency, formatDisplayMoney } from "@/currency/currency-presentation";
import { getCurrencyPresentation } from "@/currency/currency-store";
import { formatDate } from "@/lib/format";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { mediaStatusLabel, submissionName, submissionStatusLabel } from "./-list-presentation";
import { isValidPercent } from "./-list-validation";
import type { CollectorVaultProjection } from "@/data/repositories";

export const Route = createFileRoute("/list")({
  validateSearch: (search: Record<string, unknown>) => ({
    draft:
      typeof search.draft === "string" && search.draft.trim().length > 0
        ? search.draft.trim().slice(0, 128)
        : undefined,
  }),
  head: () => ({ meta: [{ title: "List an asset | Slice" }] }),
  component: SubmissionPage,
});

const REQUIRED_SLOTS = ["front", "back"] as const;
const AI_REQUIRED_SLOTS = ["front", "back"] as const;
const REQUIRED_PHOTO_CONFIG = [
  ["front", "Front", "Entire front of the card or slab."],
  ["back", "Back", "Entire back with identifying details visible."],
] as const;
const OPTIONAL_SLOTS = [
  ["top-edge", "Top edge", "Optional view for edge wear, whitening, or slab condition."],
  ["bottom-edge", "Bottom edge", "Optional view for edge wear, whitening, or slab condition."],
  ["left-edge", "Left edge", "Optional view for edge wear, whitening, or slab condition."],
  ["right-edge", "Right edge", "Optional view for edge wear, whitening, or slab condition."],
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
  edition: string;
  playerOrCharacter: string;
  variant: string;
  language: string;
  grader: string;
  grade: string;
  gradeScaleEntryId?: string;
  designation?: string;
  certificationNumber: string;
  condition: string;
  details: string;
  termsAcknowledged: boolean;
  marketCheckStatus: MarketResearchSnapshot["state"] | "";
  marketCheckAcknowledged: boolean;
  offerIntentMode: "25" | "50" | "75" | "100" | "custom" | "";
  offerIntentPercent: string;
  collectorExpectedValue: string;
  collectorExpectedCurrency: string;
  collectorReviewerNotes: string;
  aiReviewSkipped: boolean;
  customerReference: CreateSubmissionDraft["declaredMetadata"]["customerReference"];
  preferredIntakeLocationId?: string;
  preferredDeliveryMethod?: "SHIPMENT" | "IN_PERSON" | "";
};

const blank: ListingForm = {
  categoryId: "",
  name: "",
  manufacturer: "",
  year: "",
  set: "",
  cardNumber: "",
  edition: "",
  playerOrCharacter: "",
  variant: "",
  language: "",
  grader: "",
  grade: "",
  gradeScaleEntryId: "",
  designation: "",
  certificationNumber: "",
  condition: "",
  details: "",
  termsAcknowledged: false,
  marketCheckStatus: "",
  marketCheckAcknowledged: false,
  offerIntentMode: "",
  offerIntentPercent: "",
  collectorExpectedValue: "",
  collectorExpectedCurrency: "GBP",
  collectorReviewerNotes: "",
  aiReviewSkipped: false,
  customerReference: undefined,
  preferredIntakeLocationId: "",
  preferredDeliveryMethod: "",
};

export function SubmissionPage() {
  useCurrency();
  const services = useAppServices();
  const session = useSession();
  const navigate = useNavigate({ from: Route.fullPath });
  const routeSearch = Route.useSearch?.() ?? {};
  const requestedDraftId = routeSearch.draft;
  const client = useQueryClient();
  const [form, setForm] = useState<ListingForm>(blank);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<AssetSubmission | null>(null);
  const [marketResearch, setMarketResearch] = useState<MarketResearchSnapshot | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [referenceUrl, setReferenceUrl] = useState("");
  const [referenceResult, setReferenceResult] = useState<CollectibleReferenceImport | null>(null);
  const lastSaved = useRef<string | null>(null);
  const version = useRef<number | null>(null);
  const saveStopped = useRef(false);
  const revisionRecovery = useRef(false);
  const previewUrls = useRef<Record<string, string>>({});

  const categories = useQuery({
    queryKey: ["catalogue", "submission-categories"],
    queryFn: () => services.repositories.catalogue.listSubmissionCategories(),
    enabled: session.isAuthenticated,
  });
  const gradingCompanies = useQuery({
    queryKey: ["catalogue", "grading-companies"],
    queryFn: () => services.repositories.catalogue.listGradingCompanies(),
    enabled: session.isAuthenticated,
    staleTime: 5 * 60_000,
  });
  const drafts = useQuery({
    queryKey: ["submissions", "mine"],
    queryFn: () => services.repositories.submissions.listOwn({ limit: 20 }),
    enabled: session.isAuthenticated,
  });
  const currentUser = useQuery({
    queryKey: ["user", "current", "list-access"],
    queryFn: () => services.repositories.users.getCurrentUser(),
    enabled: session.isAuthenticated,
    staleTime: 60_000,
  });
  const gradeOptions = useQuery({
    queryKey: ["catalogue", "grades", form.grader],
    queryFn: () => services.repositories.catalogue.listGrades(form.grader),
    enabled: session.isAuthenticated && Boolean(form.grader),
    staleTime: 5 * 60_000,
  });
  const intakeLocations = useQuery({
    queryKey: ["collector-workspace", "intake-locations", form.categoryId],
    queryFn: () => services.repositories.collectorWorkspace.listVaults(),
    enabled: session.isAuthenticated && Boolean(form.categoryId),
    staleTime: 60_000,
  });
  const draftStorageKey = currentUser.data ? `slice:list-draft:${currentUser.data.id}` : null;
  const detail = useQuery({
    queryKey: ["submissions", draft?.id ?? requestedDraftId],
    queryFn: () => services.repositories.submissions.getOwn(draft?.id ?? requestedDraftId!),
    enabled: Boolean(draft?.id ?? requestedDraftId),
  });
  const preGrade = useQuery({
    queryKey: ["submissions", draft?.id, "pre-grade"],
    queryFn: () => services.repositories.submissions.getPreGrade(draft!.id),
    enabled: Boolean(draft?.id),
    retry: false,
  });

  const validIdentity = Boolean(form.categoryId && form.name.trim());
  const marketReady = Boolean(
    validIdentity && form.year.trim() && form.set.trim() && form.cardNumber.trim(),
  );
  const metadata = metadataFromForm(form);
  const payloadFingerprint = JSON.stringify({
    categoryId: form.categoryId,
    gradeScaleEntryId: form.gradeScaleEntryId || null,
    metadata,
  });

  const create = useMutation({
    mutationFn: async ({
      nextStep,
      metadataOverride,
    }: {
      nextStep?: number;
      metadataOverride?: CreateSubmissionDraft["declaredMetadata"];
    }) => {
      const fingerprint = payloadFingerprint;
      const created = await services.repositories.submissions.createDraft({
        categoryId: form.categoryId,
        gradeScaleEntryId: form.gradeScaleEntryId || null,
        currentStep: nextStep ?? 1,
        declaredMetadata: metadataOverride ?? metadata,
        preferredIntakeLocationId: form.preferredIntakeLocationId || null,
        preferredDeliveryMethod: form.preferredDeliveryMethod || null,
        ...(marketResearch ? { marketResearchId: marketResearch.id } : {}),
      });
      return {
        created,
        fingerprint: metadataOverride
          ? JSON.stringify({ categoryId: form.categoryId, metadata: metadataOverride })
          : fingerprint,
      };
    },
    onSuccess: async ({ created, fingerprint }, variables) => {
      setDraft(created);
      version.current = created.version;
      lastSaved.current = fingerprint;
      saveStopped.current = false;
      revisionRecovery.current = false;
      setNotice("Draft saved privately.");
      if (draftStorageKey && typeof window !== "undefined")
        window.sessionStorage.setItem(draftStorageKey, created.id);
      if (variables.nextStep) setStep(variables.nextStep);
      await client.invalidateQueries({ queryKey: ["submissions", "mine"] });
    },
  });
  const update = useMutation({
    mutationFn: async ({
      nextStep,
      metadataOverride,
    }: {
      nextStep?: number;
      metadataOverride?: CreateSubmissionDraft["declaredMetadata"];
    } = {}) => {
      if (!draft || version.current === null) throw new Error("Your draft is still loading.");
      const fingerprint = payloadFingerprint;
      const updated = await services.repositories.submissions.updateDraft(draft.id, {
        version: version.current,
        categoryId: form.categoryId,
        gradeScaleEntryId: form.gradeScaleEntryId || null,
        currentStep: nextStep ?? step,
        declaredMetadata: metadataOverride ?? metadata,
        preferredIntakeLocationId: form.preferredIntakeLocationId || null,
        preferredDeliveryMethod: form.preferredDeliveryMethod || null,
        ...(marketResearch ? { marketResearchId: marketResearch.id } : {}),
      });
      return {
        updated,
        fingerprint: metadataOverride
          ? JSON.stringify({ categoryId: form.categoryId, metadata: metadataOverride })
          : fingerprint,
      };
    },
    onSuccess: async ({ updated, fingerprint }, variables) => {
      version.current = updated.version;
      lastSaved.current = fingerprint;
      saveStopped.current = false;
      setNotice("Saved");
      if (draftStorageKey && typeof window !== "undefined")
        window.sessionStorage.setItem(draftStorageKey, updated.id);
      client.setQueryData(["submissions", draft?.id], updated);
      await client.invalidateQueries({ queryKey: ["submissions", "mine"] });
      if (variables.nextStep) setStep(variables.nextStep);
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 409 && draft && !revisionRecovery.current) {
        revisionRecovery.current = true;
        const latest = await detail.refetch();
        if (latest.data) {
          setDraft(latest.data);
          version.current = latest.data.version;
          lastSaved.current = null;
          saveStopped.current = false;
          setNotice("Your draft was refreshed after another save. Please review and continue.");
          return;
        }
      }
      saveStopped.current = true;
      setLocalError("We couldn't save your draft. Please try again.");
    },
  });
  const importReference = useMutation({
    mutationFn: () => services.repositories.submissions.importReference({ url: referenceUrl }),
    onSuccess: (result) => {
      setReferenceResult(result);
      setLocalError(null);
      if (result.customerReference) applyImportedDetails(result);
      else setNotice(result.message);
    },
    onError: (error) => setLocalError(friendlyError(error)),
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
      setForm((current) => ({
        ...current,
        marketCheckStatus: research.state,
        marketCheckAcknowledged: research.state !== "UNAVAILABLE",
      }));
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
      setUploadingSlot(variables.slot === "additional-image" ? "additional-image" : null);
      setNotice(`${slotLabel(variables.slot)} photo uploaded and ready for processing.`);
      await detail.refetch();
      await preGrade.refetch();
    },
    onError: () => {
      setUploadingSlot(null);
      setLocalError("Upload failed. Try again.");
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
      await preGrade.refetch();
    },
  });
  const runPreGrade = useMutation({
    mutationFn: () => {
      if (!detail.data) throw new Error("Your draft is still loading.");
      return services.repositories.submissions.runPreGrade(detail.data.id);
    },
    retry: false,
    onSuccess: async (result) => {
      setNotice(
        result?.status === "SUCCEEDED" ? "Slice Pre-Grade ready." : "Condition analysis updated.",
      );
      await preGrade.refetch();
    },
    onError: (error) => setLocalError(friendlyError(error)),
  });
  const verifyCertification = useMutation({
    mutationFn: () => {
      if (!detail.data) throw new Error("Save your card details before verifying the certificate.");
      return services.repositories.submissions.verifyCertification(
        detail.data.id,
        form.certificationNumber,
      );
    },
    onSuccess: async (updated) => {
      version.current = updated.version;
      client.setQueryData(["submissions", draft?.id], updated);
      setNotice(
        "Certificate recorded. Staff must confirm it against the official grading-company lookup before final acceptance.",
      );
      await detail.refetch();
    },
    onError: (error) => setLocalError(friendlyError(error)),
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
      requestedDraftId ||
      !drafts.data ||
      draft ||
      !draftStorageKey ||
      typeof window === "undefined"
    )
      return;
    const savedId = window.sessionStorage.getItem(draftStorageKey);
    const saved = drafts.data.items.find(
      (item) =>
        item.id === savedId && (item.status === "DRAFT" || item.status === "CHANGES_REQUESTED"),
    );
    if (!saved) return;
    setDraft(saved);
    version.current = saved.version;
    setStep(Math.min(Math.max(saved.currentStep || 1, 1), 7));
  }, [draft, draftStorageKey, drafts.data, requestedDraftId]);
  useEffect(() => {
    if (!requestedDraftId || !detail.data || detail.data.id !== requestedDraftId) return;
    if (detail.data.status !== "DRAFT") {
      void navigate({
        to: "/submissions/$id",
        params: { id: detail.data.id },
        replace: true,
      });
      return;
    }
    setDraft((current) => current ?? detail.data!);
    version.current = detail.data.version;
    setStep(restoreWizardStep(detail.data));
  }, [detail.data, navigate, requestedDraftId]);
  const hydratedDraftId = useRef<string | null>(null);
  useEffect(() => {
    if (
      !detail.data ||
      !["DRAFT", "CHANGES_REQUESTED"].includes(detail.data.status) ||
      hydratedDraftId.current === detail.data.id
    )
      return;
    const saved = detail.data.declaredMetadata ?? {};
    const text = (key: string) => (typeof saved[key] === "string" ? saved[key] : "");
    const customerReference = customerReferenceFromMetadata(saved.customerReference);
    const hydratedForm: ListingForm = {
      ...blank,
      categoryId: detail.data.categoryId,
      name: text("name"),
      manufacturer: text("manufacturer"),
      year: text("year"),
      set: text("set"),
      cardNumber: text("cardNumber"),
      edition: text("edition"),
      playerOrCharacter: text("playerOrCharacter"),
      variant: text("variant"),
      language: text("language"),
      grader: text("grader") === "Ungraded" ? "" : text("grader"),
      grade: text("grader") && text("grader") !== "Ungraded" ? text("grade") : "",
      gradeScaleEntryId: detail.data.gradeScaleEntryId ?? "",
      designation: text("designation"),
      certificationNumber: text("certificationNumber"),
      condition: text("condition"),
      details: text("details"),
      termsAcknowledged: saved.termsAcknowledged === true,
      marketCheckStatus:
        saved.marketCheckStatus === "FOUND" ||
        saved.marketCheckStatus === "LIMITED" ||
        saved.marketCheckStatus === "NO_MATCHES" ||
        saved.marketCheckStatus === "UNAVAILABLE"
          ? saved.marketCheckStatus
          : (detail.data.marketResearch?.state ?? ""),
      marketCheckAcknowledged:
        saved.marketCheckAcknowledged === true ||
        detail.data.marketResearch?.state === "FOUND" ||
        detail.data.marketResearch?.state === "LIMITED" ||
        detail.data.marketResearch?.state === "NO_MATCHES",
      offerIntentMode:
        saved.offerIntentMode === "CUSTOM"
          ? "custom"
          : saved.offerIntentMode === "25" ||
              saved.offerIntentMode === "50" ||
              saved.offerIntentMode === "75" ||
              saved.offerIntentMode === "100"
            ? saved.offerIntentMode
            : "",
      offerIntentPercent: text("offerIntentPercent"),
      collectorExpectedValue: majorFromMinor(text("collectorExpectedValueMinor")),
      collectorExpectedCurrency:
        typeof saved.collectorExpectedCurrency === "string"
          ? saved.collectorExpectedCurrency
          : blank.collectorExpectedCurrency,
      collectorReviewerNotes: text("collectorReviewerNotes"),
      aiReviewSkipped: saved.aiReviewStatus === "AI_REVIEW_SKIPPED",
      customerReference,
      preferredIntakeLocationId: detail.data.preferredIntakeLocationId ?? "",
      preferredDeliveryMethod: detail.data.preferredDeliveryMethod ?? "",
    };
    hydratedDraftId.current = detail.data.id;
    setForm(hydratedForm);
    setMarketResearch(detail.data.marketResearch ?? null);
    setReferenceUrl(customerReference?.normalizedUrl ?? "");
    version.current = detail.data.version;
    lastSaved.current = JSON.stringify({
      categoryId: hydratedForm.categoryId,
      metadata: metadataFromForm(hydratedForm),
    });
  }, [detail.data]);
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
    if (
      key !== "termsAcknowledged" &&
      key !== "marketCheckStatus" &&
      key !== "marketCheckAcknowledged" &&
      key !== "offerIntentMode" &&
      key !== "offerIntentPercent" &&
      key !== "collectorExpectedValue" &&
      key !== "collectorExpectedCurrency" &&
      key !== "collectorReviewerNotes" &&
      key !== "aiReviewSkipped"
    ) {
      setMarketResearch(null);
      setForm((current) => ({ ...current, marketCheckStatus: "", marketCheckAcknowledged: false }));
    }
  };
  const changeTermsAcknowledged = (checked: boolean) => {
    const nextForm = { ...form, termsAcknowledged: checked };
    setForm(nextForm);
    saveStopped.current = false;
    if (draft) update.mutate({ metadataOverride: metadataFromForm(nextForm) });
  };
  const applyImportedDetails = (result: CollectibleReferenceImport | null = referenceResult) => {
    if (!result?.customerReference) return;
    const identity = result.identity;
    const category = categories.data?.find((item) => item.slug === identity.categorySlug);
    setForm((current) => ({
      ...current,
      categoryId: category?.id ?? current.categoryId,
      name: identity.name ?? current.name,
      manufacturer: identity.manufacturer ?? current.manufacturer,
      year: identity.year ?? current.year,
      set: identity.set ?? current.set,
      cardNumber: identity.cardNumber ?? current.cardNumber,
      edition: identity.edition ?? current.edition,
      playerOrCharacter: identity.playerOrCharacter ?? current.playerOrCharacter,
      variant: identity.variant ?? current.variant,
      customerReference: result.customerReference ?? undefined,
    }));
    saveStopped.current = false;
    setMarketResearch(null);
    setNotice("Card details added. Please check them, then continue.");
  };
  const identifyReference = () => {
    setLocalError(null);
    if (!isPriceChartingUrl(referenceUrl)) {
      setLocalError(
        "Paste a valid PriceCharting or SportsCardsPro link that starts with https://www.pricecharting.com/game/ or https://www.sportscardspro.com/game/.",
      );
      return;
    }
    importReference.mutate();
  };
  const saveAndContinue = (acknowledgeMarketFallback = false) => {
    setLocalError(null);
    if (step === 1 && !validIdentity) {
      setLocalError("Choose a category and add the card or collectible name to continue.");
      return;
    }
    if (step === 2 && (!form.year.trim() || !form.set.trim() || !form.cardNumber.trim())) {
      setLocalError("Add the year, set, and card number before continuing.");
      return;
    }
    const effectiveForm = acknowledgeMarketFallback
      ? {
          ...form,
          marketCheckStatus: form.marketCheckStatus || "UNAVAILABLE",
          marketCheckAcknowledged: true,
        }
      : form;
    if (step === 3) {
      const percent = Number(effectiveForm.offerIntentPercent);
      if (!effectiveForm.offerIntentMode || !effectiveForm.offerIntentPercent.trim()) {
        setLocalError("Choose how much of the collectible you would like to offer.");
        return;
      }
      if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
        setLocalError("Enter an offer percentage greater than 0 and no more than 100%.");
        return;
      }
      if (
        effectiveForm.offerIntentMode === "custom" &&
        !isValidPercent(effectiveForm.offerIntentPercent)
      ) {
        setLocalError("Custom offer percentage must be a number between 0 and 100.");
        return;
      }
      if (
        effectiveForm.collectorExpectedValue &&
        !majorToMinor(effectiveForm.collectorExpectedValue)
      ) {
        setLocalError(
          `Enter the optional expected value in ${effectiveForm.collectorExpectedCurrency} with up to two decimal places.`,
        );
        return;
      }
      if (effectiveForm.collectorReviewerNotes.length > 500) {
        setLocalError("Keep reviewer notes to 500 characters or fewer.");
        return;
      }
      const fallbackAcknowledged =
        effectiveForm.marketCheckAcknowledged ||
        (marketResearch && marketResearch.state !== "UNAVAILABLE");
      if (!fallbackAcknowledged) {
        setLocalError(
          "Check the market first, or choose Continue anyway if a reference is unavailable.",
        );
        return;
      }
    }
    if (form.grade.trim()) {
      const grade = Number(form.grade);
      if (!Number.isFinite(grade) || grade < 1 || grade > 10) {
        setLocalError("Grade must be between 1 and 10.");
        setStep(2);
        return;
      }
    }
    if (step === 4 && !evidenceReady) {
      const remaining = missingRequiredPhotoCount(
        submission,
        Boolean(form.grader && form.grader !== "Ungraded"),
      );
      setLocalError(
        `Add the ${remaining} remaining required photo${remaining === 1 ? "" : "s"} to continue.`,
      );
      return;
    }
    const rawCard = !form.grader.trim() || form.grader === "Ungraded";
    if (step === 5 && rawCard && !effectiveForm.aiReviewSkipped) {
      if (preGrade.data?.current?.status !== "SUCCEEDED") {
        setLocalError("Analyze the card or choose Skip AI review before continuing.");
        return;
      }
    }
    if (step === 6 && (!form.preferredIntakeLocationId || !form.preferredDeliveryMethod)) {
      setLocalError("Choose an approved intake location and delivery method before continuing.");
      return;
    }
    const metadataOverride = acknowledgeMarketFallback
      ? metadataFromForm(effectiveForm)
      : undefined;
    if (acknowledgeMarketFallback) setForm(effectiveForm);
    if (draft) update.mutate({ nextStep: Math.min(step + 1, 7), metadataOverride });
    else create.mutate({ nextStep: Math.min(step + 1, 7), metadataOverride });
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
    setUploadingSlot(slot);
    media.mutate({ slot, file, existing });
  };
  const selectAdditionalPhotos = async (files: File[]) => {
    if (!files.length) return;
    setLocalError(null);
    setUploadingSlot("additional-image");
    try {
      for (const [index, file] of files.entries()) {
        const error = fileError(file);
        if (error) {
          setLocalError(error);
          continue;
        }
        const previewKey = `additional-image:${Date.now()}:${index}`;
        const existingUrl = previewUrls.current[previewKey];
        if (existingUrl) URL.revokeObjectURL(existingUrl);
        const url = URL.createObjectURL(file);
        previewUrls.current[previewKey] = url;
        setPreviews((current) => ({ ...current, [previewKey]: url }));
        await media.mutateAsync({ slot: "additional-image", file });
        URL.revokeObjectURL(url);
        delete previewUrls.current[previewKey];
        setPreviews((current) => {
          const next = { ...current };
          delete next[previewKey];
          return next;
        });
      }
    } catch {
      setLocalError("Upload failed. Try again.");
    } finally {
      setUploadingSlot(null);
    }
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
  if (
    currentUser.data &&
    !currentUser.data.roles.includes("COLLECTOR") &&
    !currentUser.data.roles.includes("ADMIN")
  ) {
    return <CollectorAccessGate />;
  }
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
  if (requestedDraftId && detail.isLoading)
    return (
      <ListState
        title="Opening your saved listing"
        detail="Retrieving the latest draft so you can continue where you left off."
      />
    );
  if (requestedDraftId && (detail.isError || !detail.data))
    return (
      <ListState
        title="Draft unavailable"
        detail="This draft could not be loaded, or it does not belong to your account."
        retry={() => void detail.refetch()}
      />
    );
  if (requestedDraftId && detail.data?.status !== "DRAFT")
    return (
      <ListState title="Opening submission" detail="This record is no longer an editable draft." />
    );

  const selectedCategory = categories.data?.find((category) => category.id === form.categoryId);
  const submission = detail.data;
  const gradedCard = Boolean(form.grader.trim() && form.grader !== "Ungraded");
  const evidenceReady = requiredSlotsForGrading(gradedCard).every(
    (slot) => activeMedia(submission, slot)?.status === "SAFE",
  );
  const certificationVerified = detail.data?.certificationVerification?.status === "VERIFIED";
  const reviewReady = Boolean(
    form.categoryId &&
    form.name.trim() &&
    form.year.trim() &&
    form.set.trim() &&
    form.cardNumber.trim() &&
    form.marketCheckAcknowledged &&
    form.marketCheckStatus &&
    isValidPercent(form.offerIntentPercent) &&
    evidenceReady &&
    Boolean(form.preferredIntakeLocationId && form.preferredDeliveryMethod) &&
    (gradedCard
      ? certificationVerified
      : form.aiReviewSkipped || preGrade.data?.current?.status === "SUCCEEDED") &&
    form.termsAcknowledged,
  );
  const submitted = submission?.status === "SUBMITTED";
  const actionError =
    create.error ??
    update.error ??
    checkMarket.error ??
    media.error ??
    removeMedia.error ??
    submit.error ??
    runPreGrade.error;
  const fullActionError = actionError ?? verifyCertification.error;

  if (submitted) {
    return <SubmissionReceived submission={submission} />;
  }

  return (
    <main className="list-page list-page--guided">
      <div className="list-guided-shell">
        <header className="list-guided-heading">
          <div>
            <p className="page-kicker">
              {requestedDraftId ? "Continuing a saved draft" : "List a collectible"}
            </p>
            <h1>List your card in a few simple steps.</h1>
            <p>
              We’ll guide you through each step so you can list with confidence.
              {requestedDraftId && detail.data
                ? ` Last saved ${formatDate(detail.data.updatedAt)}.`
                : ""}
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
        {localError || fullActionError ? (
          <p className="list-guided-error" role="alert">
            <CircleAlert aria-hidden="true" /> {localError ?? friendlyError(fullActionError)}
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
              onIdentify={identifyReference}
              identifying={importReference.isPending}
              referenceResult={referenceResult}
              onUseImportedDetails={applyImportedDetails}
            />
          ) : null}
          {step === 2 ? (
            <DetailsStep
              form={form}
              onChange={change}
              gradingCompanies={gradingCompanies.data ?? []}
              grades={gradeOptions.data ?? []}
              gradesLoading={gradeOptions.isLoading}
              verification={detail.data?.certificationVerification ?? null}
              verifyPending={verifyCertification.isPending}
              onVerifyCertification={() => verifyCertification.mutate()}
            />
          ) : null}
          {step === 3 ? (
            <MarketStep
              ready={marketReady}
              form={form}
              category={selectedCategory?.name ?? "Collectible card"}
              submission={submission}
              research={marketResearch}
              pending={checkMarket.isPending}
              onCheck={() => checkMarket.mutate()}
              onChange={change}
              onContinueWithoutMarket={() => saveAndContinue(true)}
            />
          ) : null}
          {step === 4 ? (
            <PhotosStep
              submission={submission}
              previews={previews}
              uploadingSlot={uploadingSlot}
              graded={Boolean(form.grader && form.grader !== "Ungraded")}
              uploadPending={media.isPending}
              removePending={removeMedia.isPending}
              onSelect={selectPhoto}
              onAdditionalSelect={selectAdditionalPhotos}
              onRemove={(entry) => removeMedia.mutate({ mediaId: entry.id })}
            />
          ) : null}
          {step === 5 ? (
            <AIReviewStep
              form={form}
              submission={submission}
              preGrade={preGrade.data?.current ?? null}
              pending={runPreGrade.isPending}
              graded={Boolean(form.grader && form.grader !== "Ungraded")}
              skipped={form.aiReviewSkipped}
              onAnalyze={() => {
                change("aiReviewSkipped", false);
                runPreGrade.mutate();
              }}
              onSkip={() => change("aiReviewSkipped", true)}
              onViewDetails={() => setStep(2)}
            />
          ) : null}
          {step === 6 ? (
            <DeliveryLocationStep
              form={form}
              locations={intakeLocations.data ?? []}
              loading={intakeLocations.isLoading}
              onChange={change}
            />
          ) : null}
          {step === 7 ? (
            <ReviewStep
              form={form}
              category={selectedCategory?.name ?? "Not selected"}
              research={marketResearch ?? submission?.marketResearch ?? null}
              submission={submission}
              preGrade={preGrade.data?.current ?? null}
              evidenceReady={evidenceReady}
              deliveryLocation={intakeLocations.data?.find(
                (location) => location.id === form.preferredIntakeLocationId,
              )}
              onEdit={setStep}
              onTermsChange={changeTermsAcknowledged}
            />
          ) : null}
          <footer className="list-guided-actions">
            {step > 1 ? (
              <button type="button" className="button-secondary" onClick={() => setStep(step - 1)}>
                <ChevronLeft aria-hidden="true" /> Back
              </button>
            ) : (
              <Link to="/portfolio" className="button-secondary">
                Cancel
              </Link>
            )}
            <span className="list-guided-save-status">
              {create.isPending || update.isPending ? (
                "Saving…"
              ) : draft ? (
                <>
                  <LockKeyhole aria-hidden="true" />
                  Saved privately
                </>
              ) : (
                "Your first save creates a private draft"
              )}
            </span>
            {step < 7 ? (
              <button
                type="button"
                className="button-primary"
                disabled={create.isPending || update.isPending}
                onClick={() => saveAndContinue()}
              >
                {step === 1 && !draft
                  ? "Save and continue"
                  : step === 3
                    ? "Save market check"
                    : step === 4
                      ? "Continue to AI review"
                      : step === 5
                        ? "Save and continue"
                        : step === 6
                          ? "Review submission"
                          : "Continue"}{" "}
                <ChevronRight aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                className="button-primary"
                disabled={!reviewReady || submit.isPending || update.isPending || create.isPending}
                onClick={() => submit.mutate()}
              >
                {submit.isPending ? "Submitting…" : "Submit for review"}{" "}
                <ChevronRight aria-hidden="true" />
              </button>
            )}
          </footer>
        </section>

        <MySubmissions submissions={drafts.data?.items ?? []} />
      </div>
    </main>
  );
}

function CollectorAccessGate() {
  return (
    <main className="page-shell py-16">
      <section className="customer-state text-center" aria-labelledby="collector-access-title">
        <p className="page-kicker">Collector access</p>
        <h1 id="collector-access-title" className="page-title">
          Become a Collector before listing
        </h1>
        <p className="mt-3 text-subtle">
          Listing is for accounts with Collector capability. We&apos;ll guide you through your
          profile, verification, and any required membership before opening the submission
          workspace.
        </p>
        <Link
          to="/onboarding"
          search={{ returnTo: "/list" }}
          className="primary-action mt-6 inline-flex"
        >
          Become a Collector
        </Link>
      </section>
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
    "Identify your card",
    "Card details",
    "Check the market",
    "Add photos",
    "AI Card Review",
    "Delivery location",
    "Review & submit",
  ];
  return (
    <nav className="list-step-progress" aria-label="Listing progress">
      <ol>
        {steps.map((label, index) => {
          const number = index + 1;
          const unlocked =
            number === 1 ||
            (available && number <= 4) ||
            (number === 5 && evidenceReady) ||
            (number === 6 && evidenceReady) ||
            (number === 7 && evidenceReady);
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
      <p>You can paste a trusted card link or enter the details manually.</p>
      <section className="list-start-faster" aria-label="Paste a marketplace or pricing link">
        <div className="list-start-faster__intro">
          <span className="list-start-faster__icon" aria-hidden="true">
            <ScanSearch />
          </span>
          <div>
            <p className="list-start-faster__eyebrow">Fastest option</p>
            <h3>Paste a PriceCharting link</h3>
            <p>
              Paste a PriceCharting or SportsCardsPro link and Slice will try to identify the exact
              card for you.
            </p>
          </div>
        </div>
        <div className="list-start-faster__action">
          <label htmlFor="pricecharting-link" className="sr-only">
            PriceCharting or SportsCardsPro link
          </label>
          <div className="list-start-faster__input-wrap">
            <Link2 aria-hidden="true" />
            <input
              id="pricecharting-link"
              type="url"
              value={referenceUrl}
              onChange={(event) => onReferenceUrl(event.target.value)}
              placeholder="https://www.pricecharting.com/game/..."
              maxLength={2048}
              autoComplete="url"
            />
          </div>
          <button
            type="button"
            className="button-primary"
            disabled={!referenceUrl.trim() || identifying}
            onClick={onIdentify}
          >
            {identifying ? "Identifying…" : "Identify card"} <ChevronRight aria-hidden="true" />
          </button>
        </div>
        {referenceResult ? (
          <div className="list-import-result">
            <strong className="text-accent">{referenceStatusLabel(referenceResult.status)}</strong>
            <p className="text-subtle">{referenceResult.message}</p>
            {referenceResult.customerReference ? (
              <>
                <dl>
                  <div>
                    <dt>Source</dt>
                    <dd>{referenceResult.customerReference.provider}</dd>
                  </div>
                  <div>
                    <dt>Imported identity</dt>
                    <dd>{referenceResult.customerReference.originalTitle}</dd>
                  </div>
                </dl>
                <button type="button" className="button-secondary" onClick={onUseImportedDetails}>
                  Apply details again
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </section>
      <div className="list-manual-divider" aria-hidden="true">
        <span>Or enter it manually</span>
      </div>
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
      <aside className="list-next-steps" aria-label="What happens next">
        <strong>What happens next?</strong>
        <div className="list-next-steps__items">
          <span>
            <ScanSearch aria-hidden="true" />
            We help identify the exact card
          </span>
          <span>
            <FileImage aria-hidden="true" />
            You’ll confirm the card details
          </span>
          <span>
            <Camera aria-hidden="true" />
            Then you can upload photos and submit it for review
          </span>
        </div>
      </aside>
    </div>
  );
}

export function DetailsStep({
  form,
  onChange,
  gradingCompanies,
  grades,
  gradesLoading,
  verification = null,
  verifyPending = false,
  onVerifyCertification = () => undefined,
}: {
  form: ListingForm;
  onChange: <K extends keyof ListingForm>(key: K, value: ListingForm[K]) => void;
  gradingCompanies: GradingCompanyOption[];
  grades: GradeOption[];
  gradesLoading: boolean;
  verification?: CertificationVerification | null;
  verifyPending?: boolean;
  onVerifyCertification?: () => void;
}) {
  const isUngraded = !form.grader || form.grader === "Ungraded";
  const hasCurrentCompany = gradingCompanies.some((company) => company.code === form.grader);
  return (
    <div className="list-step list-step--details">
      <header className="list-details-header">
        <div>
          <p className="page-kicker">Step 2</p>
          <h2>Tell us about the card.</h2>
          <p>We only need the details that help reviewers identify your collectible accurately.</p>
        </div>
        <aside className="list-why-ask" aria-label="Why we ask for these details">
          <span className="list-why-ask__icon" aria-hidden="true">
            <ScanSearch />
          </span>
          <div>
            <strong>Why we ask this</strong>
            <ul>
              <li>Helps reviewers find the exact card</li>
              <li>Ensures accurate pricing and comparables</li>
              <li>Speeds up the review process</li>
            </ul>
          </div>
        </aside>
      </header>

      <section className="list-details-section" aria-labelledby="core-card-details">
        <h3 id="core-card-details">
          <span aria-hidden="true">A</span> Core card details
        </h3>
        <div className="list-details-grid">
          <Input
            label="Year"
            value={form.year}
            onChange={(value) => onChange("year", value)}
            placeholder="e.g. 2021"
            inputMode="numeric"
            help="The year the card was released."
          />
          <Input
            label="Set"
            value={form.set}
            onChange={(value) => onChange("set", value)}
            placeholder="e.g. Evolving Skies"
            help="The set or collection the card came from."
          />
          <Input
            label="Card number"
            value={form.cardNumber}
            onChange={(value) => onChange("cardNumber", value)}
            placeholder="e.g. 215/203"
            help="The number printed on the card."
          />
          <Input
            label="Card or collectible name"
            value={form.name}
            onChange={(value) => onChange("name", value)}
            placeholder="e.g. Umbreon VMAX"
            help="The name shown on the card."
          />
        </div>
      </section>

      <section className="list-details-section" aria-labelledby="optional-identifying-details">
        <h3 id="optional-identifying-details">
          <span aria-hidden="true">B</span> Optional identifying details
          <small>Helpful, but not required</small>
        </h3>
        <div className="list-details-grid">
          <Input
            label="Edition"
            value={form.edition}
            onChange={(value) => onChange("edition", value)}
            placeholder="e.g. 1st Edition"
            help="e.g. 1st Edition, Unlimited, Promo."
          />
          <Input
            label="Variant / parallel"
            value={form.variant}
            onChange={(value) => onChange("variant", value)}
            placeholder="e.g. Alternate Art"
            help="e.g. Holo, Alternate Art, Rainbow Rare."
          />
          <Input
            label="Player or character"
            value={form.playerOrCharacter}
            onChange={(value) => onChange("playerOrCharacter", value)}
            placeholder="e.g. Umbreon"
            help="The athlete, Pokémon, or character on the card."
          />
          <Input
            label="Language"
            value={form.language}
            onChange={(value) => onChange("language", value)}
            placeholder="e.g. English"
            help="The language printed on the card."
          />
        </div>
      </section>

      <section className="list-details-section" aria-labelledby="grading-and-condition">
        <h3 id="grading-and-condition">
          <span aria-hidden="true">C</span> Grading and condition
        </h3>
        <div className="list-grading-grid">
          <label>
            <span className="list-field-label">
              Grading company
              <TooltipHint label="The company that professionally graded the card." />
            </span>
            <select
              value={isUngraded ? "" : form.grader}
              onChange={(event) => {
                onChange("grader", event.target.value);
                onChange("grade", "");
                onChange("gradeScaleEntryId", "");
                onChange("designation", "");
                onChange("certificationNumber", "");
              }}
            >
              <option value="">Raw / Ungraded</option>
              {form.grader && !isUngraded && !hasCurrentCompany ? (
                <option value={form.grader}>{form.grader}</option>
              ) : null}
              {gradingCompanies.map((company) => (
                <option key={company.code} value={company.code}>
                  {company.displayName ?? company.name}
                </option>
              ))}
            </select>
            <small className="list-field-help">
              Choose Raw / Ungraded for a card without a slab.
            </small>
          </label>
          <label>
            <span className="list-field-label">
              Grade
              <TooltipHint label="The grade assigned by the selected grading company." />
            </span>
            {isUngraded ? (
              <select value="" disabled aria-label="Grade not applicable for raw cards">
                <option value="">Not applicable for raw cards</option>
              </select>
            ) : grades.length ? (
              <select
                value={form.gradeScaleEntryId ?? ""}
                onChange={(event) => {
                  const selected = grades.find((grade) => grade.id === event.target.value);
                  onChange("gradeScaleEntryId", selected?.id ?? "");
                  onChange("grade", selected?.grade ?? "");
                  onChange("designation", selected?.designation ?? "");
                  onChange("certificationNumber", "");
                }}
                aria-busy={gradesLoading}
              >
                <option value="">{gradesLoading ? "Loading grades…" : "Choose a grade"}</option>
                {grades.map((grade) => (
                  <option
                    key={grade.id ?? `${grade.grade}-${grade.designation ?? ""}`}
                    value={grade.id ?? grade.grade}
                  >
                    {grade.label}
                    {grade.conditionLabel ? ` · ${grade.conditionLabel}` : ""}
                    {grade.designation ? ` · ${grade.designation}` : ""}
                    {grade.legacy ? " · Legacy" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <div className="list-scale-unavailable" role="status">
                <Info aria-hidden="true" />
                {gradesLoading
                  ? "Loading this company's official scale…"
                  : "This company's official scale is awaiting staff confirmation. Choose another company to continue."}
              </div>
            )}
            <small className="list-field-help">
              {isUngraded
                ? "Raw cards do not need a slab grade."
                : "Choose the exact label shown on the slab."}
            </small>
          </label>
          <Input
            label="Condition"
            value={form.condition}
            onChange={(value) => onChange("condition", value)}
            placeholder="e.g. Near Mint"
            help="The overall condition of the card."
          />
        </div>
        {!isUngraded ? (
          <div className="list-certification-panel">
            <div className="list-certification-panel__header">
              <span className="list-certification-panel__icon" aria-hidden="true">
                <ShieldCheck />
              </span>
              <div>
                <strong>Certificate verification</strong>
                <p>Confirm the number printed on the slab.</p>
              </div>
              <span className="list-certification-panel__badge">Required for graded cards</span>
            </div>
            <label>
              <span className="list-field-label">
                Certification number
                <TooltipHint label="Enter the number printed on the slab label. Slice checks it against the grading company's official lookup; it is never accepted as verified from typed text alone." />
              </span>
              <div className="list-certification-input">
                <input
                  value={form.certificationNumber}
                  onChange={(event) => onChange("certificationNumber", event.target.value)}
                  placeholder="Enter the number from the slab"
                  autoComplete="off"
                  maxLength={80}
                  aria-describedby="certification-number-help"
                />
                <button
                  type="button"
                  className="button-secondary"
                  disabled={
                    !form.certificationNumber.trim() || !form.gradeScaleEntryId || verifyPending
                  }
                  onClick={onVerifyCertification}
                >
                  {verifyPending ? "Checking…" : "Verify cert"}
                </button>
              </div>
              <small id="certification-number-help" className="list-field-help">
                {verification?.status === "VERIFIED"
                  ? "Verified against the official grading-company record."
                  : "A staff reviewer completes the official lookup before a graded card can be finally accepted."}
              </small>
            </label>
            {verification ? (
              <div
                className={`list-certification-status list-certification-status--${verification.status.toLowerCase()}`}
                role="status"
              >
                <ShieldCheck aria-hidden="true" />
                <div>
                  <strong>
                    {verification.status === "VERIFIED"
                      ? "Certification verified"
                      : verification.status === "MISMATCH"
                        ? "Certification details need attention"
                        : "Official lookup requested"}
                  </strong>
                  <span>
                    {verification.status === "VERIFIED"
                      ? `${verification.companyCode} ${verification.verifiedLabel ?? verification.verifiedGrade ?? "official grade"}`
                      : "The typed number is recorded, but it is not treated as verified until the official record is reviewed."}
                  </span>
                  {verification.officialVerificationUrl ? (
                    <a href={verification.officialVerificationUrl} target="_blank" rel="noreferrer">
                      Open official lookup <ChevronRight aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function TooltipHint({ label }: { label: string }) {
  const [open, setOpen] = useState(false);

  return (
    <TooltipProvider delayDuration={140} skipDelayDuration={100}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="list-field-tooltip"
            aria-label={`Show help: ${label}`}
            aria-expanded={open}
            onPointerDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault();
              setOpen((current) => !current);
            }}
          >
            <CircleHelp aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="center"
          sideOffset={8}
          collisionPadding={12}
          className="list-field-tooltip-content"
        >
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function LegacyMarketStep({
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
        Slice checks approved market sources for this exact card. PriceCharting values are current
        market-guide references, not completed sales; staff valuation remains authoritative.
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
  const priceGuides = research.snapshot.priceGuides;
  const hasPriceGuide = Boolean(priceGuides);
  const hasSales = Boolean(sales);
  const hasListings = Boolean(listings);
  const hasReference = hasPriceGuide || hasSales || hasListings;
  return (
    <section className="list-market-result">
      <div className="list-market-result__top">
        <span>Market reference</span>
        <strong>
          {hasReference
            ? hasPriceGuide && !hasSales && !hasListings
              ? "Market reference found"
              : research.state === "FOUND"
                ? "Comparable data found"
                : "Limited market data"
            : "No exact market reference found"}
        </strong>
      </div>
      {hasPriceGuide ? (
        <p className="list-step-hint">
          PriceCharting provides a current market-guide reference. Completed-sale data appears
          separately when an approved sales source is available.
        </p>
      ) : null}
      {!hasReference ? (
        <p className="list-step-hint">
          {research.providerFailures[0]?.reason ??
            "We couldn't confidently identify this exact version yet. Check the card number, set, and edition, or continue and our review team can verify it."}
        </p>
      ) : null}
      <div className="list-market-result__metrics">
        {sales ? <Metric label="Recent completed sales" value={range(sales)} /> : null}
        {sales?.medianMinor ? (
          <Metric label="Median recent sale" value={money(sales.medianMinor, sales.currency)} />
        ) : null}
        {listings ? <Metric label="Current listings" value={range(listings)} /> : null}
        {priceGuides?.medianMinor ? (
          <Metric
            label="PriceCharting current guide"
            value={money(priceGuides.medianMinor, priceGuides.currency)}
          />
        ) : null}
        {hasSales ? (
          <Metric label="Exact comparable sales" value={String(research.snapshot.exactCompCount)} />
        ) : null}
        <Metric label="Sources" value={String(research.sourceCoverage.available)} />
        <Metric label="Updated" value={formatDate(research.collectedAt)} />
      </div>
      {research.observations.length ? (
        <details>
          <summary>View comparable sales</summary>
          {hasSales ? (
            <MarketObservations
              title="Completed sales"
              items={research.observations.filter((item) => item.observationType === "SALE")}
            />
          ) : null}
          {hasListings ? (
            <MarketObservations
              title="Current listings"
              items={research.observations.filter((item) => item.observationType === "LISTING")}
            />
          ) : null}
          <MarketObservations
            title="PriceCharting market-guide references"
            items={research.observations.filter((item) => item.observationType === "PRICE_GUIDE")}
          />
        </details>
      ) : null}
    </section>
  );
}

export function MarketStep({
  ready,
  form,
  category,
  submission,
  research,
  pending,
  onCheck,
  onChange,
  onContinueWithoutMarket,
}: {
  ready: boolean;
  form: ListingForm;
  category: string;
  submission?: SubmissionDetail;
  research: MarketResearchSnapshot | null;
  pending: boolean;
  onCheck: () => void;
  onChange: (
    key:
      | "offerIntentMode"
      | "offerIntentPercent"
      | "collectorExpectedValue"
      | "collectorReviewerNotes",
    value: string,
  ) => void;
  onContinueWithoutMarket: () => void;
}) {
  const reference = research ? marketReference(research) : null;
  const hasReference = Boolean(reference);
  const identity = [form.name, form.set, form.cardNumber].filter(Boolean).join(" · ");
  const uploadedFront = safeMediaForSlot(submission, "front")[0];
  const uploadedImage = uploadedFront?.previewUrl ?? null;
  const providerImage =
    research?.snapshot.referenceImageUrl ?? form.customerReference?.imageUrl ?? null;
  const displayImage = uploadedImage || providerImage;
  const displayImageLabel = uploadedImage
    ? "Uploaded front photo"
    : providerImage
      ? "PriceCharting reference image"
      : "Card image not uploaded";
  const grader = form.grader
    ? `${form.grader}${form.grade ? ` ${form.grade}` : ""}`
    : "Raw / Ungraded";
  const fallback = !hasReference;

  return (
    <div className="list-step list-step--market">
      <p className="page-kicker">Step 3</p>
      <h2>Check the market.</h2>
      <p>
        Slice checks trusted market sources to help identify the collectible and provide a reference
        value.
      </p>
      <div className="list-market-layout">
        <div className="list-market-main">
          <section className="list-market-summary" aria-labelledby="market-summary-title">
            <div className="list-market-summary__heading">
              <div>
                <p className="list-section-label">Your card summary</p>
                <h3 id="market-summary-title">{form.name || "Your collectible"}</h3>
              </div>
              <span className="list-market-status">Private draft</span>
            </div>
            <div className="list-market-summary__body">
              <div
                className={`list-market-summary__thumb${displayImage ? " is-image" : ""}`}
                aria-label={displayImageLabel}
              >
                {displayImage ? (
                  <img
                    src={displayImage}
                    alt={`${form.name || "Collectible"} ${
                      uploadedImage ? "uploaded front photo" : "PriceCharting reference image"
                    }`}
                  />
                ) : (
                  <FileImage aria-hidden="true" />
                )}
                <small>
                  {uploadedImage
                    ? "Uploaded front photo"
                    : providerImage
                      ? "PriceCharting reference image"
                      : "Upload photos in Step 4"}
                </small>
              </div>
              <dl className="list-market-summary__details">
                <Metric label="Category" value={category} />
                <Metric label="Identity" value={identity || "Add card details in Step 2"} />
                <Metric label="Year" value={form.year || "—"} />
                <Metric label="Condition / grade" value={grader} />
              </dl>
            </div>
          </section>

          <section className="list-market-panel" aria-labelledby="market-reference-title">
            <div className="list-market-panel__heading">
              <div>
                <p className="list-section-label">Market reference</p>
                <h3 id="market-reference-title">
                  {hasReference
                    ? "Reference found"
                    : research?.state === "UNAVAILABLE"
                      ? "Market source unavailable"
                      : "No exact market reference found"}
                </h3>
              </div>
              {research?.dataQuality ? (
                <span className="list-quality-pill">
                  Match quality: {qualityLabel(research.dataQuality)}
                </span>
              ) : null}
            </div>
            {hasReference && reference ? (
              <>
                <p className="list-market-matched">
                  Matched: <strong>{identity || "Collectible identity"}</strong>
                </p>
                <div className="list-market-reference-value">
                  <strong>{sourceMoney(reference.amountMinor, reference.currency)}</strong>
                  <span>Market reference value · {reference.currency}</span>
                </div>
                <div className="list-market-reference-meta">
                  <span>Source: {reference.provider}</span>
                  <span>Last updated: {formatDateTime(reference.updatedAt)}</span>
                  {reference.externalUrl ? (
                    <a href={reference.externalUrl} target="_blank" rel="noreferrer">
                      View source <Link2 aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
                <MarketHistory research={research!} />
                <p className="list-market-source-note">
                  This is a provider reference, not a Slice valuation or an offer price.
                </p>
              </>
            ) : (
              <div className="list-market-fallback-copy">
                <p>
                  {research?.state === "UNAVAILABLE"
                    ? "The market source is temporarily unavailable. You can continue and our team will review the collectible manually."
                    : "That’s okay — you can still continue. Slice will review the collectible manually."}
                </p>
                {research?.providerFailures[0]?.reason ? (
                  <small>{research.providerFailures[0].reason}</small>
                ) : null}
                {!research ? (
                  <button
                    type="button"
                    className="button-primary"
                    disabled={!ready || pending}
                    onClick={onCheck}
                  >
                    {pending ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <ScanSearch aria-hidden="true" />
                    )}{" "}
                    {pending ? "Checking market…" : "Check the market"}
                  </button>
                ) : null}
              </div>
            )}
            {!ready ? (
              <p className="list-step-hint">
                Add the year, set, and card number in Step 2 before checking the market.
              </p>
            ) : null}
          </section>

          <OfferIntent form={form} onChange={onChange} reference={reference} />

          {fallback ? (
            <section
              className="list-market-panel list-market-panel--fallback"
              aria-labelledby="fallback-details-title"
            >
              <div className="list-market-panel__heading">
                <div>
                  <p className="list-section-label">Fallback details</p>
                  <h3 id="fallback-details-title">Continue without a market reference</h3>
                </div>
                <CircleAlert aria-hidden="true" />
              </div>
              <div className="list-market-fallback-fields">
                <label>
                  <span className="list-field-label">
                    Expected total value <small>(optional)</small>
                  </span>
                  <div className="list-market-money-input">
                    <span>{form.collectorExpectedCurrency}</span>
                    <input
                      value={form.collectorExpectedValue}
                      onChange={(event) => onChange("collectorExpectedValue", event.target.value)}
                      placeholder="e.g. 2500.00"
                      inputMode="decimal"
                      aria-describedby="expected-value-help"
                    />
                  </div>
                  <small id="expected-value-help" className="list-field-help">
                    Your estimate is context for reviewers only. It is not a Slice valuation.
                  </small>
                </label>
                <label>
                  <span className="list-field-label">
                    Notes for reviewer <small>(optional)</small>
                  </span>
                  <textarea
                    value={form.collectorReviewerNotes}
                    onChange={(event) => onChange("collectorReviewerNotes", event.target.value)}
                    placeholder="Tell us anything useful about this card or its market context."
                    maxLength={500}
                    rows={4}
                  />
                  <small className="list-field-help">
                    {form.collectorReviewerNotes.length}/500
                  </small>
                </label>
              </div>
            </section>
          ) : null}
        </div>

        <aside className="list-market-aside">
          <section className="list-market-help-card">
            <h3>How this helps</h3>
            <ul>
              <li>
                <Check aria-hidden="true" /> Confirms you selected the right card
              </li>
              <li>
                <Check aria-hidden="true" /> Gives reviewers a live market reference
              </li>
              <li>
                <Check aria-hidden="true" /> Helps speed up the review process
              </li>
            </ul>
          </section>
          <section className="list-market-help-card">
            <h3>Need to retry?</h3>
            <p>If the match looks wrong, refresh the market check and we’ll look again.</p>
            <button
              type="button"
              className="button-secondary"
              disabled={!ready || pending}
              onClick={onCheck}
            >
              {pending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <ScanSearch aria-hidden="true" />
              )}{" "}
              {pending ? "Checking market…" : "Refresh market check"}
            </button>
          </section>
          <section className="list-market-help-card list-market-help-card--fallback">
            <h3>{hasReference ? "Market reference" : "No match?"}</h3>
            <p>
              {hasReference
                ? "You can refresh this reference if the match does not look right."
                : "No worries — you can still continue. Our team will review your card details manually."}
            </p>
            {!hasReference ? (
              <button type="button" className="button-secondary" onClick={onContinueWithoutMarket}>
                Continue anyway <ChevronRight aria-hidden="true" />
              </button>
            ) : null}
          </section>
        </aside>
      </div>
      <p className="list-market-disclaimer">
        <ShieldCheck aria-hidden="true" /> Market references guide the review, but Slice’s final
        approved valuation is set during review.
      </p>
    </div>
  );
}

function OfferIntent({
  form,
  onChange,
  reference,
}: {
  form: ListingForm;
  onChange: (key: "offerIntentMode" | "offerIntentPercent", value: string) => void;
  reference: ReturnType<typeof marketReference>;
}) {
  const options = ["25", "50", "75", "100", "custom"] as const;
  const percent = Number(form.offerIntentPercent);
  const validPercent = Number.isFinite(percent) && percent > 0 && percent <= 100;
  return (
    <section className="list-market-panel list-offer-intent" aria-labelledby="offer-intent-title">
      <div className="list-market-panel__heading">
        <div>
          <p className="list-section-label">Offer intent</p>
          <h3 id="offer-intent-title">How much would you like to offer?</h3>
        </div>
        <TooltipHint label="This records your intended portion only. Slice does not create ownership or an offering at this step." />
      </div>
      <p>
        Choose the percentage of the collectible you’d eventually like to make available on Slice.
      </p>
      <div className="list-offer-options" role="group" aria-label="Offer percentage">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={form.offerIntentMode === option ? "is-selected" : ""}
            aria-pressed={form.offerIntentMode === option}
            onClick={() => {
              onChange("offerIntentMode", option);
              if (option !== "custom") onChange("offerIntentPercent", option);
            }}
          >
            {option === "custom" ? "Custom" : `${option}%`}
          </button>
        ))}
      </div>
      {form.offerIntentMode === "custom" ? (
        <label className="list-market-custom-percent">
          <span className="list-field-label">Custom percentage</span>
          <div className="list-market-money-input">
            <input
              type="number"
              value={form.offerIntentPercent}
              onChange={(event) => onChange("offerIntentPercent", event.target.value)}
              placeholder="e.g. 40"
              inputMode="decimal"
              min={0.01}
              max={100}
              step="any"
              maxLength={6}
            />
            <span>%</span>
          </div>
        </label>
      ) : null}
      {validPercent ? (
        <div className="list-offer-summary">
          <strong>You’d like to offer {formatPercentValue(percent)}%</strong>
          <span>You’d keep {formatPercentValue(100 - percent)}%.</span>
          {reference ? (
            <small>
              Illustrative reference portion:{" "}
              {sourceMoney(portionOf(reference.amountMinor, percent), reference.currency)}. This is
              not an offer price.
            </small>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function MarketHistory({ research }: { research: MarketResearchSnapshot }) {
  const [rangeKey, setRangeKey] = useState<"24H" | "7D" | "30D" | "90D" | "1Y" | "ALL">("24H");
  const ranges = ["24H", "7D", "30D", "90D", "1Y", "ALL"] as const;
  const all = research.observations
    .filter((item) => item.includedInSnapshot)
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  const since = rangeKey === "ALL" ? 0 : Date.now() - historyMilliseconds(rangeKey);
  const points = all.filter((item) => Date.parse(item.observedAt) >= since);
  const currencies = new Set(points.map((item) => item.currency));
  const canChart = points.length >= 2 && currencies.size === 1;
  const values = points.map((item) => Number(item.amountMinor));
  const min = canChart ? Math.min(...values) : 0;
  const max = canChart ? Math.max(...values) : 0;
  const span = Math.max(max - min, 1);
  const chartPoints = canChart
    ? points
        .map(
          (item, index) =>
            `${(index / Math.max(points.length - 1, 1)) * 100},${92 - ((Number(item.amountMinor) - min) / span) * 76}`,
        )
        .join(" ")
    : "";
  return (
    <div className="list-market-history">
      <div className="list-market-history__heading">
        <strong>Reference history</strong>
        <span>Persisted provider observations only</span>
      </div>
      <div className="list-history-range" role="group" aria-label="Reference history range">
        {ranges.map((item) => (
          <button
            key={item}
            type="button"
            className={rangeKey === item ? "is-selected" : ""}
            onClick={() => setRangeKey(item)}
          >
            {item}
          </button>
        ))}
      </div>
      {canChart ? (
        <svg
          className="list-market-history__chart"
          viewBox="0 0 100 100"
          role="img"
          aria-label={`${points.length} persisted market observations`}
          preserveAspectRatio="none"
        >
          <polyline points={chartPoints} fill="none" vectorEffect="non-scaling-stroke" />
        </svg>
      ) : (
        <p className="list-market-history__empty">
          Historical reference is not available for this range yet. Slice will show it once enough
          real observations are saved.
        </p>
      )}
    </div>
  );
}

function LegacyPhotosStep({
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

export function PhotosStep({
  submission,
  previews,
  uploadingSlot,
  graded,
  uploadPending,
  removePending,
  onSelect,
  onAdditionalSelect,
  onRemove,
}: {
  submission?: SubmissionDetail;
  previews: Record<string, string>;
  uploadingSlot: string | null;
  graded: boolean;
  uploadPending: boolean;
  removePending: boolean;
  onSelect: (slot: string, file: File, existing?: SubmissionMedia) => void;
  onAdditionalSelect: (files: File[]) => void;
  onRemove: (entry: SubmissionMedia) => void;
}) {
  const requiredSlots = requiredSlotsForGrading(graded);
  const remaining = missingRequiredPhotoCount(submission, graded);
  const requiredPhotoConfig = graded
    ? [
        ...REQUIRED_PHOTO_CONFIG,
        [
          "grading-label",
          "Grading label close-up",
          "Required for graded cards: make the company, grade, and certification number readable.",
        ] as const,
      ]
    : REQUIRED_PHOTO_CONFIG;
  const additional = activeMediaForSlot(submission, "additional-image");
  const optionalPreviewKeys = Object.keys(previews).filter((key) =>
    key.startsWith("additional-image:"),
  );
  const optionalRoleSlots = OPTIONAL_SLOTS.filter(
    ([slot]) => slot !== "additional-image" && !(graded && slot === "grading-label"),
  );
  return (
    <div className="list-step list-step--photos">
      <div className="list-photos-layout">
        <div className="list-photos-main">
          <header className="list-photos-heading">
            <p className="page-kicker">Step 4</p>
            <h2>Add photos of your card.</h2>
            <p>Clear photos help our AI and reviewers evaluate your collectible.</p>
          </header>

          <section className="list-photos-section" aria-labelledby="required-photos-title">
            <div className="list-photos-section__heading">
              <div>
                <h3 id="required-photos-title">Required photos</h3>
                <p>
                  {graded
                    ? "Front, back, and a readable grading label close-up are required."
                    : "Front and back are required. Edge views can be added when they help show condition."}
                </p>
              </div>
              <span className={remaining ? "list-photo-count" : "list-photo-count is-complete"}>
                {requiredSlots.length - remaining} of {requiredSlots.length} added
              </span>
            </div>
            <div className="list-required-photo-grid">
              {requiredPhotoConfig.map(([slot, title, helper]) => (
                <PhotoTile
                  key={slot}
                  slot={slot}
                  title={title}
                  helper={helper}
                  required
                  existing={activeMedia(submission, slot)}
                  preview={previews[slot]}
                  uploading={uploadingSlot === slot}
                  editable={Boolean(submission)}
                  busy={uploadPending || removePending}
                  onSelect={onSelect}
                  onRemove={onRemove}
                />
              ))}
            </div>
          </section>

          <section
            className="list-photos-section list-additional-photos"
            aria-labelledby="additional-photos-title"
          >
            <div className="list-photos-section__heading">
              <div>
                <h3 id="additional-photos-title">
                  Additional photos <small>(optional)</small>
                </h3>
                <p>
                  Add optional edge views or extra photos that show condition or unique details.
                </p>
              </div>
            </div>
            <div className="list-additional-upload-row">
              <label
                className="list-additional-dropzone"
                htmlFor="additional-photo-upload"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const files = Array.from(event.dataTransfer.files);
                  if (files.length) void onAdditionalSelect(files);
                }}
              >
                <span className="list-additional-dropzone__icon">
                  <Upload />
                </span>
                <strong>Upload additional photos</strong>
                <span>Drag and drop or click to browse</span>
                <small>JPG, PNG or WebP · up to 10 MB each</small>
                <input
                  id="additional-photo-upload"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  capture="environment"
                  disabled={!submission || uploadPending}
                  onChange={(event) => {
                    const files = Array.from(event.currentTarget.files ?? []);
                    if (files.length) void onAdditionalSelect(files);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <div className="list-photo-examples" aria-label="Suggested additional photo types">
                <span>
                  <ImagePlus aria-hidden="true" /> Corner detail
                </span>
                <span>
                  <Focus aria-hidden="true" /> Surface detail
                </span>
                <span>
                  <ScanLine aria-hidden="true" /> Grading label
                </span>
                <span>
                  <CircleAlert aria-hidden="true" /> Condition detail
                </span>
              </div>
            </div>
            {additional.length || optionalPreviewKeys.length ? (
              <div className="list-additional-gallery" aria-label="Uploaded additional photos">
                {additional.map((entry) => (
                  <PhotoMini
                    key={entry.id}
                    entry={entry}
                    preview={entry.previewUrl ?? undefined}
                    onRemove={onRemove}
                    busy={uploadPending || removePending}
                  />
                ))}
                {optionalPreviewKeys.map((key) => (
                  <div className="list-photo-mini list-photo-mini--pending" key={key}>
                    <img src={previews[key]} alt="Additional photo preview" />
                    <span>{uploadingSlot === "additional-image" ? "Uploading…" : "Selected"}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="list-optional-role-grid">
              {optionalRoleSlots.map(([slot, title, helper]) => {
                const existing = activeMedia(submission, slot);
                return (
                  <PhotoMiniRole
                    key={slot}
                    slot={slot}
                    title={title}
                    helper={helper}
                    existing={existing}
                    preview={previews[slot]}
                    uploading={uploadingSlot === slot}
                    editable={Boolean(submission)}
                    busy={uploadPending || removePending}
                    onSelect={onSelect}
                    onRemove={onRemove}
                  />
                );
              })}
            </div>
          </section>

          <div className="list-photo-info-bar">
            <Lightbulb aria-hidden="true" />
            <strong>Good photos = faster review.</strong>
            <span>Make sure your card is well lit and in focus.</span>
          </div>
        </div>

        <aside className="list-photo-rail">
          <section className="list-photo-rail-card">
            <h3>
              <Lightbulb aria-hidden="true" /> Photo tips
            </h3>
            <PhotoTip
              icon={<ImagePlus aria-hidden="true" />}
              title="Use good lighting"
              detail="Natural light works best. Avoid glare."
            />
            <PhotoTip
              icon={<Focus aria-hidden="true" />}
              title="Keep it in focus"
              detail="Clear, sharp images help review."
            />
            <PhotoTip
              icon={<ScanLine aria-hidden="true" />}
              title="Show the whole card"
              detail="Include all edges and corners."
            />
            <PhotoTip
              icon={<CircleOff aria-hidden="true" />}
              title="No edits or filters"
              detail="We need to see the collectible as-is."
            />
          </section>
          <section className="list-photo-rail-card">
            <h3>
              <ShieldCheck aria-hidden="true" /> Why these photos?
            </h3>
            <p>These photos help us:</p>
            <ul>
              <li>
                <Check aria-hidden="true" /> Confirm collectible details
              </li>
              <li>
                <Check aria-hidden="true" /> Assess visible condition
              </li>
              <li>
                <Check aria-hidden="true" /> Compare the item with your details
              </li>
              <li>
                <Check aria-hidden="true" /> Support authenticity review
              </li>
            </ul>
          </section>
          <section className="list-photo-rail-card list-photo-rail-card--help">
            <h3>
              <CircleHelp aria-hidden="true" /> Need help?
            </h3>
            <p>View our photo guide if you’re unsure what to upload.</p>
            <Link to="/help" className="button-secondary">
              View photo guide <Link2 aria-hidden="true" />
            </Link>
          </section>
        </aside>
      </div>
      {graded ? (
        <p className="list-photo-context">
          <ShieldCheck aria-hidden="true" /> Graded card: include the full slab in front and back
          photos, and make the certification label readable. A label close-up is optional.
        </p>
      ) : (
        <p className="list-photo-context">
          <ImagePlus aria-hidden="true" /> Raw card: focus on the surface, corners, edges, and any
          visible condition details.
        </p>
      )}
    </div>
  );
}

function PhotoTile({
  slot,
  title,
  helper,
  required,
  existing,
  preview,
  uploading,
  editable,
  busy,
  onSelect,
  onRemove,
}: {
  slot: string;
  title: string;
  helper: string;
  required?: boolean;
  existing?: SubmissionMedia;
  preview?: string;
  uploading: boolean;
  editable: boolean;
  busy: boolean;
  onSelect: (slot: string, file: File, existing?: SubmissionMedia) => void;
  onRemove: (entry: SubmissionMedia) => void;
}) {
  const uploadId = `photo-upload-${slot}`;
  const cameraId = `photo-camera-${slot}`;
  const status = uploading ? "Uploading…" : existing ? photoStateLabel(existing.status) : "Empty";
  return (
    <article className="list-photo-tile">
      <header>
        <div>
          <h4>{title}</h4>
          {required ? <span>Required</span> : null}
        </div>
        <small>{status}</small>
      </header>
      <div className={`list-photo-tile__preview${existing?.status === "SAFE" ? " is-ready" : ""}`}>
        {preview || existing?.previewUrl ? (
          <img src={preview ?? existing?.previewUrl ?? ""} alt={`${title} uploaded photo`} />
        ) : uploading ? (
          <>
            <LoaderCircle className="animate-spin" aria-hidden="true" />
            <strong>Uploading…</strong>
          </>
        ) : existing ? (
          <>
            <FileImage aria-hidden="true" />
            <strong>{photoStateLabel(existing.status)}</strong>
          </>
        ) : (
          <>
            <ImagePlus aria-hidden="true" />
            <strong>Upload a clear view</strong>
          </>
        )}
        {existing?.status === "SAFE" && !uploading ? (
          <span className="list-photo-tile__success">
            <Check aria-hidden="true" /> Ready
          </span>
        ) : null}
      </div>
      <p>{helper}</p>
      {editable ? (
        <div className="list-photo-tile__actions">
          <label htmlFor={uploadId} className="button-secondary">
            <Upload aria-hidden="true" /> {existing ? "Replace" : "Upload photo"}
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
          <label htmlFor={cameraId} className="list-photo-camera">
            <Camera aria-hidden="true" /> Take photo
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
          {existing ? (
            <button
              type="button"
              className="list-photo-delete"
              disabled={busy}
              onClick={() => onRemove(existing)}
              aria-label={`Remove ${title}`}
            >
              <Trash2 aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : (
        <small className="list-photo-login-hint">Save your draft first to upload.</small>
      )}
    </article>
  );
}

function PhotoMini({
  entry,
  preview,
  onRemove,
  busy,
}: {
  entry: SubmissionMedia;
  preview?: string;
  onRemove: (entry: SubmissionMedia) => void;
  busy: boolean;
}) {
  return (
    <div className="list-photo-mini">
      {preview ? (
        <img src={preview} alt={`${slotLabel(entry.slot)} preview`} />
      ) : (
        <FileImage aria-hidden="true" />
      )}
      <span>{entry.status === "SAFE" ? "Ready" : photoStateLabel(entry.status)}</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => onRemove(entry)}
        aria-label={`Remove ${slotLabel(entry.slot)}`}
      >
        <Trash2 aria-hidden="true" />
      </button>
    </div>
  );
}

function PhotoMiniRole({
  slot,
  title,
  helper,
  existing,
  preview,
  uploading,
  editable,
  busy,
  onSelect,
  onRemove,
}: {
  slot: string;
  title: string;
  helper: string;
  existing?: SubmissionMedia;
  preview?: string;
  uploading: boolean;
  editable: boolean;
  busy: boolean;
  onSelect: (slot: string, file: File, existing?: SubmissionMedia) => void;
  onRemove: (entry: SubmissionMedia) => void;
}) {
  const inputId = `optional-photo-${slot}`;
  return (
    <div className="list-optional-role">
      <div className="list-optional-role__copy">
        {preview || existing?.previewUrl ? (
          <img src={preview ?? existing?.previewUrl ?? ""} alt={`${title} preview`} />
        ) : (
          <ImagePlus aria-hidden="true" />
        )}
        <span>
          <strong>{title}</strong>
          <small>
            {uploading ? "Uploading…" : existing ? photoStateLabel(existing.status) : helper}
          </small>
        </span>
      </div>
      {editable ? (
        <div className="list-optional-role__actions">
          <label htmlFor={inputId}>
            {existing ? "Replace" : "Add photo"}
            <input
              id={inputId}
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
          {existing ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onRemove(existing)}
              aria-label={`Remove ${title}`}
            >
              <Trash2 aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PhotoTip({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <div className="list-photo-tip">
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

export function AIReviewStep({
  form,
  submission,
  preGrade,
  pending,
  graded,
  skipped,
  onAnalyze,
  onSkip,
  onViewDetails,
}: {
  form: ListingForm;
  submission?: SubmissionDetail;
  preGrade: RawCardPreGrade | null;
  pending: boolean;
  graded: boolean;
  skipped: boolean;
  onAnalyze: () => void;
  onSkip: () => void;
  onViewDetails: () => void;
}) {
  const [lightbox, setLightbox] = useState<{ url: string; title: string } | null>(null);
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  return (
    <div className="list-step list-step--ai-review">
      <div className="list-ai-review-layout">
        <aside className="list-ai-review-left" aria-label="Card and photo summary">
          <AiCardSummary form={form} submission={submission} onViewDetails={onViewDetails} />
          <AiPhotosUsed
            submission={submission}
            graded={graded}
            showAllPhotos={showAllPhotos}
            onToggleAll={() => setShowAllPhotos((value) => !value)}
            onOpenImage={(url, title) => setLightbox({ url, title })}
          />
        </aside>
        <main className="list-ai-review-main">
          <header className="list-ai-review-header">
            <div>
              <p className="page-kicker">Step 5</p>
              <div className="list-ai-review-title-row">
                <h2>{graded ? "AI Card Review" : "AI Card Review"}</h2>
                <span className="list-ai-review-badge">
                  {graded ? "Slab recognition" : "Ximilar pre-grade"}
                </span>
              </div>
              <p>
                {graded
                  ? "Review visible slab and label details without treating them as an official verification."
                  : "Our AI analyzes your card images to estimate its visible condition."}
              </p>
            </div>
            {graded ? <span className="list-ai-review-status">Existing grade</span> : null}
          </header>
          {graded ? (
            <GradedReviewPanel form={form} />
          ) : (
            <RawPreGradeResult
              submission={submission}
              preGrade={preGrade}
              pending={pending}
              skipped={skipped}
              onAnalyze={onAnalyze}
              onSkip={onSkip}
              onOpenImage={(url, title) => setLightbox({ url, title })}
            />
          )}
        </main>
        <AiReviewGuidance graded={graded} />
      </div>
      {lightbox ? (
        <AiImageLightbox
          title={lightbox.title}
          url={lightbox.url}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </div>
  );
}

function AiCardSummary({
  form,
  submission,
  onViewDetails,
}: {
  form: ListingForm;
  submission?: SubmissionDetail;
  onViewDetails: () => void;
}) {
  const front = activeMedia(submission, "front");
  return (
    <section className="list-ai-panel list-ai-summary" aria-labelledby="ai-card-summary-title">
      <h3 id="ai-card-summary-title">Your card summary</h3>
      <div className="list-ai-summary__body">
        {front?.previewUrl ? (
          <img src={front.previewUrl} alt="Front of your card" />
        ) : (
          <span className="list-ai-summary__placeholder" aria-hidden="true">
            <ImagePlus />
          </span>
        )}
        <dl>
          <div>
            <dt>Card</dt>
            <dd>{form.name || "Not added"}</dd>
          </div>
          <div>
            <dt>Set</dt>
            <dd>{form.set || "Not added"}</dd>
          </div>
          <div>
            <dt>Number</dt>
            <dd>{form.cardNumber || "Not added"}</dd>
          </div>
          {form.year ? (
            <div>
              <dt>Year</dt>
              <dd>{form.year}</dd>
            </div>
          ) : null}
          <div>
            <dt>Condition</dt>
            <dd>
              {form.grader ? `${form.grader} ${form.grade || "grade pending"}` : "Raw / Ungraded"}
            </dd>
          </div>
        </dl>
      </div>
      <button type="button" className="list-ai-text-button" onClick={onViewDetails}>
        View details <ChevronRight aria-hidden="true" />
      </button>
    </section>
  );
}

function AiPhotosUsed({
  submission,
  graded,
  showAllPhotos,
  onToggleAll,
  onOpenImage,
}: {
  submission?: SubmissionDetail;
  graded: boolean;
  showAllPhotos: boolean;
  onToggleAll: () => void;
  onOpenImage: (url: string, title: string) => void;
}) {
  const analyzed = AI_REQUIRED_SLOTS.map((slot) => activeMedia(submission, slot));
  const allPhotos = (submission?.media ?? []).filter((item) => item.status === "SAFE");
  return (
    <section className="list-ai-panel list-ai-photos" aria-labelledby="ai-photos-title">
      <div className="list-ai-panel__heading">
        <h3 id="ai-photos-title">Photos used for AI review</h3>
        <span>{graded ? "Slab evidence" : "Front + Back"}</span>
      </div>
      <div className="list-ai-photo-pair">
        {analyzed.map((media, index) => {
          const title = index === 0 ? "Front" : "Back";
          return (
            <div key={AI_REQUIRED_SLOTS[index]} className="list-ai-photo-thumb">
              {media?.previewUrl ? (
                <button
                  type="button"
                  onClick={() => onOpenImage(media.previewUrl!, `${title} photo`)}
                >
                  <img src={media.previewUrl} alt={`${title} uploaded photo`} />
                  <Expand aria-hidden="true" />
                </button>
              ) : (
                <span className="list-ai-photo-thumb__empty">{title} not added</span>
              )}
              <span>{title}</span>
            </div>
          );
        })}
      </div>
      <div className="list-ai-photos__copy">
        <strong>{graded ? "Visible slab/card evidence" : "We analyze 2 photos"}</strong>
        <span>
          {graded
            ? "All evidence remains available to staff."
            : "Front and back are sent to Ximilar. Edge and detail views are staff evidence."}
        </span>
      </div>
      <button type="button" className="list-ai-text-button" onClick={onToggleAll}>
        {showAllPhotos
          ? "Hide evidence photos"
          : `View all photos${allPhotos.length ? ` (${allPhotos.length})` : ""}`}{" "}
        <ChevronRight aria-hidden="true" />
      </button>
      {showAllPhotos ? (
        <div className="list-ai-evidence-grid" aria-label="All uploaded evidence photos">
          {allPhotos.length ? (
            allPhotos.map((media) => (
              <button
                key={media.id}
                type="button"
                onClick={() =>
                  media.previewUrl && onOpenImage(media.previewUrl, slotLabel(media.slot))
                }
                disabled={!media.previewUrl}
              >
                {media.previewUrl ? (
                  <img src={media.previewUrl} alt={`${slotLabel(media.slot)} evidence`} />
                ) : null}
                <span>{slotLabel(media.slot)}</span>
              </button>
            ))
          ) : (
            <p>No safe evidence photos uploaded yet.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function RawPreGradeResult({
  submission,
  preGrade,
  pending,
  skipped,
  onAnalyze,
  onSkip,
  onOpenImage,
}: {
  submission?: SubmissionDetail;
  preGrade: RawCardPreGrade | null;
  pending: boolean;
  skipped: boolean;
  onAnalyze: () => void;
  onSkip: () => void;
  onOpenImage: (url: string, title: string) => void;
}) {
  const frontReady = activeMedia(submission, "front")?.status === "SAFE";
  const backReady = activeMedia(submission, "back")?.status === "SAFE";
  const ready = frontReady && backReady;
  const status = pending ? "IN_PROGRESS" : (preGrade?.status ?? (skipped ? "SKIPPED" : "READY"));
  const visualizations = preGrade?.visualizations ?? [];
  const frontOverview = visualizations.find(
    (item) => item.side === "FRONT" && item.type === "overview" && item.url,
  );
  const backOverview = visualizations.find(
    (item) => item.side === "BACK" && item.type === "overview" && item.url,
  );
  const centering = visualizations.find((item) => item.type === "centering" && item.url);
  if (status === "IN_PROGRESS") {
    return (
      <section className="list-ai-state" aria-live="polite">
        <LoaderCircle className="list-ai-state__icon is-spinning" aria-hidden="true" />
        <h3>Analyzing your card…</h3>
        <p>Ximilar is reviewing the Front and Back photos. This can take up to a minute.</p>
      </section>
    );
  }
  if (status === "SKIPPED") {
    return (
      <section className="list-ai-state">
        <CircleOff className="list-ai-state__icon" aria-hidden="true" />
        <h3>AI review skipped</h3>
        <p>Staff will still review your card, evidence, and submission details.</p>
        <div className="list-ai-actions">
          <button type="button" className="button-primary" disabled={!ready} onClick={onAnalyze}>
            Analyze my card
          </button>
        </div>
      </section>
    );
  }
  if (status === "STALE") {
    return (
      <section className="list-ai-state list-ai-state--warning">
        <CircleAlert className="list-ai-state__icon" aria-hidden="true" />
        <h3>Re-analysis required</h3>
        <p>The Front or Back photo changed, so the previous AI result is no longer current.</p>
        <AiReviewActions
          ready={ready}
          pending={false}
          onAnalyze={onAnalyze}
          onSkip={onSkip}
          label="Analyze again"
        />
      </section>
    );
  }
  if (status === "FAILED" || status === "TEMPORARILY_UNAVAILABLE" || status === "NOT_CONFIGURED") {
    return (
      <section className="list-ai-state list-ai-state--warning">
        <CircleAlert className="list-ai-state__icon" aria-hidden="true" />
        <h3>We couldn’t complete the AI review.</h3>
        <p>
          {status === "NOT_CONFIGURED"
            ? "AI review is not configured right now."
            : "The provider did not return a usable result. You can try again or continue to staff review."}
        </p>
        <AiReviewActions
          ready={ready}
          pending={false}
          onAnalyze={onAnalyze}
          onSkip={onSkip}
          label="Try again"
        />
        {preGrade?.errorCode ? (
          <small className="list-ai-state__technical">Reference: {preGrade.errorCode}</small>
        ) : null}
      </section>
    );
  }
  if (!preGrade || status !== "SUCCEEDED") {
    return (
      <section className="list-ai-ready">
        <div className="list-ai-ready__intro">
          <div className="list-ai-ready__icon">
            <Sparkles aria-hidden="true" />
          </div>
          <div>
            <span className="list-ai-eyebrow">Raw / ungraded card</span>
            <h3>Get a preliminary condition estimate</h3>
            <p>
              We’ll analyze the Front and Back photos only. The result is supporting evidence, not
              an official grade.
            </p>
          </div>
        </div>
        <div className="list-ai-readiness" aria-label="AI photo readiness">
          <div className={frontReady ? "is-ready" : "is-missing"}>
            {frontReady ? <Check aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
            <span>Front photo</span>
            <small>{frontReady ? "Ready" : "Add photo"}</small>
          </div>
          <div className={backReady ? "is-ready" : "is-missing"}>
            {backReady ? <Check aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
            <span>Back photo</span>
            <small>{backReady ? "Ready" : "Add photo"}</small>
          </div>
        </div>
        <div className="list-ai-ready__actions">
          <AiReviewActions
            ready={ready}
            pending={false}
            onAnalyze={onAnalyze}
            onSkip={onSkip}
            label="Analyze my card"
          />
          {!ready ? <small>Add safe Front and Back photos to enable the analysis.</small> : null}
        </div>
        <div className="list-ai-process" aria-label="AI review process">
          <span>
            <b>01</b> Analyze photos
          </span>
          <span>
            <b>02</b> Review estimate
          </span>
          <span>
            <b>03</b> Staff review
          </span>
        </div>
      </section>
    );
  }
  return (
    <section className="list-ai-result" aria-labelledby="ai-result-title">
      <div className="list-ai-result__top">
        <ScoreRing score={preGrade.overallEstimate} />
        <div className="list-ai-result__summary">
          <span className="list-ai-eyebrow">Overall result</span>
          <h3 id="ai-result-title">{preGrade.conditionLabel ?? "Condition estimate returned"}</h3>
          <p>
            {preGrade.conditionLabel
              ? `Ximilar returned ${preGrade.conditionLabel} from the supplied card photos.`
              : "Ximilar returned an overall condition estimate from the supplied card photos."}
          </p>
          <div className="list-ai-result__confidence">
            <ShieldCheck aria-hidden="true" />
            <span>Confidence</span>
            <strong>
              {preGrade.confidence === null
                ? "Not provided"
                : `${Math.round(preGrade.confidence)}%`}
            </strong>
          </div>
        </div>
        <span className="list-ai-review-status is-complete">Complete</span>
      </div>
      <div className="list-ai-score-grid">
        {[
          ["Corners", preGrade.cornerScore],
          ["Edges", preGrade.edgeScore],
          ["Surface", preGrade.surfaceScore],
          ["Centering", preGrade.centeringScore],
          ["Final grade", preGrade.overallEstimate],
        ]
          .filter(([, value]) => value !== null)
          .map(([label, value]) => (
            <div className="list-ai-score-card" key={String(label)}>
              <span>{label}</span>
              <strong>
                {formatAiScore(value as number)} <small>/10</small>
              </strong>
              <em>
                {label === "Final grade"
                  ? (preGrade.conditionLabel ?? "Overall estimate")
                  : "Score returned"}
              </em>
            </div>
          ))}
      </div>
      <div className="list-ai-visual-grid">
        <AnalysisVisualCard
          title="Front analysis"
          subtitle="Annotated result"
          visualization={frontOverview}
          onOpenImage={onOpenImage}
        />
        <AnalysisVisualCard
          title="Back analysis"
          subtitle="Annotated result"
          visualization={backOverview}
          onOpenImage={onOpenImage}
        />
        <AnalysisVisualCard
          title="Centering view"
          subtitle="Extracted card & centering"
          visualization={centering}
          onOpenImage={onOpenImage}
        />
      </div>
      <details className="list-ai-details">
        <summary>
          View full analysis details <ChevronRight aria-hidden="true" />
        </summary>
        <dl>
          <div>
            <dt>Provider</dt>
            <dd>{preGrade.provider}</dd>
          </div>
          <div>
            <dt>Model version</dt>
            <dd>{preGrade.providerVersion ?? "Not returned"}</dd>
          </div>
          <div>
            <dt>Analyzed</dt>
            <dd>{preGrade.analyzedAt ? formatDate(preGrade.analyzedAt) : "Not returned"}</dd>
          </div>
          <div>
            <dt>Front detected</dt>
            <dd>
              {preGrade.frontDetected === null
                ? "Not returned"
                : preGrade.frontDetected
                  ? "Yes"
                  : "No"}
            </dd>
          </div>
          <div>
            <dt>Back detected</dt>
            <dd>
              {preGrade.backDetected === null
                ? "Not returned"
                : preGrade.backDetected
                  ? "Yes"
                  : "No"}
            </dd>
          </div>
        </dl>
        {preGrade.warnings.length ? (
          <ul>
            {preGrade.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
      </details>
      <div className="list-ai-disclaimer">
        <Info aria-hidden="true" />
        <p>
          This is a preliminary AI estimate, not an official certification or authenticity decision.
          Slice staff review your submission before approval.
        </p>
      </div>
    </section>
  );
}

function AiReviewActions({
  ready,
  pending,
  onAnalyze,
  onSkip,
  label,
}: {
  ready: boolean;
  pending: boolean;
  onAnalyze: () => void;
  onSkip: () => void;
  label: string;
}) {
  return (
    <div className="list-ai-actions">
      <button
        type="button"
        className="button-primary"
        disabled={!ready || pending}
        onClick={onAnalyze}
      >
        {pending ? "Analyzing…" : label}
      </button>
      <button type="button" className="button-secondary" onClick={onSkip}>
        Skip AI review
      </button>
    </div>
  );
}

function ScoreRing({ score }: { score: number | null }) {
  const percent = score === null ? 0 : Math.min(Math.max(score / 10, 0), 1) * 100;
  return (
    <div
      className="list-ai-score-ring"
      style={{ "--score-progress": `${percent}%` } as CSSProperties}
      aria-label={
        score === null ? "Score not returned" : `Overall score ${formatAiScore(score)} out of 10`
      }
    >
      <strong>{score === null ? "—" : formatAiScore(score)}</strong>
      <span>/10</span>
    </div>
  );
}

function AnalysisVisualCard({
  title,
  subtitle,
  visualization,
  onOpenImage,
}: {
  title: string;
  subtitle: string;
  visualization?: RawCardVisualization;
  onOpenImage: (url: string, title: string) => void;
}) {
  return (
    <article className="list-ai-visual-card">
      <div>
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      {visualization?.url ? (
        <button type="button" onClick={() => onOpenImage(visualization.url!, title)}>
          <img src={visualization.url} alt={`${title} from Ximilar`} loading="lazy" />
          <span className="list-ai-visual-card__expand">
            <Expand aria-hidden="true" /> View larger
          </span>
        </button>
      ) : (
        <div className="list-ai-visual-card__empty">
          <Info aria-hidden="true" />
          <span>No provider visual returned</span>
        </div>
      )}
    </article>
  );
}

function GradedReviewPanel({ form }: { form: ListingForm }) {
  return (
    <section className="list-ai-graded-panel">
      <div className="list-ai-graded-panel__header">
        <div className="list-ai-graded-panel__identity">
          <div className="list-ai-ready__icon">
            <ShieldCheck aria-hidden="true" />
          </div>
          <div>
            <span className="list-ai-eyebrow">Existing grade verification</span>
            <h3>
              {form.grader} {form.grade || "Grade recorded"}
            </h3>
            <p>Slab details are captured for staff verification.</p>
          </div>
        </div>
        <span className="list-ai-review-status is-complete">Ready for review</span>
      </div>
      <div className="list-ai-graded-panel__details">
        <dl>
          <div>
            <dt>Card</dt>
            <dd>{form.name || "Not added"}</dd>
          </div>
          <div>
            <dt>Set / number</dt>
            <dd>{[form.set, form.cardNumber].filter(Boolean).join(" · ") || "Not added"}</dd>
          </div>
          <div>
            <dt>Certification</dt>
            <dd>{form.certificationNumber || "Not provided"}</dd>
          </div>
        </dl>
      </div>
      <div className="list-ai-graded-panel__notice">
        <Info aria-hidden="true" />
        <p>
          This AI review reads visible slab and card information only. It does not replace
          verification with the grading company.
        </p>
      </div>
    </section>
  );
}

function AiReviewGuidance({ graded }: { graded: boolean }) {
  return (
    <aside className="list-ai-review-right" aria-label="AI review guidance">
      <section className="list-ai-help-panel">
        <h3>About the AI review</h3>
        <p>
          {graded
            ? "This review reads visible slab and label details from the photos you provided."
            : "We use Ximilar’s AI to estimate visible card condition from the photos you provided."}
        </p>
        <ul>
          <li>Pre-grade estimate only</li>
          <li>Not an official certification</li>
          <li>Staff review required</li>
        </ul>
      </section>
      <section className="list-ai-help-panel">
        <h3>{graded ? "What staff will review" : "What the AI checks"}</h3>
        <ul>
          {(graded
            ? [
                "Card identity",
                "Grading company and label",
                "Grade and certification evidence",
                "Visible slab/card consistency",
              ]
            : [
                "Overall condition",
                "Corners",
                "Edges",
                "Surface",
                "Centering",
                "Image and card consistency",
              ]
          ).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <section className="list-ai-help-panel">
        <h3>Tips for best results</h3>
        <ul>
          <li>Use bright, even lighting</li>
          <li>Keep the card flat and in focus</li>
          <li>Avoid glare, shadows, and filters</li>
          <li>
            {graded
              ? "Show the full slab and label clearly"
              : "Photograph raw cards outside sleeves when safe"}
          </li>
          <li>Higher-resolution photos improve analysis</li>
        </ul>
      </section>
    </aside>
  );
}

function AiImageLightbox({
  title,
  url,
  onClose,
}: {
  title: string;
  url: string;
  onClose: () => void;
}) {
  return (
    <div
      className="list-ai-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div className="list-ai-lightbox__inner" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="list-ai-lightbox__close"
          onClick={onClose}
          aria-label="Close image viewer"
        >
          <X aria-hidden="true" />
        </button>
        <img src={url} alt={title} />
        <p>{title}</p>
      </div>
    </div>
  );
}

function formatAiScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function RawPreGradePanel({
  submission,
  preGrade,
  pending,
  onAnalyze,
}: {
  submission?: SubmissionDetail;
  preGrade: RawCardPreGrade | null;
  pending: boolean;
  onAnalyze: () => void;
}) {
  const ready = AI_REQUIRED_SLOTS.every((slot) => activeMedia(submission, slot)?.status === "SAFE");
  const visualizations = preGrade?.visualizations ?? [];
  const availableSides = Array.from(new Set(visualizations.map((item) => item.side)));
  const availableSideKey = availableSides.join(",");
  const [side, setSide] = useState<"FRONT" | "BACK">(
    availableSides.includes("FRONT") ? "FRONT" : "BACK",
  );
  const [view, setView] = useState<"overview" | "centering">("overview");
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    const nextSides = availableSideKey ? availableSideKey.split(",") : [];
    if (nextSides.length && !nextSides.includes(side)) setSide(nextSides[0] as "FRONT" | "BACK");
    setImageFailed(false);
  }, [preGrade?.id, availableSideKey, side]);
  const sideVisualizations = visualizations.filter((item) => item.side === side);
  const activeVisualization: RawCardVisualization | undefined =
    sideVisualizations.find((item) => item.type === view && item.url) ??
    sideVisualizations.find((item) => item.url);
  const hasOverview = sideVisualizations.some((item) => item.type === "overview" && item.url);
  const hasCentering = sideVisualizations.some((item) => item.type === "centering" && item.url);
  return (
    <section className="list-pregrade" aria-labelledby="pregrade-title">
      <div className="list-pregrade__header">
        <div>
          <p className="page-kicker">Optional · raw cards</p>
          <h3 id="pregrade-title">AI condition check</h3>
          <p>Want an estimate of your card&apos;s condition before submitting it?</p>
        </div>
        <span className="list-pregrade__badge">Recommended</span>
      </div>
      <p className="list-pregrade__guidance">
        For best results, photograph the card outside a sleeve, with the whole card in bright even
        light. Keep the camera straight above it and use the original high-resolution photo (a
        shorter side of about 2,000 px or more is ideal).
      </p>
      {preGrade?.status === "SUCCEEDED" ? (
        <div className="list-pregrade__result">
          {activeVisualization?.url && !imageFailed ? (
            <div className="list-pregrade__visual-report">
              <div className="list-pregrade__visual-panel">
                <span className="list-pregrade__visual-label">
                  Analyzed {side.toLowerCase()} card
                </span>
                <img
                  src={activeVisualization.url}
                  alt={`${side === "FRONT" ? "Front" : "Back"} card AI ${activeVisualization.type === "centering" ? "centering" : "analysis"}`}
                  loading="lazy"
                  onError={() => setImageFailed(true)}
                />
              </div>
              <div className="list-pregrade__visual-controls">
                {availableSides.length > 1 ? (
                  <div
                    className="list-pregrade__segmented"
                    role="group"
                    aria-label="Analyzed card side"
                  >
                    {availableSides.map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={side === item ? "is-active" : ""}
                        aria-pressed={side === item}
                        onClick={() => {
                          setSide(item);
                          setImageFailed(false);
                        }}
                      >
                        {item === "FRONT" ? "Front" : "Back"}
                      </button>
                    ))}
                  </div>
                ) : null}
                {hasOverview && hasCentering ? (
                  <div
                    className="list-pregrade__segmented"
                    role="group"
                    aria-label="Analysis visualization"
                  >
                    <button
                      type="button"
                      className={view === "overview" ? "is-active" : ""}
                      aria-pressed={view === "overview"}
                      onClick={() => {
                        setView("overview");
                        setImageFailed(false);
                      }}
                    >
                      Analysis
                    </button>
                    <button
                      type="button"
                      className={view === "centering" ? "is-active" : ""}
                      aria-pressed={view === "centering"}
                      onClick={() => {
                        setView("centering");
                        setImageFailed(false);
                      }}
                    >
                      Centering
                    </button>
                  </div>
                ) : null}
                <p>
                  {activeVisualization.type === "centering"
                    ? "Centering view shows detected card alignment and border proportions."
                    : "Ximilar's analysis visualization highlights the card areas used to estimate condition."}
                </p>
                {activeVisualization.centering &&
                Object.keys(activeVisualization.centering).length ? (
                  <dl className="list-pregrade__ratios">
                    {Object.entries(activeVisualization.centering).map(([label, value]) => (
                      <div key={label}>
                        <dt>{label.replaceAll("_", " ")}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
            </div>
          ) : visualizations.length ? (
            <div className="list-pregrade__visual-unavailable">
              Analysis image unavailable. Scores remain available below.
            </div>
          ) : null}
          <div className="list-pregrade__score-report">
            <div className="list-pregrade__estimate">
              <span>Slice Pre-Grade</span>
              <strong>{preGrade.overallEstimate ?? "—"}</strong>
              {preGrade.conditionLabel ? <small>{preGrade.conditionLabel}</small> : null}
            </div>
            <dl>
              {[
                ["Centering", preGrade.centeringScore],
                ["Corners", preGrade.cornerScore],
                ["Edges", preGrade.edgeScore],
                ["Surface", preGrade.surfaceScore],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt>{label}</dt>
                  <dd>{value ?? "Not returned"}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p>
            Slice Pre-Grade is an AI estimate based on your photos. It is not an official grading
            certification, and physical inspection may produce a different result.
          </p>
          <details className="list-pregrade__details">
            <summary>View analysis details</summary>
            <p>
              Slice analyzed centering, corners, edges, and surface condition from the submitted
              front and back photos.
            </p>
          </details>
          {preGrade.warnings.length ? (
            <ul>
              {preGrade.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : preGrade?.status === "TEMPORARILY_UNAVAILABLE" ? (
        <p className="list-pregrade__message">
          Condition analysis is temporarily unavailable. You can continue your submission or try
          again later.
        </p>
      ) : preGrade?.status === "NOT_CONFIGURED" ? (
        <p className="list-pregrade__message">
          AI condition analysis is not currently configured. You can continue your submission
          without it.
        </p>
      ) : preGrade?.status === "FAILED" ? (
        <p className="list-pregrade__message">
          We couldn&apos;t confidently analyze these photos. You can retake a photo or continue
          without the optional Pre-Grade.
        </p>
      ) : null}
      <button
        type="button"
        className="button-primary list-ai-action"
        disabled={
          !ready || pending || preGrade?.status === "SUCCEEDED" || preGrade?.status === "FAILED"
        }
        onClick={onAnalyze}
      >
        {pending
          ? "Analyzing your card…"
          : preGrade?.status === "SUCCEEDED"
            ? "Condition analyzed"
            : preGrade?.status === "FAILED"
              ? "Replace a photo to try again"
              : "Analyze My Card"}
      </button>
      {!ready ? (
        <small className="list-step-hint">
          Add safe front and back photos to enable the optional analysis.
        </small>
      ) : null}
      <p className="list-pregrade__disclosure">
        Slice uses image analysis to provide a preliminary condition estimate. It is not an official
        grading certification and does not set valuation or your card&apos;s RAW market identity.
      </p>
    </section>
  );
}

function DeliveryLocationStep({
  form,
  locations,
  loading,
  onChange,
}: {
  form: ListingForm;
  locations: CollectorVaultProjection[];
  loading: boolean;
  onChange: <K extends keyof ListingForm>(key: K, value: ListingForm[K]) => void;
}) {
  const selected = locations.find((location) => location.id === form.preferredIntakeLocationId);
  const methods = selected
    ? ([
        ...(selected.acceptingShipments ? (["SHIPMENT"] as const) : []),
        ...(selected.acceptingInPerson ? (["IN_PERSON"] as const) : []),
      ] as const)
    : [];
  return (
    <div className="list-step list-step--delivery-location">
      <header className="list-delivery-header">
        <div>
          <p className="page-kicker">Step 6</p>
          <h2>Choose where you&apos;ll send your collectible.</h2>
          <p>
            Your choice is saved with this private submission. Shipping instructions are issued only
            if Slice accepts it.
          </p>
        </div>
        <div className="list-delivery-private">
          <LockKeyhole aria-hidden="true" />
          <span>Saved privately</span>
        </div>
      </header>
      {loading ? <p className="list-step-hint">Loading approved Slice intake locations…</p> : null}
      {!loading && !locations.length ? (
        <div className="list-review-fallback">
          <strong>No approved intake locations are available right now.</strong>
          <p>
            Save your draft and try again later; Slice will never substitute an unapproved
            destination.
          </p>
        </div>
      ) : null}
      <div className="list-delivery-content">
        <section
          className="list-delivery-location-section"
          aria-labelledby="delivery-location-title"
        >
          <div className="list-delivery-section-heading">
            <div>
              <span className="list-ai-eyebrow">Approved network</span>
              <h3 id="delivery-location-title">Select an intake location</h3>
            </div>
            <span>{locations.length} available</span>
          </div>
          <div className="list-delivery-location-grid">
            {locations.map((location) => {
              const selectedLocation = location.id === form.preferredIntakeLocationId;
              return (
                <button
                  type="button"
                  key={location.id}
                  className={`list-delivery-location-card ${selectedLocation ? "is-selected" : ""}`}
                  onClick={() => {
                    onChange("preferredIntakeLocationId", location.id);
                    const onlyMethod =
                      location.acceptingShipments && !location.acceptingInPerson
                        ? "SHIPMENT"
                        : location.acceptingInPerson && !location.acceptingShipments
                          ? "IN_PERSON"
                          : "";
                    onChange("preferredDeliveryMethod", onlyMethod);
                  }}
                >
                  <span className="list-delivery-location-card__icon">
                    <MapPin aria-hidden="true" />
                  </span>
                  <span className="list-delivery-location-card__copy">
                    <strong>{location.displayName}</strong>
                    <span>
                      {location.region}, {location.countryCode} ·{" "}
                      {location.locationType.replaceAll("_", " ")}
                    </span>
                    <small>
                      {location.acceptingShipments ? "Shipping available" : ""}
                      {location.acceptingShipments && location.acceptingInPerson ? " · " : ""}
                      {location.acceptingInPerson ? "In-person drop-off available" : ""}
                    </small>
                  </span>
                  <span className="list-delivery-location-card__state">
                    {selectedLocation ? (
                      <Check aria-hidden="true" />
                    ) : (
                      <ChevronRight aria-hidden="true" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
      {selected ? (
        <section className="list-delivery-methods" aria-labelledby="delivery-method-title">
          <div className="list-delivery-methods__heading">
            <span className="list-delivery-methods__icon">
              <PackageCheck aria-hidden="true" />
            </span>
            <div>
              <span className="list-ai-eyebrow">Next step</span>
              <h3 id="delivery-method-title">How will you deliver your collectible?</h3>
              <p>{selected.displayName}</p>
            </div>
          </div>
          <div className="list-delivery-methods__options">
            {methods.map((method) => (
              <button
                key={method}
                type="button"
                className={`list-delivery-method ${form.preferredDeliveryMethod === method ? "is-selected" : ""}`}
                onClick={() => onChange("preferredDeliveryMethod", method)}
              >
                <span className="list-delivery-method__icon">
                  {method === "SHIPMENT" ? (
                    <Truck aria-hidden="true" />
                  ) : (
                    <MapPin aria-hidden="true" />
                  )}
                </span>
                <span>
                  <strong>
                    {method === "SHIPMENT" ? "Ship to this location" : "Deliver in person"}
                  </strong>
                  <small>
                    {method === "SHIPMENT"
                      ? "Receive shipping instructions after acceptance."
                      : "Bring the collectible directly to the location."}
                  </small>
                </span>
                <span className="list-delivery-method__check">
                  {form.preferredDeliveryMethod === method ? <Check aria-hidden="true" /> : null}
                </span>
              </button>
            ))}
          </div>
          <p className="list-delivery-methods__hint">
            {form.preferredDeliveryMethod === "IN_PERSON"
              ? "If accepted, you can bring the collectible directly to this approved Slice intake location. No tracking number is needed."
              : "If accepted, we’ll provide shipping instructions for this location."}
          </p>
        </section>
      ) : null}
    </div>
  );
}

export function ReviewStep({
  form,
  category,
  research,
  submission,
  preGrade,
  evidenceReady,
  deliveryLocation,
  onEdit,
  onTermsChange,
}: {
  form: ListingForm;
  category: string;
  research: MarketResearchSnapshot | null;
  submission?: SubmissionDetail;
  preGrade: RawCardPreGrade | null;
  evidenceReady: boolean;
  deliveryLocation?: CollectorVaultProjection;
  onEdit: (step: number) => void;
  onTermsChange: (checked: boolean) => void;
}) {
  const graded = Boolean(form.grader.trim() && form.grader !== "Ungraded");
  const reference = research ? marketReference(research) : null;
  const offerPercent = Number(form.offerIntentPercent);
  const validOffer = isValidPercent(form.offerIntentPercent);
  const marketComplete = Boolean(
    form.marketCheckAcknowledged && (form.marketCheckStatus || research),
  );
  const certificationVerified = submission?.certificationVerification?.status === "VERIFIED";
  const rawReviewComplete = graded || form.aiReviewSkipped || preGrade?.status === "SUCCEEDED";
  const cardDetailsComplete = Boolean(
    form.categoryId &&
    form.name.trim() &&
    form.year.trim() &&
    form.set.trim() &&
    form.cardNumber.trim(),
  );
  const requiredReady = requiredSlotsForGrading(graded).flatMap((slot) =>
    safeMediaForSlot(submission, slot),
  );
  const optionalReady = OPTIONAL_SLOTS.filter(
    ([slot]) => !(graded && slot === "grading-label"),
  ).flatMap(([slot]) => safeMediaForSlot(submission, slot));
  const checklist = [
    { label: "Card details provided", complete: cardDetailsComplete },
    {
      label: reference
        ? "Market reference checked"
        : research?.state === "NO_MATCHES"
          ? "Market check completed — manual review"
          : "Market check completed",
      complete: marketComplete,
    },
    { label: "Offer percentage selected", complete: validOffer },
    { label: "Required photos uploaded", complete: evidenceReady },
    {
      label: "Delivery location selected",
      complete: Boolean(deliveryLocation && form.preferredDeliveryMethod),
    },
    ...(graded
      ? [
          {
            label: certificationVerified
              ? "Certificate verified"
              : "Certificate verification pending",
            complete: certificationVerified,
          },
        ]
      : []),
    {
      label: graded
        ? "Graded-card review captured"
        : form.aiReviewSkipped
          ? "AI review skipped — staff review required"
          : "AI card review ready",
      complete: rawReviewComplete,
    },
    { label: "Submission terms acknowledged", complete: form.termsAcknowledged },
  ];
  const blockers = checklist.filter((item) => !item.complete).map((item) => item.label);
  const readyToSubmit = blockers.length === 0;
  const identity = [form.set, form.year, form.cardNumber].filter(Boolean).join(" · ");
  const grading = graded ? [form.grader, form.grade].filter(Boolean).join(" ") : "Raw / Ungraded";
  const estimateMinor = form.collectorExpectedValue
    ? majorToMinor(form.collectorExpectedValue)
    : null;
  const estimatePortionMinor =
    estimateMinor && validOffer ? portionOf(estimateMinor, offerPercent) : null;
  const aiStatus = graded
    ? "Graded card"
    : form.aiReviewSkipped
      ? "Skipped"
      : preGrade?.status === "SUCCEEDED"
        ? "Ready for staff review"
        : preGrade?.status === "IN_PROGRESS"
          ? "In progress"
          : preGrade?.status === "FAILED" || preGrade?.status === "STALE"
            ? "Needs attention"
            : preGrade?.status === "TEMPORARILY_UNAVAILABLE" ||
                preGrade?.status === "NOT_CONFIGURED"
              ? "Unavailable"
              : "Not run";
  const aiConfidence =
    !graded && preGrade?.status === "SUCCEEDED" && preGrade.confidence !== null
      ? `${confidenceLabel(preGrade.confidence)} (${preGrade.confidence}%)`
      : null;

  return (
    <div className="list-step list-step--review">
      <p className="page-kicker">Step 6</p>
      <h2>Review &amp; submit.</h2>
      <p>Check everything looks right before we review your submission.</p>

      <div className="list-review-layout">
        <div className="list-review-main">
          <ReviewSummary
            title="Card details"
            icon={<FileImage aria-hidden="true" />}
            onEdit={() => onEdit(2)}
          >
            <div className="list-review-card-title">
              <strong>{form.name || "Card name not provided"}</strong>
              <span>{identity || "Set, year, and card number not provided"}</span>
            </div>
            <ReviewRows
              rows={[
                ["Category", category],
                ["Grading", grading],
                ...(form.condition ? [["Condition", form.condition] as [string, string]] : []),
                ...(form.variant ? [["Variant", form.variant] as [string, string]] : []),
              ]}
            />
          </ReviewSummary>

          <ReviewSummary
            title="Market reference"
            icon={<ScanLine aria-hidden="true" />}
            onEdit={() => onEdit(3)}
          >
            {reference ? (
              <>
                <p className="list-review-muted">Matched collectible</p>
                <strong className="list-review-matched">
                  {[form.name, form.set, form.cardNumber].filter(Boolean).join(" · ")}
                </strong>
                <ReviewRows
                  rows={[
                    ["Provider", providerLabel(reference.provider)],
                    [
                      "Market reference value",
                      sourceMoney(reference.amountMinor, reference.currency),
                    ],
                    ["Currency", reference.currency],
                    ["Updated", formatDateTime(reference.updatedAt)],
                    ...(research?.dataQuality
                      ? [["Match quality", qualityLabel(research.dataQuality)] as [string, string]]
                      : []),
                  ]}
                />
              </>
            ) : research?.state === "NO_MATCHES" ? (
              <div className="list-review-fallback">
                <strong>No exact market reference found</strong>
                <p>Slice will review this collectible manually.</p>
              </div>
            ) : research?.state === "UNAVAILABLE" ? (
              <div className="list-review-fallback">
                <strong>Market source unavailable</strong>
                <p>Slice will review this collectible manually.</p>
              </div>
            ) : marketComplete ? (
              <div className="list-review-fallback">
                <strong>Manual market review requested</strong>
                <p>Slice will review this collectible manually.</p>
              </div>
            ) : (
              <div className="list-review-fallback">
                <strong>Market check not completed</strong>
                <p>Complete the market step before submitting your collectible.</p>
              </div>
            )}
            {!reference && estimateMinor ? (
              <div className="list-review-estimate">
                <span>Collector estimate</span>
                <strong>{sourceMoney(estimateMinor, form.collectorExpectedCurrency)}</strong>
                <small>Collector estimate only — not a Slice valuation.</small>
              </div>
            ) : null}
          </ReviewSummary>

          <ReviewSummary
            title="Offer intent"
            icon={<Sparkles aria-hidden="true" />}
            onEdit={() => onEdit(3)}
          >
            {validOffer ? (
              <>
                <div className="list-review-offer-head">
                  <strong>{formatPercentValue(offerPercent)}% of the collectible</strong>
                  <span>Intent only</span>
                </div>
                <p className="list-review-offer-copy">
                  You’d like to offer {formatPercentValue(offerPercent)}% and retain{" "}
                  {formatPercentValue(100 - offerPercent)}%.
                </p>
                {reference ? (
                  <p className="list-review-illustrative">
                    Reference-based portion (illustrative):{" "}
                    {sourceMoney(
                      portionOf(reference.amountMinor, offerPercent),
                      reference.currency,
                    )}
                  </p>
                ) : estimatePortionMinor ? (
                  <p className="list-review-illustrative">
                    Implied offered portion:{" "}
                    {sourceMoney(estimatePortionMinor, form.collectorExpectedCurrency)}
                  </p>
                ) : null}
                {!reference && estimateMinor ? (
                  <small className="list-review-disclaimer">
                    Collector estimate only — not a Slice valuation.
                  </small>
                ) : null}
              </>
            ) : (
              <div className="list-review-fallback">
                <strong>Offer percentage not selected</strong>
                <p>Choose your intended portion in the market step.</p>
              </div>
            )}
          </ReviewSummary>

          <ReviewSummary
            title="Photos"
            icon={<Camera aria-hidden="true" />}
            onEdit={() => onEdit(4)}
          >
            <p className="list-review-photo-count">
              <strong>
                {requiredReady.length} of {REQUIRED_SLOTS.length} required photos ready
              </strong>
              <span>{optionalReady.length} additional photos</span>
            </p>
            <div className="list-review-thumbnails" aria-label="Uploaded evidence photos">
              {requiredReady
                .concat(optionalReady)
                .slice(0, 9)
                .map((media) => (
                  <span key={media.id} className="list-review-thumbnail">
                    {media.previewUrl ? (
                      <img
                        src={media.previewUrl}
                        alt={`${slotLabel(media.slot)} evidence`}
                        loading="lazy"
                      />
                    ) : (
                      <FileImage aria-hidden="true" />
                    )}
                    <small>{slotLabel(media.slot)}</small>
                  </span>
                ))}
              {!requiredReady.length && !optionalReady.length ? (
                <span className="list-review-empty-photo">No ready photos yet</span>
              ) : null}
            </div>
          </ReviewSummary>

          <ReviewSummary
            title="Delivery"
            icon={<ShieldCheck aria-hidden="true" />}
            onEdit={() => onEdit(6)}
          >
            {deliveryLocation && form.preferredDeliveryMethod ? (
              <ReviewRows
                rows={[
                  [
                    "Preferred intake location",
                    `${deliveryLocation.displayName} · ${deliveryLocation.region}, ${deliveryLocation.countryCode}`,
                  ],
                  [
                    "Delivery method",
                    form.preferredDeliveryMethod === "IN_PERSON"
                      ? "In-person drop-off"
                      : "Ship to this location",
                  ],
                ]}
              />
            ) : (
              <div className="list-review-fallback">
                <strong>Delivery preference not selected</strong>
                <p>Choose an approved intake location before submitting.</p>
              </div>
            )}
          </ReviewSummary>

          <ReviewSummary
            title="AI Card Review"
            icon={<ShieldCheck aria-hidden="true" />}
            onEdit={() => onEdit(5)}
            actionLabel="View details"
          >
            <div className="list-review-ai-head">
              <div>
                <span className="list-review-muted">Status</span>
                <strong>{aiStatus}</strong>
              </div>
              {aiConfidence ? (
                <div>
                  <span className="list-review-muted">Overall confidence</span>
                  <strong>{aiConfidence}</strong>
                </div>
              ) : null}
            </div>
            {preGrade?.status === "SUCCEEDED" && preGrade.overallEstimate !== null ? (
              <p className="list-review-ai-score">
                AI Pre-Grade: {preGrade.overallEstimate.toFixed(1)} / 10
              </p>
            ) : null}
            <p className="list-review-disclaimer">
              AI results are not final. Our team reviews every submission before approval.
            </p>
          </ReviewSummary>

          <aside className="list-review-notice">
            <Info aria-hidden="true" />
            <p>
              Once submitted, our team will review your submission. We may contact you if we need
              more information.
            </p>
          </aside>

          <label className="list-terms-check list-review-terms">
            <input
              type="checkbox"
              checked={form.termsAcknowledged}
              onChange={(event) => onTermsChange(event.target.checked)}
            />
            <span>
              I understand this is a private submission for staff review and does not guarantee
              acceptance, valuation, custody, or marketplace publication.
            </span>
          </label>
        </div>

        <aside className="list-review-rail">
          <section className="list-review-rail-card list-review-timeline">
            <h3>What happens next?</h3>
            <ol>
              <li>
                <span>
                  <ScanLine aria-hidden="true" />
                </span>
                <div>
                  <strong>Team review</strong>
                  <p>Our team will review your submission.</p>
                </div>
              </li>
              <li>
                <span>
                  <CircleHelp aria-hidden="true" />
                </span>
                <div>
                  <strong>We may contact you</strong>
                  <p>If we need more details or clearer photos.</p>
                </div>
              </li>
              <li>
                <span>
                  <ShieldCheck aria-hidden="true" />
                </span>
                <div>
                  <strong>Valuation &amp; approval</strong>
                  <p>We’ll confirm the collectible and set a final approved valuation.</p>
                </div>
              </li>
              <li>
                <span>
                  <ChevronRight aria-hidden="true" />
                </span>
                <div>
                  <strong>Initial Offering (if approved)</strong>
                  <p>
                    If approved, you’ll review the final offering terms before the offering opens.
                  </p>
                </div>
              </li>
            </ol>
          </section>

          <section className="list-review-rail-card list-review-checklist">
            <h3>Submission checklist</h3>
            <ul>
              {checklist.map((item) => (
                <li key={item.label} className={item.complete ? "is-complete" : "is-incomplete"}>
                  {item.complete ? (
                    <Check aria-hidden="true" />
                  ) : (
                    <CircleAlert aria-hidden="true" />
                  )}
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
            <p className={readyToSubmit ? "is-ready" : "is-not-ready"} role="status">
              {readyToSubmit
                ? "Looks good! You’re ready to submit."
                : "A few items still need attention."}
            </p>
            {!readyToSubmit ? (
              <small>Complete the items marked for attention before submitting.</small>
            ) : null}
          </section>

          <section className="list-review-rail-card list-review-help">
            <div className="list-review-help__icon">
              <CircleHelp aria-hidden="true" />
            </div>
            <div>
              <h3>Need help?</h3>
              <p>View our submission guide or contact support if you have any questions.</p>
              <Link to="/how-it-works" className="list-review-guide-link">
                View guide <ChevronRight aria-hidden="true" />
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ReviewSummary({
  title,
  icon,
  actionLabel = "Edit",
  onEdit,
  children,
}: {
  title: string;
  icon: ReactNode;
  actionLabel?: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <section className="list-review-summary">
      <header className="list-review-summary__header">
        <div className="list-review-summary__title">
          <span>{icon}</span>
          <h3>{title}</h3>
        </div>
        <button type="button" onClick={onEdit}>
          {actionLabel}
        </button>
      </header>
      <div className="list-review-summary__content">{children}</div>
    </section>
  );
}

function ReviewRows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="list-review-rows">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value || "Not provided"}</dd>
        </div>
      ))}
    </dl>
  );
}
export function restoreWizardStep(submission: SubmissionDetail): number {
  if (
    Number.isSafeInteger(submission.currentStep) &&
    submission.currentStep >= 1 &&
    submission.currentStep <= 7
  )
    return submission.currentStep;

  const metadata = submission.declaredMetadata ?? {};
  const text = (key: string) =>
    typeof metadata[key] === "string" ? String(metadata[key]).trim() : "";
  if (!submission.categoryId || !text("name")) return 1;
  if (!text("year") || !text("set") || !text("cardNumber")) return 2;
  const marketStatus = text("marketCheckStatus");
  if (
    !metadata.marketCheckAcknowledged ||
    !["FOUND", "LIMITED", "NO_MATCHES", "UNAVAILABLE"].includes(marketStatus)
  )
    return 3;
  const graded = Boolean(text("grader") && text("grader") !== "Ungraded");
  if (
    !requiredSlotsForGrading(graded).every(
      (slot) => activeMedia(submission, slot)?.status === "SAFE",
    )
  )
    return 4;
  if (
    !graded &&
    metadata.aiReviewStatus !== "AI_REVIEW_SKIPPED" &&
    submission.preGrade?.status !== "SUCCEEDED"
  )
    return 5;
  if (!submission.preferredIntakeLocationId || !submission.preferredDeliveryMethod) return 6;
  if (metadata.termsAcknowledged !== true) return 7;
  return 7;
}

function MySubmissions({ submissions }: { submissions: AssetSubmission[] }) {
  return (
    <section className="list-my-submissions">
      <header>
        <div>
          <p className="page-kicker">Your saved drafts</p>
          <h2>Drafts and submissions will appear here.</h2>
        </div>
      </header>
      {submissions.length ? (
        <div>
          {submissions.slice(0, 6).map((item) =>
            item.status === "DRAFT" ? (
              <Link key={item.id} to="/list" search={{ draft: item.id }}>
                <FileImage />
                <span>
                  <strong>{submissionName(item.declaredMetadata)}</strong>
                  <small>
                    {submissionStatusLabel(item.status)} · Updated {formatDate(item.updatedAt)}
                  </small>
                  <b>Continue listing</b>
                </span>
                <ChevronRight />
              </Link>
            ) : (
              <Link key={item.id} to="/submissions/$id" params={{ id: item.id }}>
                <FileImage />
                <span>
                  <strong>{submissionName(item.declaredMetadata)}</strong>
                  <small>
                    {submissionStatusLabel(item.status)} · Updated {formatDate(item.updatedAt)}
                  </small>
                  <b>View submission</b>
                </span>
                <ChevronRight />
              </Link>
            ),
          )}
        </div>
      ) : (
        <p>Save your first listing to keep it private and continue whenever you’re ready.</p>
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
            <Link to="/list" search={{ draft: undefined }} className="button-secondary">
              List another card
            </Link>
            <Link to="/portfolio" className="button-secondary">
              Go to portfolio
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
  help,
  type = "text",
  min,
  max,
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  inputMode?: "numeric";
  help?: string;
  type?: "text" | "number";
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label>
      <span className="list-field-label">
        {label}
        {help ? <TooltipHint label={help} /> : null}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        type={type}
        min={min}
        max={max}
        step={step}
        maxLength={160}
      />
      {help ? <small className="list-field-help">{help}</small> : null}
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
  type TextField =
    | "name"
    | "manufacturer"
    | "year"
    | "set"
    | "cardNumber"
    | "edition"
    | "language"
    | "condition"
    | "grader"
    | "grade"
    | "designation"
    | "certificationNumber"
    | "details"
    | "playerOrCharacter"
    | "variant";
  const value = (key: TextField) => (form[key] ?? "").trim();
  const optional = (key: TextField) => (value(key) ? { [key]: value(key) } : {});
  const expectedValueMinor = form.collectorExpectedValue
    ? majorToMinor(form.collectorExpectedValue)
    : null;
  return {
    name: value("name"),
    ...optional("manufacturer"),
    ...optional("year"),
    ...optional("set"),
    ...optional("cardNumber"),
    ...optional("edition"),
    ...optional("language"),
    ...optional("condition"),
    ...optional("grader"),
    ...optional("grade"),
    ...optional("designation"),
    ...optional("certificationNumber"),
    ...optional("details"),
    ...optional("playerOrCharacter"),
    ...optional("variant"),
    ...(form.marketCheckStatus ? { marketCheckStatus: form.marketCheckStatus } : {}),
    marketCheckAcknowledged: form.marketCheckAcknowledged,
    ...(form.offerIntentMode
      ? {
          offerIntentMode: form.offerIntentMode === "custom" ? "CUSTOM" : form.offerIntentMode,
        }
      : {}),
    ...(form.offerIntentPercent.trim()
      ? { offerIntentPercent: form.offerIntentPercent.trim() }
      : {}),
    ...(expectedValueMinor
      ? {
          collectorExpectedValueMinor: expectedValueMinor,
          collectorExpectedCurrency: form.collectorExpectedCurrency,
        }
      : {}),
    ...(form.collectorReviewerNotes.trim()
      ? { collectorReviewerNotes: form.collectorReviewerNotes.trim() }
      : {}),
    ...(form.aiReviewSkipped ? { aiReviewStatus: "AI_REVIEW_SKIPPED" as const } : {}),
    ...(form.customerReference ? { customerReference: form.customerReference } : {}),
    termsAcknowledged: form.termsAcknowledged,
  };
}
function customerReferenceFromMetadata(value: unknown): CustomerReference | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const reference = value as Record<string, unknown>;
  return typeof reference.provider === "string" && typeof reference.normalizedUrl === "string"
    ? (value as CustomerReference)
    : undefined;
}
function activeMedia(submission: SubmissionDetail | undefined, slot: string) {
  return submission?.media.find((item) => item.slot === slot && item.status !== "DELETED");
}
function safeMediaForSlot(submission: SubmissionDetail | undefined, slot: string) {
  return submission?.media.filter((item) => item.slot === slot && item.status === "SAFE") ?? [];
}
function activeMediaForSlot(submission: SubmissionDetail | undefined, slot: string) {
  return submission?.media.filter((item) => item.slot === slot && item.status !== "DELETED") ?? [];
}
function requiredSlotsForGrading(graded: boolean) {
  return graded ? (["front", "back", "grading-label"] as const) : REQUIRED_SLOTS;
}

function missingRequiredPhotoCount(submission: SubmissionDetail | undefined, graded = false) {
  return requiredSlotsForGrading(graded).filter(
    (slot) => activeMedia(submission, slot)?.status !== "SAFE",
  ).length;
}
function photoStateLabel(status: SubmissionMedia["status"]) {
  switch (status) {
    case "PENDING_UPLOAD":
    case "UPLOADED":
      return "Processing…";
    case "SCANNING":
      return "Processing…";
    case "SAFE":
      return "Ready for review";
    case "REJECTED":
      return "Upload failed. Try again.";
    case "DELETED":
      return "Removed";
    default:
      return "Processing…";
  }
}
function slotLabel(slot: string) {
  return slot.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function referenceStatusLabel(status: CollectibleReferenceImport["status"]) {
  switch (status) {
    case "MATCH_FOUND":
      return "EXACT PRODUCT FOUND";
    case "PARTIAL_MATCH":
      return "MORE INFORMATION NEEDED";
    case "COULD_NOT_IDENTIFY":
      return "NO MATCH FOUND";
    case "PROVIDER_UNAVAILABLE":
      return "PROVIDER UNAVAILABLE";
    default:
      return "MORE INFORMATION NEEDED";
  }
}
function isPriceChartingUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return (
      url.protocol === "https:" &&
      [
        "pricecharting.com",
        "www.pricecharting.com",
        "m.pricecharting.com",
        "sportscardspro.com",
        "www.sportscardspro.com",
        "m.sportscardspro.com",
      ].includes(url.hostname.toLowerCase()) &&
      url.pathname.startsWith("/game/")
    );
  } catch {
    return false;
  }
}
function fileError(file: File) {
  if (!ACCEPTED_MEDIA_TYPES.has(file.type)) return "Choose a JPG, PNG, or WebP photo.";
  if (file.size > MAX_MEDIA_BYTES) return "Each photo must be 10 MB or smaller.";
  return null;
}
function formatBytes(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function marketReference(research: MarketResearchSnapshot) {
  const entries = [
    [research.snapshot.priceGuides, "PriceCharting"],
    [research.snapshot.sales, "Approved sales sources"],
    [research.snapshot.listings, "Approved listing sources"],
  ] as const;
  for (const [value, fallbackProvider] of entries) {
    if (!value) continue;
    const amountMinor = value.latestMinor ?? value.medianMinor ?? value.lowMinor;
    const currency = value.currency;
    if (!amountMinor || !currency) continue;
    const observation = research.observations
      .filter((item) => item.includedInSnapshot && item.currency === currency)
      .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0];
    return {
      amountMinor,
      currency,
      provider: observation?.providerCode.replaceAll("_", " ") ?? fallbackProvider,
      externalUrl: observation?.externalUrl ?? null,
      updatedAt: value.latestAt ?? observation?.observedAt ?? research.collectedAt,
    };
  }
  return null;
}
function qualityLabel(value: NonNullable<MarketResearchSnapshot["dataQuality"]>) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
function providerLabel(value: string) {
  const label = value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return label === "Pricecharting" ? "PriceCharting" : label;
}
function confidenceLabel(value: number) {
  return value >= 80 ? "High" : value >= 60 ? "Medium" : "Low";
}
function sourceMoney(amount: string, currency: string) {
  const supported = asSupportedCurrency(currency);
  if (supported) {
    return formatDisplayMoney(amount, supported, supported, null, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return `${currency} ${(Number(amount) / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
function portionOf(amountMinor: string, percent: number) {
  return Math.round((Number(amountMinor) * percent) / 100).toString();
}
function formatPercentValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "");
}
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}
function historyMilliseconds(value: "24H" | "7D" | "30D" | "90D" | "1Y") {
  const days =
    value === "24H" ? 1 : value === "7D" ? 7 : value === "30D" ? 30 : value === "90D" ? 90 : 365;
  return days * 24 * 60 * 60 * 1000;
}
function majorToMinor(value: string) {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return `${BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))}`;
}
function majorFromMinor(value: string) {
  if (!/^\d+$/.test(value)) return "";
  const minor = BigInt(value);
  return `${minor / 100n}.${String(minor % 100n).padStart(2, "0")}`;
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
