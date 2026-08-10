-- Document 003 durable identity repository constraints. Additive/forward-only.

ALTER TABLE "Session" ADD COLUMN "replacedBySessionId" TEXT;
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

ALTER TABLE "RoleAssignment" ADD COLUMN "revokedAt" TIMESTAMP(3);
DROP INDEX "RoleAssignment_userId_role_key";
CREATE INDEX "RoleAssignment_userId_role_revokedAt_idx" ON "RoleAssignment"("userId", "role", "revokedAt");
CREATE UNIQUE INDEX "RoleAssignment_active_user_role_key"
  ON "RoleAssignment"("userId", "role") WHERE "revokedAt" IS NULL;

ALTER TABLE "IdempotencyRecord"
  ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'default',
  ADD COLUMN "actorScope" TEXT NOT NULL DEFAULT 'system';
DROP INDEX "IdempotencyRecord_key_key";
CREATE UNIQUE INDEX "IdempotencyRecord_actorScope_scope_key_key"
  ON "IdempotencyRecord"("actorScope", "scope", "key");
