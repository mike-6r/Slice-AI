-- Financial provenance keeps seeded/demo balances queryable without allowing
-- them to become operational liabilities, revenue, or provider-liquidity data.
CREATE TYPE "FinancialDataClass" AS ENUM (
  'OPERATIONAL',
  'SANDBOX_REAL',
  'QA',
  'DEMO',
  'SEED'
);

ALTER TABLE "User" ADD COLUMN "financialDataClass" "FinancialDataClass" NOT NULL DEFAULT 'OPERATIONAL';
ALTER TABLE "FinancialAccount" ADD COLUMN "financialDataClass" "FinancialDataClass" NOT NULL DEFAULT 'OPERATIONAL';
ALTER TABLE "JournalTransaction" ADD COLUMN "financialDataClass" "FinancialDataClass" NOT NULL DEFAULT 'OPERATIONAL';
ALTER TABLE "CashReservation" ADD COLUMN "financialDataClass" "FinancialDataClass" NOT NULL DEFAULT 'OPERATIONAL';
ALTER TABLE "FinancialDeficit" ADD COLUMN "financialDataClass" "FinancialDataClass" NOT NULL DEFAULT 'OPERATIONAL';
ALTER TABLE "FinancialAdjustmentRequest" ADD COLUMN "financialDataClass" "FinancialDataClass" NOT NULL DEFAULT 'OPERATIONAL';
ALTER TABLE "PortfolioLot" ADD COLUMN "financialDataClass" "FinancialDataClass" NOT NULL DEFAULT 'OPERATIONAL';
ALTER TABLE "FinancialReconciliationRun" ADD COLUMN "financialDataClass" "FinancialDataClass" NOT NULL DEFAULT 'OPERATIONAL';
ALTER TABLE "MoneyMovement" ADD COLUMN "financialDataClass" "FinancialDataClass" NOT NULL DEFAULT 'OPERATIONAL';
ALTER TABLE "TradingOrder" ADD COLUMN "financialDataClass" "FinancialDataClass" NOT NULL DEFAULT 'OPERATIONAL';
ALTER TABLE "TradingExecution" ADD COLUMN "financialDataClass" "FinancialDataClass" NOT NULL DEFAULT 'OPERATIONAL';

CREATE INDEX "FinancialAccount_financialDataClass_ownerType_currency_idx" ON "FinancialAccount"("financialDataClass", "ownerType", "currency");
CREATE INDEX "JournalTransaction_financialDataClass_currency_effectiveAt_id_idx" ON "JournalTransaction"("financialDataClass", "currency", "effectiveAt", "id");
CREATE INDEX "CashReservation_financialDataClass_status_purposeType_idx" ON "CashReservation"("financialDataClass", "status", "purposeType");
CREATE INDEX "FinancialDeficit_financialDataClass_status_createdAt_id_idx" ON "FinancialDeficit"("financialDataClass", "status", "createdAt", "id");
CREATE INDEX "FinancialAdjustmentRequest_financialDataClass_status_createdAt_id_idx" ON "FinancialAdjustmentRequest"("financialDataClass", "status", "createdAt", "id");
CREATE INDEX "PortfolioLot_financialDataClass_userId_assetId_acquiredAt_id_idx" ON "PortfolioLot"("financialDataClass", "userId", "assetId", "acquiredAt", "id");
CREATE INDEX "FinancialReconciliationRun_financialDataClass_scope_createdAt_id_idx" ON "FinancialReconciliationRun"("financialDataClass", "scope", "createdAt", "id");
CREATE INDEX "MoneyMovement_financialDataClass_status_createdAt_id_idx" ON "MoneyMovement"("financialDataClass", "status", "createdAt", "id");
CREATE INDEX "TradingOrder_financialDataClass_assetId_status_createdAt_id_idx" ON "TradingOrder"("financialDataClass", "assetId", "status", "createdAt", "id");
CREATE INDEX "TradingExecution_financialDataClass_assetId_executedAt_id_idx" ON "TradingExecution"("financialDataClass", "assetId", "executedAt", "id");
