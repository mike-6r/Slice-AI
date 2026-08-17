# Slice Discord VPS Deployment QA

Date: 17 August 2026

## Deployment

- VPS: `51.38.81.9`
- Runtime user: `slice`
- Active application root: `/opt/slice/app`
- Active application release: `20260817-c924449`
- Bot service: `slice-discord.service`
- Notification worker: `slice-discord-worker.service`
- Bot entrypoint: `apps/discord-bot/dist/main.js`
- Worker entrypoint: `apps/discord-bot/dist/worker.js`
- Runtime: Node.js `/usr/bin/node`; TypeScript build completed successfully
- Database authority: existing VPS PostgreSQL through `DATABASE_URL`

The bot uses the existing TypeScript implementation. No Discord product was
rebuilt. No financial, marketplace, Umbreon, or Charizard workflow was run.

## Environment safety

```text
DISCORD_BOT_TOKEN=SET
DISCORD_CLIENT_ID=SET
DISCORD_DEV_GUILD_ID=SET
SLICE_API_BASE_URL=SET — staging API authority
SLICE_WEB_BASE_URL=SET — staging web authority
DISCORD_BOT_SERVICE_TOKEN=SET
SLICE_BOT_SERVICE_TOKEN=SET
DATABASE_URL=SET
Secrets leaked to logs or documentation: NO
```

The bot token and service token are stored only in `/etc/slice/slice.env`.
The repository example file contains placeholders only.

## Implementation inventory

Primary files:

- `apps/discord-bot/src/main.ts` — gateway, command routing, component routing,
  guild-scoped command synchronization, health endpoint
- `apps/discord-bot/src/worker.ts` — notification delivery, ticket inactivity,
  community lifecycle worker
- `apps/discord-bot/src/config.ts` — validated runtime environment schema
- `apps/discord-bot/src/deploy.ts` — command synchronization
- `apps/discord-bot/src/command-inventory.ts` — single command source of truth
- `apps/discord-bot/src/slice-backend-client.ts` — typed public and service API
  boundary
- `apps/discord-bot/src/my-slice.ts` — private My Slice projection and actions
- `apps/discord-bot/src/discord-delivery-worker.ts` — D17 delivery polling and
  acknowledgement
- `apps/discord-bot/src/ticket-*.ts` and `src/commands/tickets.ts` — support
  ticket lifecycle and Discord boundary
- `apps/discord-bot/src/persistence/*` — Prisma-backed Discord-owned state

## Validation

```text
Bot unit tests: PASS — 13 files / 66 tests
Bot integration tests on VPS authority: PASS — 1 file / 5 tests
Bot typecheck: PASS
Bot lint: PASS
Setup manifest validation: PASS
Bot production build: PASS
```

The full local test command was not used as the authority because its Prisma
integration test defaults to local `127.0.0.1:5432`; the same integration suite
passed against the VPS database without residual fixtures.

## Live runtime

```text
Foreground Discord login: PASS
Discord ready event: PASS
Staging public API read: PASS — HTTP 200
Authenticated bot API read: PASS — HTTP 200
Main health: PASS — HTTP 200 on 3111
Main readiness: PASS — HTTP 200 on 3111
Worker readiness: PASS — HTTP 200 on 3112
```

## Commands

```text
Source expected: 52
Runtime registered: 52
Missing commands: none
Unexpected commands: none
Duplicate command names: none
/slice registration: PASS
```

The bot uses a development-guild sync, so command registration is immediate and
does not repeatedly force global command propagation.

## Account and My Slice coverage

```text
Unlinked backend state: PASS — service-authenticated read returns safely
  unlinked state for a controlled unknown Discord ID
Account-linking implementation/unit coverage: PASS
My Slice projection/unit coverage: PASS
Investor portfolio/order projection rendering: PASS in unit coverage
Collector projection/actions/membership rendering: PASS in unit coverage
Staging URL construction: PASS in unit coverage
Live Discord user link completion: NOT RUN — requires a controlled human
  Discord QA account/session
Live Discord button/menu interaction: NOT RUN — requires a controlled human
  Discord QA account/session
```

The bot remains read-only for trading. Portfolio, orders, Collector, actions,
and membership links use the staging web authority; no Discord command creates
an order, trade, ownership position, deposit, withdrawal, or provider movement.

## Notifications and support

```text
D17 worker startup: PASS
Delivery queue read: PASS — HTTP 200, 0 pending deliveries
Unlinked notification suppression: PASS — observed safely in worker log
Order notification delivery: IMPLEMENTED; no new trade/event created for QA
Collector lifecycle delivery: IMPLEMENTED; no fake lifecycle event created
Shipping delivery distinctions: IMPLEMENTED; no shipment fixture created
Membership notifications: UNSUPPORTED — no authoritative provider transition
Support D17 notifications: UNSUPPORTED — support is Discord-native
Ticket lifecycle integration: PASS — 5 Prisma integration tests
Live Discord ticket create/privacy/close: NOT RUN — requires controlled guild
  interaction session
```

## Persistence and recovery

```text
slice-discord.service: ENABLED + ACTIVE
slice-discord-worker.service: ENABLED + ACTIVE
Restart persistence: PASS
Persistent command/component routing after restart: PASS at process level
Command count after restart: 52
Duplicate command registration after restart: NONE
Failure recovery: PASS — SIGKILL caused systemd restart; NRestarts=1
Duplicate notifications: NONE observed
```

## Security and domain safety

```text
Ephemeral/private account panels: PASS in source/unit coverage
Cross-user interaction protection: PASS in source/unit coverage
Link replay protection: PASS in backend implementation/tests
Service-token exposure: NONE
localhost links: NONE in configured web authority
127.0.0.1 links: NONE in configured web authority
old-domain links: NONE in configured web authority
Staging links: PASS
Plaid calls: 0
Bridge calls: 0
Ximilar calls: 0
PriceCharting calls: 0 from bot QA
New trades: 0
Financial movements: 0
Umbreon changed: NO
Charizard changed: NO
```

## Systemd

```text
slice-api.service: ACTIVE
slice-web.service: ACTIVE
slice-discord.service: ACTIVE + ENABLED
slice-discord-worker.service: ACTIVE + ENABLED
```

## Release status

The Discord service deployment is operational. Full interactive Discord QA is
partially blocked only by the absence of a controlled human Discord account and
session for invoking `/slice`, completing account linking, clicking persistent
components, and exercising ticket privacy in the guild.

Overall service deployment: **GO**
Full interactive live QA: **NO-GO pending controlled Discord QA session**

Required human action: provide a controlled Discord QA account/session in the
configured development guild. Rotate the supplied Discord bot token after this
QA window.
