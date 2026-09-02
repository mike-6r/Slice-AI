-- CreateTable
CREATE TABLE "AccountAdminOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetKey" TEXT,
    "forcedState" TEXT,
    "normalBlocker" TEXT,
    "reason" TEXT NOT NULL,
    "beforeState" JSONB NOT NULL,
    "afterState" JSONB NOT NULL,
    "affectedCapabilities" TEXT[] NOT NULL,
    "source" TEXT NOT NULL,
    "incidentReference" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountAdminOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountAdminOverride_userId_targetType_targetKey_expiresAt_idx" ON "AccountAdminOverride"("userId", "targetType", "targetKey", "expiresAt");

-- CreateIndex
CREATE INDEX "AccountAdminOverride_actorUserId_createdAt_idx" ON "AccountAdminOverride"("actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "AccountAdminOverride" ADD CONSTRAINT "AccountAdminOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountAdminOverride" ADD CONSTRAINT "AccountAdminOverride_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
