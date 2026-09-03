-- Pre-Sale terms are provisional. They may exist before final valuation,
-- ownership issuance, or a live secondary market exists.
ALTER TABLE "InitialOffering"
  ALTER COLUMN "ownershipSupplyPolicyId" DROP NOT NULL,
  ALTER COLUMN "valuationDecisionId" DROP NOT NULL;
