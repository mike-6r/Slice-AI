# Slice documentation map

The repository root is the source tree. This directory contains planning,
operational, product, and verification material; it is not a second app.

- `backend-build-guide/` — backend implementation plan, contracts, and state
- `discord-bot-build-guide/` — Discord bot architecture, product, and release plan
- `finance/` — offering and real-money foundation notes
- `product/` — product walkthroughs and showcase guidance
- `qa/` — organized verification records and local screenshot evidence
- `STAGING_VPS_DEPLOYMENT.md` — staging deployment, health, backup, and rollback procedure
- `CURRENT_SYSTEM_STATE.md` — current engineering reference
- `engineering/` — package, configuration, verification, and CI policy
- `audit/` — indexed forensic snapshots and controlled-cleanup evidence

Runtime code remains in `src/`, `server/`, and `apps/`. Generated build output,
dependency trees, archives, and local logs do not belong in the repository.
