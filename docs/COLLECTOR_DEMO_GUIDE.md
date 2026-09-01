# Staging Collector Demo Guide (retired fixture workflow)

> The synthetic collector catalogue, review queue, intake, ownership, offering,
> and market generator was retired on 31 August 2026. Do not recreate those
> records. `staging:demo:refresh` now refreshes configured staging identities
> only. Use records created through the real collector workflow for demos.

## Current boundary

The configured demo accounts may still be used for an owner-led walkthrough,
but staging refresh no longer creates catalogue, submission, intake, custody,
ownership, offering, order, execution, or market records. Those records must be
created through the same product workflows used by any other account.

The owner-created Pikachu is preserved explicitly:

- submission `07dbf13f-f712-4d4a-adcf-96c45c7e641b`;
- canonical asset `8403a76f-c92c-4206-a7e7-7546b2098919`;
- PSA certification `107760843`.

## Safe account refresh

Run from `server` with the protected staging environment loaded:

```bash
npm run staging:demo:preflight
npm run staging:demo:refresh
```

The refresh is staging-only and identity-scoped. It does not restore retired
catalogue or market fixtures.

## Synthetic-record retirement

Inventory is read-only by default:

```bash
npm run staging:demo:retire-synthetic
```

Execution requires the staging environment, the explicit operator flag, and
the exact confirmation token:

```bash
ALLOW_SYNTHETIC_DEMO_RETIREMENT=true \
  npm run staging:demo:retire-synthetic -- \
  --execute --confirm=RETIRE_SYNTHETIC_DEMO_RECORDS
```

The operation is narrowly scoped and recoverable: matching submissions are
cancelled and marked retired; matching assets are archived; publications are
unpublished; and trading markets are halted. Immutable ownership, execution,
financial, and audit history is retained. The preserved Pikachu is checked
against its exact IDs and certification before any mutation begins.
