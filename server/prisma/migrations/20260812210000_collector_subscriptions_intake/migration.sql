CREATE TYPE "CollectorPlanCode" AS ENUM ('STARTER', 'PRO', 'ELITE');
CREATE TYPE "CollectorSubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCEL_AT_PERIOD_END', 'CANCELLED', 'EXPIRED');
CREATE TYPE "IntakeShipmentStatus" AS ENUM ('LABEL_CREATED', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION', 'UNKNOWN');
CREATE TYPE "IntakeStatus" AS ENUM ('VAULT_SELECTED', 'SHIPPING_REQUIRED', 'IN_TRANSIT', 'DELIVERED', 'RECEIVED', 'VERIFICATION', 'COMPLETE');

CREATE TABLE "CollectorPlan" (
  "id" TEXT NOT NULL,
  "code" "CollectorPlanCode" NOT NULL,
  "displayName" TEXT NOT NULL,
  "monthlyPriceMinor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'GBP',
  "entitlements" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CollectorPlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CollectorPlan_code_key" ON "CollectorPlan"("code");

CREATE TABLE "CollectorSubscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "status" "CollectorSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "provider" TEXT,
  "providerSubscriptionId" TEXT,
  "currentPeriodEnd" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CollectorSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CollectorSubscription_providerSubscriptionId_key" ON "CollectorSubscription"("providerSubscriptionId");
CREATE INDEX "CollectorSubscription_userId_status_updatedAt_idx" ON "CollectorSubscription"("userId", "status", "updatedAt");
ALTER TABLE "CollectorSubscription" ADD CONSTRAINT "CollectorSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CollectorSubscription" ADD CONSTRAINT "CollectorSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CollectorPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "VaultIntakeLocation" (
  "id" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "intakeAvailable" BOOLEAN NOT NULL DEFAULT true,
  "acceptedCategories" JSONB,
  "shippingInstructions" TEXT NOT NULL,
  "customerSafeAddress" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VaultIntakeLocation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VaultIntakeLocation_active_intakeAvailable_countryCode_id_idx" ON "VaultIntakeLocation"("active", "intakeAvailable", "countryCode", "id");

CREATE TABLE "SubmissionIntake" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "vaultId" TEXT NOT NULL,
  "status" "IntakeStatus" NOT NULL DEFAULT 'VAULT_SELECTED',
  "intakeReference" TEXT NOT NULL,
  "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "shippedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubmissionIntake_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SubmissionIntake_submissionId_key" ON "SubmissionIntake"("submissionId");
CREATE UNIQUE INDEX "SubmissionIntake_intakeReference_key" ON "SubmissionIntake"("intakeReference");
CREATE INDEX "SubmissionIntake_vaultId_status_updatedAt_id_idx" ON "SubmissionIntake"("vaultId", "status", "updatedAt", "id");
ALTER TABLE "SubmissionIntake" ADD CONSTRAINT "SubmissionIntake_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "AssetSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubmissionIntake" ADD CONSTRAINT "SubmissionIntake_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "VaultIntakeLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "IntakeShipment" (
  "id" TEXT NOT NULL,
  "intakeId" TEXT NOT NULL,
  "carrier" TEXT NOT NULL,
  "trackingNumber" TEXT NOT NULL,
  "shippedAt" TIMESTAMP(3) NOT NULL,
  "status" "IntakeShipmentStatus" NOT NULL DEFAULT 'SHIPPED',
  "deliveredAt" TIMESTAMP(3),
  "lastCheckedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntakeShipment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntakeShipment_intakeId_key" ON "IntakeShipment"("intakeId");
CREATE INDEX "IntakeShipment_status_updatedAt_id_idx" ON "IntakeShipment"("status", "updatedAt", "id");
ALTER TABLE "IntakeShipment" ADD CONSTRAINT "IntakeShipment_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "SubmissionIntake"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "IntakeReceiptConfirmation" (
  "id" TEXT NOT NULL,
  "intakeId" TEXT NOT NULL,
  "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedById" TEXT NOT NULL,
  "shipmentRef" TEXT,
  "auditReference" TEXT,
  CONSTRAINT "IntakeReceiptConfirmation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntakeReceiptConfirmation_intakeId_key" ON "IntakeReceiptConfirmation"("intakeId");
CREATE INDEX "IntakeReceiptConfirmation_confirmedById_confirmedAt_id_idx" ON "IntakeReceiptConfirmation"("confirmedById", "confirmedAt", "id");
ALTER TABLE "IntakeReceiptConfirmation" ADD CONSTRAINT "IntakeReceiptConfirmation_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "SubmissionIntake"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntakeReceiptConfirmation" ADD CONSTRAINT "IntakeReceiptConfirmation_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
