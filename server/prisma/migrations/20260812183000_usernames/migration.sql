ALTER TABLE "UserProfile" ADD COLUMN "usernameChangedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "UserProfile_publicUsername_lower_key"
  ON "UserProfile" (LOWER("publicUsername"));
