-- CreateTable
CREATE TABLE "DiscordAccountLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordAccountLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscordOAuthState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordOAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscordAccountLink_userId_key" ON "DiscordAccountLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordAccountLink_discordUserId_key" ON "DiscordAccountLink"("discordUserId");

-- CreateIndex
CREATE INDEX "DiscordAccountLink_discordUserId_idx" ON "DiscordAccountLink"("discordUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordOAuthState_stateHash_key" ON "DiscordOAuthState"("stateHash");

-- CreateIndex
CREATE INDEX "DiscordOAuthState_userId_expiresAt_idx" ON "DiscordOAuthState"("userId", "expiresAt");

-- AddForeignKey
ALTER TABLE "DiscordAccountLink" ADD CONSTRAINT "DiscordAccountLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscordOAuthState" ADD CONSTRAINT "DiscordOAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
