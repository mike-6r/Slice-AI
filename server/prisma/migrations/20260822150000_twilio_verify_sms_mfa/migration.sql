CREATE TYPE "PhoneVerificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
CREATE TYPE "TwoFactorMethod" AS ENUM ('TOTP', 'SMS');

ALTER TABLE "PhoneVerificationChallenge"
  ADD COLUMN "deliveryStatus" "PhoneVerificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "deliveryFailedAt" TIMESTAMP(3);

CREATE INDEX "PhoneVerificationChallenge_userId_deliveryStatus_createdAt_idx"
  ON "PhoneVerificationChallenge"("userId", "deliveryStatus", "createdAt");

CREATE TABLE "UserSmsTwoFactor" (
  "userId" TEXT NOT NULL,
  "phoneE164" TEXT NOT NULL,
  "enabledAt" TIMESTAMP(3),
  "enrollmentStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserSmsTwoFactor_pkey" PRIMARY KEY ("userId")
);

CREATE INDEX "UserSmsTwoFactor_enabledAt_idx" ON "UserSmsTwoFactor"("enabledAt");
ALTER TABLE "UserSmsTwoFactor"
  ADD CONSTRAINT "UserSmsTwoFactor_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TwoFactorRecoveryCode"
  DROP CONSTRAINT "TwoFactorRecoveryCode_userId_fkey";
ALTER TABLE "TwoFactorRecoveryCode"
  ADD CONSTRAINT "TwoFactorRecoveryCode_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TwoFactorLoginChallenge"
  ADD COLUMN "method" "TwoFactorMethod" NOT NULL DEFAULT 'TOTP',
  ADD COLUMN "phoneE164" TEXT,
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastSentAt" TIMESTAMP(3);
