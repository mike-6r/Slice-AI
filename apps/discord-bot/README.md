# Slice AI Discord bot

Slice AI is a Discord companion to Slice. It provisions a premium community server and surfaces only authoritative Slice data once the corresponding HTTP contracts exist. It never holds financial authority, credentials, or KYC materials.

## Local run

1. Copy `.env.example` to `.env` and supply a bot token, client ID, and shared Slice `DATABASE_URL` through your local secret manager.
2. Run `npm run prisma:generate` after pulling Prisma schema changes, then apply migrations through Slice's normal database deployment workflow.
3. Run `npm run sync` to register the development command set.
4. Run `npm run dev`, then use `/setup preview` followed by the confirmation button.

The `/setup` command creates only Slice AI managed roles, categories, channels, permission overwrites, panels, and artwork. It persists guild-scoped logical resource keys and canonical panel message IDs in Slice PostgreSQL. The bot will fail startup if PostgreSQL is unavailable; it never falls back to local JSON in production.

## Security

Never enter a password, seed phrase, private key, ID image, banking credential, or API key in Discord. Account-linking, market events, portfolio data, verification state, and all financial operations require the Slice backend contracts documented in `docs/discord-bot-build-guide/BOT_API_REQUIREMENTS.md`.
