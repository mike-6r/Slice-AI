# Dependency and configuration audit

## Dependency structure

The repository has three independently installed package roots: root frontend, `server`, and `apps/discord-bot`, each with its own lockfile. This is valid for separate deployables but increases drift risk.

Observed version seams:

- Backend uses `@prisma/client ^6.19.3` and Prisma `^6.19.3`.
- Discord bot uses `@prisma/client 6.19.0` and Prisma `6.19.0` against the same schema, with a separate generated client.
- `zod`, TypeScript, ESLint, Prettier and Vitest versions are independently declared across roots.
- Root dependencies include a large Radix/UI surface and TanStack Start; build succeeds but emits large chunk warnings.

No dependency was removed or upgraded. A later dependency wave should use lockfile-aware package-manager checks, duplicate-version reporting, and a separate Prisma client compatibility test.

## Configuration seams

| Config            | Finding                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Provider mode     | Local by default; Stripe live is fail-closed and explicitly gated                                                        |
| Worker activation | Outbox and delivery worker are opt-in; market refresh worker is separately configurable in code                          |
| `.env.example`    | Omits `MARKET_REFRESH_*` names supported by `app-config.ts`; omits `PRICECHARTING_API_KEY` alias supported by code       |
| Staging           | HTTP/IP-only, `NODE_ENV=development`, `COOKIE_SECURE=false`, provider/trading/deposit/withdrawal/listing off per runbook |
| Secrets           | `.env`, keys, certificates and credentials are ignored; deployment docs keep secrets in `/etc/slice/slice.env`           |
| Release artifacts | Local archives are ignored but present; deployment docs say release bundles should not be retained locally               |
| CI/CD             | No checked-in GitHub workflow was found; deployment is manual VPS release procedure                                      |

## Security notes

Webhook services verify raw-body signatures and persist verified inbox events. Admin and mutation routes have explicit permission decorators. CSP `unsafe-inline` is documented as an SSR hydration exception and should remain a tracked launch-hardening item. Do not relax fail-closed provider or staging controls during cleanup.

## Wave 1 reconciliation

`server/.env.example` now declares every `app-config.ts` key with
placeholder/default values and points to the grouped environment contract in
`docs/engineering/ENVIRONMENT_CONFIGURATION.md`. No credential was added. The
backend/Discord Prisma version seam remains intentionally unchanged and is
documented as **ALIGN LATER** because generated-client/schema validation passes.
