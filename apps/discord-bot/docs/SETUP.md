# Admin setup

Create a Discord application and bot in the Discord Developer Portal, enable the **Guilds** intent, and invite it with `Manage Roles`, `Manage Channels`, `Manage Messages`, `Send Messages`, `Embed Links`, `Attach Files`, and `Use Application Commands`. Put the Slice AI role above roles it must manage.

Set `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, and a development `DISCORD_DEV_GUILD_ID` in a local secret store or deployment secret manager. Run `npm run sync`, start the gateway with `npm run dev`, run `/setup preview`, and click **Apply setup**. Then run `/setup status`.

Setup never deletes or renames unrelated server resources. It reconciles only IDs that it previously recorded and matching Slice-managed resource names. A failed/partial setup can safely be run again.

## Persistence and repair

`DiscordGuildConfig`, `DiscordManagedResource`, and `DiscordPanel` are guild-scoped PostgreSQL tables in Slice's Prisma schema. A logical key such as `CHANNEL:market-feed`, not a display name, identifies every managed resource. The persisted Discord ID is preferred during repair; if a stale ID has multiple matching candidates, setup reports **AMBIGUOUS** and does not delete or select a resource.

`/setup repair` first produces an ephemeral reconciliation preview. It detects missing, renamed, moved, stale, and permission-drifted managed resources, plus missing panel messages. Only the administrator who opened the preview can apply it. `/setup status` compares Discord's current state with persisted records and reports READY, PARTIAL, DRIFTED, AMBIGUOUS, or UPDATE AVAILABLE. Setup manifest version changes require an explicit repair/apply run.
