import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { AppRepositories } from "@/data/repositories";
import type {
  ISODateTime,
  MarketResearchSnapshot,
  RawCardPreGrade,
  SubmissionDetail,
} from "@/domain";
import { mockRepositories } from "@/mocks/repositories";
import { AppServicesProvider } from "@/providers/AppServicesProvider";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
}));
vi.mock("@/auth/use-session", () => ({ useSession: () => ({ isAuthenticated: true }) }));

import {
  AIReviewStep,
  DetailsStep,
  MarketStep,
  PhotosStep,
  ReviewStep,
  SubmissionPage,
  canResumeListing,
  formatGradeDisplay,
  restoreWizardStep,
} from "./list";
import { isValidPercent } from "./-list-validation";

const detailsForm = {
  categoryId: "cards",
  name: "Umbreon VMAX",
  manufacturer: "Nintendo",
  year: "2021",
  set: "Evolving Skies",
  cardNumber: "215/203",
  edition: "",
  playerOrCharacter: "Umbreon",
  variant: "Alternate Art",
  language: "English",
  grader: "",
  grade: "",
  certificationNumber: "",
  condition: "Near Mint",
  details: "",
  termsAcknowledged: false,
  marketCheckStatus: "" as const,
  marketCheckAcknowledged: false,
  offerIntentMode: "" as const,
  offerIntentPercent: "",
  collectorExpectedValue: "",
  collectorExpectedCurrency: "GBP",
  collectorReviewerNotes: "",
  aiReviewSkipped: false,
  customerReference: undefined,
};

const aiForm = { ...detailsForm };

const draftDetail = (currentStep: number): SubmissionDetail =>
  ({
    id: "draft-1",
    status: "DRAFT",
    version: 3,
    currentStep,
    categoryId: "cards",
    setId: null,
    gradeScaleEntryId: null,
    declaredMetadata: {
      name: "Umbreon VMAX",
      year: "2021",
      set: "Evolving Skies",
      cardNumber: "215/203",
      marketCheckStatus: "FOUND",
      marketCheckAcknowledged: true,
    },
    preferredIntakeLocationId: null,
    preferredDeliveryMethod: null,
    submittedAt: null,
    reviewedAt: null,
    decisionCode: null,
    createdAt: "2026-09-02T00:00:00.000Z" as ISODateTime,
    updatedAt: "2026-09-02T00:00:00.000Z" as ISODateTime,
    media: [],
    marketResearch: null,
  }) as SubmissionDetail;

function renderList() {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(
    ["catalogue", "submission-categories"],
    [{ id: "cards", slug: "cards", name: "Collectible cards", description: null }],
  );
  client.setQueryData(["submissions", "mine"], { items: [], nextCursor: null });
  const repositories: AppRepositories = {
    ...mockRepositories,
    catalogue: {
      listSubmissionCategories: async () => [
        { id: "cards", slug: "cards", name: "Collectible cards", description: null },
      ],
      listGradingCompanies: async () => [],
      listGrades: async () => [],
    },
    submissions: {
      ...mockRepositories.submissions,
      listOwn: async () => ({ items: [], nextCursor: null }),
    },
  };
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <AppServicesProvider repositories={repositories}>
        <SubmissionPage />
      </AppServicesProvider>
    </QueryClientProvider>,
  );
}

describe("resumed listing drafts", () => {
  it("reopens drafts and change requests in the listing wizard", () => {
    expect(canResumeListing("DRAFT")).toBe(true);
    expect(canResumeListing("CHANGES_REQUESTED")).toBe(true);
    expect(canResumeListing("IN_REVIEW")).toBe(false);
    expect(canResumeListing("APPROVED")).toBe(false);
  });

  it("uses the saved wizard step when it is valid", () => {
    expect(restoreWizardStep(draftDetail(4))).toBe(4);
  });

  it("derives the next incomplete step when no valid step is stored", () => {
    expect(restoreWizardStep(draftDetail(0))).toBe(4);
  });
});

describe("Step 5 media and grade display", () => {
  it("matches saved media slots regardless of legacy casing", () => {
    const html = renderToStaticMarkup(
      <AIReviewStep
        form={aiForm}
        submission={{
          ...draftDetail(5),
          media: [
            {
              id: "front-1",
              slot: "FRONT",
              mimeType: "image/jpeg",
              sizeBytes: 100,
              status: "SAFE",
              previewUrl: "https://private/front.jpg",
              createdAt: "2026-09-02T00:00:00.000Z" as ISODateTime,
              updatedAt: "2026-09-02T00:00:00.000Z" as ISODateTime,
            },
            {
              id: "back-1",
              slot: "BACK",
              mimeType: "image/jpeg",
              sizeBytes: 100,
              status: "SAFE",
              previewUrl: "https://private/back.jpg",
              createdAt: "2026-09-02T00:00:00.000Z" as ISODateTime,
              updatedAt: "2026-09-02T00:00:00.000Z" as ISODateTime,
            },
          ],
        }}
        preGrade={null}
        pending={false}
        graded={false}
        skipped={false}
        onAnalyze={() => undefined}
        onSkip={() => undefined}
        onViewDetails={() => undefined}
      />,
    );
    expect(html).toContain("https://private/front.jpg");
    expect(html).toContain("https://private/back.jpg");
    expect(html).not.toContain("Front not added");
    expect(html).not.toContain("Back not added");
  });

  it("keeps numeric official grades at two decimal places for display", () => {
    expect(formatGradeDisplay("10")).toBe("10.00");
    expect(formatGradeDisplay("9.5")).toBe("9.50");
    expect(formatGradeDisplay("Authentic")).toBe("Authentic");
  });
});

describe("Document 010 list asset UI", () => {
  it("renders the Step 5 raw-card start state without inventing a score or pass result", () => {
    const html = renderToStaticMarkup(
      <AIReviewStep
        form={aiForm}
        preGrade={null}
        pending={false}
        graded={false}
        skipped={false}
        onAnalyze={() => undefined}
        onSkip={() => undefined}
        onViewDetails={() => undefined}
      />,
    );
    expect(html).toContain("Ximilar pre-grade");
    expect(html).toContain("Analyze my card");
    expect(html).toContain("Front + Back");
    expect(html).not.toContain("8.7");
    expect(html).not.toContain("Pass");
  });

  it("renders only returned Step 5 values and real visualization URLs", () => {
    const result: RawCardPreGrade = {
      id: "pregrade-1",
      submissionId: "submission-1",
      provider: "XIMILAR",
      status: "SUCCEEDED",
      providerRequestId: "request-1",
      overallEstimate: 8.7,
      overallMin: null,
      overallMax: null,
      frontDetected: true,
      backDetected: true,
      centeringScore: 8.6,
      cornerScore: 8.9,
      edgeScore: 8.4,
      surfaceScore: 9.1,
      confidence: 93,
      conditionLabel: "Near Mint",
      autographDetected: null,
      categoryDetected: "Card",
      warnings: [],
      analysisFingerprint: "fingerprint",
      analyzedAt: "2025-05-09T10:42:00.000Z" as ISODateTime,
      providerVersion: "model-v1",
      errorCode: null,
      supersededAt: null,
      createdAt: "2025-05-09T10:42:00.000Z" as ISODateTime,
      updatedAt: "2025-05-09T10:42:00.000Z" as ISODateTime,
      visualizations: [
        { side: "FRONT", type: "overview", url: "https://private/front.webp", centering: null },
        { side: "BACK", type: "overview", url: "https://private/back.webp", centering: null },
      ],
    };
    const html = renderToStaticMarkup(
      <AIReviewStep
        form={aiForm}
        preGrade={result}
        pending={false}
        graded={false}
        skipped={false}
        onAnalyze={() => undefined}
        onSkip={() => undefined}
        onViewDetails={() => undefined}
      />,
    );
    expect(html).toContain("8.7");
    expect(html).toContain("93%");
    expect(html).toContain("Near Mint");
    expect(html).toContain("https://private/front.webp");
    expect(html).toContain("https://private/back.webp");
    expect(html).toContain("Complete");
    expect(html).not.toContain("rawResponse");
  });

  it("uses a separate slab-review branch for already graded cards", () => {
    const html = renderToStaticMarkup(
      <AIReviewStep
        form={{ ...aiForm, grader: "PSA", grade: "10", certificationNumber: "12345678" }}
        preGrade={null}
        pending={false}
        graded
        skipped={false}
        onAnalyze={() => undefined}
        onSkip={() => undefined}
        onViewDetails={() => undefined}
      />,
    );
    expect(html).toContain("Slab recognition");
    expect(html).toContain("Existing grade verification");
    expect(html).toContain("PSA 10");
    expect(html).toContain("does not replace verification with the grading company");
    expect(html).not.toContain("Ximilar returned");
  });

  it("renders front and back as required while keeping edge views optional", () => {
    const html = renderToStaticMarkup(
      <PhotosStep
        previews={{}}
        uploadingSlot={null}
        graded={false}
        uploadPending={false}
        removePending={false}
        onSelect={vi.fn()}
        onAdditionalSelect={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(html).toContain("Add photos of your card.");
    expect(html).toContain("0 of 2 added");
    expect(html).toContain("Top edge");
    expect(html).toContain("Bottom edge");
    expect(html).toContain("Left edge");
    expect(html).toContain("Right edge");
    expect(html).toContain("Additional photos");
    expect(html).toContain("multiple");
    expect(html).toContain("Raw card:");
    expect(html).toContain("View photo guide");
  });

  it("renders submission review workflow and never offers fabricated auction, price, shipping, or publication controls", () => {
    const html = renderList();
    expect(html).toContain("List your card in a few simple steps.");
    expect(html).toContain("What are you listing?");
    expect(html).toContain("Fastest option");
    expect(html).toContain("Paste a PriceCharting link");
    expect(html).toContain("Or enter it manually");
    expect(html).toContain("What happens next?");
    expect(html).toContain("Check the market");
    expect(html).toContain("Add photos");
    expect(html).toContain("Review &amp; submit");
    expect(html).toContain("My submissions");
    expect(html).toContain("Your saved drafts");
    expect(html).not.toContain("£2,500");
    expect(html).not.toContain("Publish now");
    expect(html).not.toContain("seller payout");
  });

  it("renders Step 2 as grouped beginner-friendly details and keeps raw grade disabled", () => {
    const html = renderToStaticMarkup(
      <DetailsStep
        form={detailsForm}
        onChange={() => undefined}
        gradingCompanies={[{ code: "PSA", name: "PSA" }]}
        grades={[]}
        gradesLoading={false}
      />,
    );
    expect(html).toContain("Core card details");
    expect(html).toContain("Optional identifying details");
    expect(html).toContain("Helpful, but not required");
    expect(html).toContain("Grading and condition");
    expect(html).toContain("Why we ask this");
    expect(html).toContain('value="2021"');
    expect(html).toContain('value="Evolving Skies"');
    expect(html).toContain('value="215/203"');
    expect(html).toContain("Not applicable for raw cards");
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-label="Show help: The year the card was released."');
    expect(html).toContain('aria-label="Show help: The overall condition of the card."');
    expect(html).not.toContain("Certification number");
    expect(html).not.toContain("Anything else we should know");
  });

  it("uses configured grade options when a grading company is selected", () => {
    const html = renderToStaticMarkup(
      <DetailsStep
        form={{ ...detailsForm, grader: "PSA", grade: "10.00" }}
        onChange={() => undefined}
        gradingCompanies={[{ code: "PSA", name: "PSA" }]}
        grades={[{ grade: "10.00", label: "10", conditionLabel: "Gem Mint" }]}
        gradesLoading={false}
      />,
    );
    expect(html).toContain("10.00 · Gem Mint");
    expect(html).not.toContain("Not applicable for raw cards");
  });

  it("checks graded certificates against Slice listings only", () => {
    const html = renderToStaticMarkup(
      <DetailsStep
        form={{
          ...detailsForm,
          grader: "PSA",
          grade: "10.00",
          gradeScaleEntryId: "psa-10",
          certificationNumber: "163184852",
        }}
        onChange={() => undefined}
        gradingCompanies={[{ code: "PSA", name: "PSA" }]}
        grades={[{ id: "psa-10", grade: "10.00", label: "10", conditionLabel: null }]}
        gradesLoading={false}
        verification={{
          id: "verification-1",
          companyCode: "PSA",
          certificationNumber: "163184852",
          normalizedCertificationNumber: "163184852",
          status: "CLEAR",
          verificationMode: "SLICE_DUPLICATE_CHECK",
          officialVerificationUrl: null,
          verifiedGrade: null,
          verifiedLabel: null,
          designation: null,
          gradeEra: null,
          verifiedAt: null,
          createdAt: "2026-09-02T00:00:00.000Z" as ISODateTime,
        }}
        verifyPending={false}
        onVerifyCertification={() => undefined}
      />,
    );
    expect(html).toContain("Check on Slice");
    expect(html).toContain("Certificate number available");
    expect(html).toContain("No matching certificate number is currently listed on Slice");
    expect(html).not.toContain("Official lookup requested");
    expect(html).not.toContain("Open official lookup");
  });

  it("renders a truthful matched market reference and offer intent without converting provider currency", () => {
    const research: MarketResearchSnapshot = {
      id: "research-1",
      state: "FOUND",
      dataQuality: "HIGH",
      identity: { name: "Umbreon VMAX" },
      sourceCoverage: { available: 1, unavailable: 0 },
      providerFailures: [],
      snapshot: {
        sales: null,
        listings: null,
        priceGuides: {
          count: 2,
          currency: "USD",
          medianMinor: "16250",
          latestMinor: "16250",
          latestAt: "2025-05-09T10:42:00.000Z",
        },
        referenceImageUrl: "https://cdn.pricecharting.test/umbreon.jpg",
        exactCompCount: 2,
        strongCompCount: 0,
        rejectedCompCount: 0,
      },
      collectedAt: "2025-05-09T10:42:00.000Z" as ISODateTime,
      observations: [
        {
          providerCode: "PRICECHARTING",
          externalReferenceId: "pc-1",
          externalUrl: "https://www.pricecharting.com/game/pokemon-evolving-skies/umbreon-vmax-215",
          observationType: "PRICE_GUIDE",
          originalTitle: "Umbreon VMAX",
          amountMinor: "16250",
          currency: "USD",
          observedAt: "2025-05-09T10:42:00.000Z" as ISODateTime,
          soldAt: null,
          grader: null,
          grade: null,
          variant: null,
          matchQuality: "EXACT",
          exclusionReason: null,
          includedInSnapshot: true,
        },
      ],
    };
    const html = renderToStaticMarkup(
      <MarketStep
        ready
        form={{ ...detailsForm, offerIntentMode: "25", offerIntentPercent: "25" }}
        category="Pokémon TCG"
        research={research}
        pending={false}
        onCheck={() => undefined}
        onChange={() => undefined}
        onContinueWithoutMarket={() => undefined}
      />,
    );
    expect(html).toContain("Check the market.");
    expect(html).toContain("Market reference value · USD");
    expect(html).toContain("$162.50");
    expect(html).not.toContain("£162.50");
    expect(html).toContain("You’d like to offer 25%");
    expect(html).toContain("You’d keep 75%");
    expect(html).toContain("Market references guide the review");
    expect(html).toContain("View source");
    expect(html).toContain('alt="Umbreon VMAX PriceCharting reference image"');
    expect(html).toContain("PriceCharting reference image");
  });

  it("keeps the no-match path available and exposes optional reviewer context", () => {
    const research: MarketResearchSnapshot = {
      id: "research-2",
      state: "NO_MATCHES",
      dataQuality: null,
      identity: {},
      sourceCoverage: { available: 0, unavailable: 1 },
      providerFailures: [],
      snapshot: {
        sales: null,
        listings: null,
        priceGuides: null,
        exactCompCount: 0,
        strongCompCount: 0,
        rejectedCompCount: 0,
      },
      collectedAt: "2025-05-09T10:42:00.000Z" as ISODateTime,
      observations: [],
    };
    const html = renderToStaticMarkup(
      <MarketStep
        ready
        form={{ ...detailsForm, offerIntentMode: "custom", offerIntentPercent: "33.5" }}
        category="Pokémon TCG"
        research={research}
        pending={false}
        onCheck={() => undefined}
        onChange={() => undefined}
        onContinueWithoutMarket={() => undefined}
      />,
    );
    expect(html).toContain("No exact market reference found");
    expect(html).toContain("That’s okay — you can still continue");
    expect(html).toContain("Expected total value");
    expect(html).toContain("Notes for reviewer");
    expect(html).toContain("Continue anyway");
    expect(html).toContain("You’d like to offer 33.5%");
    expect(html).not.toContain("£162.50");
  });

  it("keeps a PriceCharting link visible when its product has no usable value", () => {
    const research: MarketResearchSnapshot = {
      id: "research-without-value",
      state: "NO_MATCHES",
      dataQuality: null,
      identity: {},
      sourceCoverage: { available: 1, unavailable: 0 },
      providerFailures: [],
      snapshot: {
        sales: null,
        listings: null,
        priceGuides: null,
        exactCompCount: 0,
        strongCompCount: 0,
        rejectedCompCount: 0,
      },
      collectedAt: "2026-09-02T00:00:00.000Z" as ISODateTime,
      observations: [],
    };
    const html = renderToStaticMarkup(
      <MarketStep
        ready
        form={{
          ...detailsForm,
          customerReference: {
            provider: "PriceCharting",
            externalReferenceId: "baseball-cards-2026-topps-all-aces/shohei-ohtani-aa-1",
            normalizedUrl:
              "https://www.pricecharting.com/game/baseball-cards-2026-topps-all-aces/shohei-ohtani-aa-1",
            originalTitle: "Baseball Cards 2026 Topps All Aces Shohei Ohtani Aa #1",
            importedAt: "2026-09-02T00:00:00.000Z" as ISODateTime,
            matchQuality: "PARTIAL_MATCH",
            extractedIdentity: {},
          },
        }}
        category="Sports cards"
        research={research}
        pending={false}
        onCheck={() => undefined}
        onChange={() => undefined}
        onContinueWithoutMarket={() => undefined}
      />,
    );
    expect(html).toContain("PriceCharting product link saved");
    expect(html).toContain("no usable market value was returned");
    expect(html).toContain("Open saved PriceCharting reference");
    expect(html).toContain("Add context for the missing market value");
    expect(html).not.toContain("No exact market reference found");
  });

  it("renders the Step 6 review summary, truthful no-match state, offer intent, and guidance rail", () => {
    const research: MarketResearchSnapshot = {
      id: "research-review",
      state: "NO_MATCHES",
      dataQuality: null,
      identity: {},
      sourceCoverage: { available: 0, unavailable: 1 },
      providerFailures: [],
      snapshot: {
        sales: null,
        listings: null,
        priceGuides: null,
        exactCompCount: 0,
        strongCompCount: 0,
        rejectedCompCount: 0,
      },
      collectedAt: "2025-05-09T10:42:00.000Z" as ISODateTime,
      observations: [],
    };
    const html = renderToStaticMarkup(
      <ReviewStep
        form={{
          ...detailsForm,
          marketCheckStatus: "NO_MATCHES",
          marketCheckAcknowledged: true,
          offerIntentMode: "custom",
          offerIntentPercent: "62.5",
          collectorExpectedValue: "1000.00",
          collectorExpectedCurrency: "GBP",
          termsAcknowledged: false,
        }}
        category="Pokémon TCG"
        research={research}
        submission={undefined}
        preGrade={null}
        evidenceReady={false}
        onEdit={() => undefined}
        onTermsChange={() => undefined}
      />,
    );
    expect(html).toContain("Review &amp; submit.");
    expect(html).toContain("Card details");
    expect(html).toContain("No exact market reference found");
    expect(html).toContain("Slice will review this collectible manually.");
    expect(html).toContain("62.5% of the collectible");
    expect(html).toContain("You’d like to offer 62.5% and retain 37.5%");
    expect(html).toContain("Collector estimate only — not a Slice valuation.");
    expect(html).toContain("What happens next?");
    expect(html).toContain("Submission checklist");
    expect(html).toContain("Need help?");
    expect(html).toContain("View guide");
    expect(html).toContain("A few items still need attention.");
    expect(html).not.toContain("Final value");
    expect(html).not.toContain("Submit to Slice for review");
  });

  it("rejects invalid custom offer percentages", () => {
    expect(isValidPercent("0")).toBe(false);
    expect(isValidPercent("100.01")).toBe(false);
    expect(isValidPercent("40.5")).toBe(true);
    expect(isValidPercent("1e2")).toBe(false);
  });
});
