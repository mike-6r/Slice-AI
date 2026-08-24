# Discord Analytics

## Data collected

The bot stores only guild-scoped aggregate operational metadata: message and
support-message counts, joins/leaves, command outcome and latency totals,
active-member markers, community interaction markers, and worker health.
Message content, private modal content, command arguments, credentials, and
financial data are not analytics fields.

## Dashboard

`/analytics` is staff-only and exposes overview, engagement, community,
support, commands, publishing, health, and aggregate CSV export views for
24-hour, 7-day, and 30-day windows. Private staff responses use ephemeral
embeds. Export contains only daily aggregate rows.

## Retention

Analytics are written directly as daily aggregates; no raw event stream is
retained. The Discord worker prunes daily guild, channel, command, and member
aggregate rows after 400 days (13 months). Worker heartbeats expire after 90
days. Cleanup runs safely at worker startup and once daily.

## Validation

Unit tests cover canonical UTC buckets, bounded reporting periods, heartbeat
health, and retention windows. Prisma integration tests require `slice_test`.
