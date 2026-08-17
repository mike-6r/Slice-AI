-- Additive Phase 2 workflow state. Existing Phase 1 records retain their state.
ALTER TYPE "InitialOfferingStatus" ADD VALUE 'CHANGES_REQUESTED';
ALTER TABLE "InitialOffering" ADD COLUMN "changeRequestReason" TEXT;
