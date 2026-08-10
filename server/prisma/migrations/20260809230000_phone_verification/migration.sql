ALTER TABLE "User"
  ADD COLUMN "phoneE164" TEXT,
  ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_phoneE164_key" ON "User"("phoneE164");

CREATE TABLE "PhoneVerificationChallenge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "phoneE164" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "supersededAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PhoneVerificationChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PhoneVerificationChallenge_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PhoneVerificationChallenge_userId_phoneE164_createdAt_idx"
  ON "PhoneVerificationChallenge"("userId", "phoneE164", "createdAt");
CREATE INDEX "PhoneVerificationChallenge_userId_consumedAt_supersededAt_expiresAt_idx"
  ON "PhoneVerificationChallenge"("userId", "consumedAt", "supersededAt", "expiresAt");
