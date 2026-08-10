-- CreateTable
CREATE TABLE "UserTwoFactor" (
    "userId" TEXT NOT NULL,
    "secretCiphertext" TEXT NOT NULL,
    "enabledAt" TIMESTAMP(3),
    "enrollmentStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTwoFactor_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "TwoFactorRecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwoFactorRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwoFactorLoginChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwoFactorLoginChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserTwoFactor_enabledAt_idx" ON "UserTwoFactor"("enabledAt");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorRecoveryCode_codeHash_key" ON "TwoFactorRecoveryCode"("codeHash");

-- CreateIndex
CREATE INDEX "TwoFactorRecoveryCode_userId_consumedAt_idx" ON "TwoFactorRecoveryCode"("userId", "consumedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorLoginChallenge_tokenHash_key" ON "TwoFactorLoginChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "TwoFactorLoginChallenge_userId_consumedAt_expiresAt_idx" ON "TwoFactorLoginChallenge"("userId", "consumedAt", "expiresAt");

-- AddForeignKey
ALTER TABLE "UserTwoFactor" ADD CONSTRAINT "UserTwoFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwoFactorRecoveryCode" ADD CONSTRAINT "TwoFactorRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserTwoFactor"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwoFactorLoginChallenge" ADD CONSTRAINT "TwoFactorLoginChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
