-- Document 005 access-control scope and active-grant uniqueness.
ALTER TABLE "RoleAssignment"
  ADD COLUMN "scopeType" TEXT NOT NULL DEFAULT 'GLOBAL',
  ADD COLUMN "scopeId" TEXT NOT NULL DEFAULT '*';

DROP INDEX "RoleAssignment_active_user_role_key";
DROP INDEX "RoleAssignment_userId_role_revokedAt_idx";
CREATE INDEX "RoleAssignment_userId_role_scopeType_scopeId_revokedAt_idx"
  ON "RoleAssignment"("userId", "role", "scopeType", "scopeId", "revokedAt");
CREATE UNIQUE INDEX "RoleAssignment_active_user_role_scope_key"
  ON "RoleAssignment"("userId", "role", "scopeType", "scopeId")
  WHERE "revokedAt" IS NULL;
