# Discord Command Inventory

The single registration source is
`apps/discord-bot/src/command-inventory.ts`; deployment and runtime both use
it. The current inventory has 64 commands.

## Member commands

`/account`, `/slice`, `/roles`, `/faq`, `/support`, `/level`, `/leaderboard`,
`/rep`, `/reputation`, `/achievements`, `/daily`, `/notifications`, `/suggest`,
`/birthday`, market read commands (`/card`, `/search`, `/value`, `/price`,
`/history`, `/top`, `/asset`, `/market`, `/collector`, `/vault`, `/portfolio`,
`/balance`, `/transactions`, `/watchlist`, `/profile`, `/price-alert`), and
community information commands (`/ask`, `/help`, `/summary`, `/insights`,
`/trending`, `/about`, `/status`, `/invite`, `/roadmap`, `/request`, `/offer`).

## Staff and administrator commands

`/setup`, `/configuration`, `/ops`, `/ticket`, `/tickets`, `/ticket-config`,
`/warn`, `/note`, `/timeout`, `/untimeout`, `/ban`, `/unban`, `/modcase`,
`/modhistory`, `/suggestion`, `/poll`, `/giveaway`, `/meme`, `/announce`,
`/embed`, `/schedule`, `/analytics`, and `/spotlight`.

Staff commands enforce their existing Discord permission and/or scoped-role
checks. `/analytics`, ticket operations, moderation, publishing, setup, and
Spotlight actions are guild-only and use ephemeral replies when information is
operational or private. Command rate limits are implemented at their service
boundaries where abuse is possible (for example verification, XP, reputation,
and ticket intake).

## Verification

Registration inventory is shared by `src/main.ts` and `src/deploy.ts`; this
prevents deployment/runtime drift. Use `npm run sync` only in an authorized
Discord environment.
