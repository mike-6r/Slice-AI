# Slice AI Discord configuration

All operator-facing Discord presentation and provisioning defaults live in `config/` as UTF-8 YAML. Secrets never belong in these files: keep the bot token, database URL, backend credentials, provider keys, and signing/encryption secrets in `.env`.

## Files

- `config.yml` controls configuration versioning and the safe reload policy.
- `branding.yml` contains the Slice name, embed palette, footer, optional image URLs, and emoji map. All `SliceEmbed` output consumes this shared palette and footer.
- `setup.yml` defines stable logical keys and their display names for roles, categories, channels, topics, ordering, and setup panels. Logical keys are database-facing and must not be changed after a server is provisioned.
- `onboarding.yml` holds the FAQ and onboarding/support presentation.
- `tickets.yml` holds ticket categories, labels, emojis, lifecycle presentation, and inactivity timings. Ticket state transitions and authorization remain code-owned.
- `moderation.yml` holds moderation/log presentation and operator-owned automod limits. Permissions, hierarchy checks, and enforcement safeguards remain code-owned.
- `progression.yml` holds XP/reputation presentation values, milestones, and achievements. Database integrity remains code-owned.
- `community.yml` contains editable daily and weekly prompt pools plus community message templates.
- `notifications.yml` configures notification-role display labels, emojis, descriptions, and selector text. Stable logical keys remain internal.
- `market.yml` configures market presentation labels and empty/unavailable states only; prices, balances, and portfolio data remain backend-authoritative.
- `ai.yml` configures AI presentation and disclaimers. Privacy and financial-advice protections remain enforced by code.
- `commands.yml` contains command and option presentation descriptions. Slash-command identifiers remain stable and code-owned.
- `messages.yml` contains shared error/success presentation.

## Templates and colors

Message entries use `title`, `description`, `color`, and optional `footer`, `thumbnail`, `image`, and `timestamp`. Supported placeholders are `{user}`, `{username}`, `{level}`, `{xp}`, `{ticket_id}`, `{asset}`, `{price}`, `{status}`, `{reason}`, `{duration}`, `{count}`, `{rank}`, `{amount}`, `{streak}`, `{reference}`, and `{action}`. Unknown placeholders fail validation at startup/reload; absent runtime values render safely as an empty string.

Colors must be six-digit hex values, for example `"#22D3A5"`. Use logical color names `info`, `success`, `warning`, `error`, and `staff` in message entries.

## Reloading

An administrator can use `/config reload` to validate and atomically reload safe YAML presentation. A failed reload leaves the previously active configuration untouched. Environment variables, credentials, database settings, Discord intents, and other unsafe runtime initialization settings are restart-required.

Run `npm run setup-check` after editing YAML. It validates every configuration file, resource-key uniqueness, category references, colors, bounded values, and placeholders before Discord setup or runtime use.
