# Pikachu QA resume checkpoint

Recorded: 2026-08-26 (staging)

## Immutable record identity

- Submission: `07dbf13f-f712-4d4a-adcf-96c45c7e641b`
- Canonical Asset: `8403a76f-c92c-4206-a7e7-7546b2098919`
- Canonical public ID: `ast_47c3119864734759b13700efdf54a5e4`
- Intake: none. No production `SubmissionIntake` record exists.
- Staging-demo physical authority record: none. No demo physical state has been applied.

## Code and staging state

- Current local Git commit: `1e64b53c6631b49cee5e23ef8b41e2e5291561e0`
- Current remote `origin/main`: `01770a531f86d8f88ca08bae1a7aa980e0f1966e`
- Active staging release: `/opt/slice/releases/20260826-1e64b53`
- Deployed commit: `1e64b53`
- Staging health: API and web services active; PostgreSQL and Redis ready.

## Completed work

1. The existing collector submission was approved and linked to the canonical Pikachu Asset.
2. Staff PSA certification verification was recorded for PSA 10 / cert `107760843`.
3. A first-class staging-demo physical authority was implemented and deployed. It is persisted separately from production shipment, receipt, verification, and vault custody; it is staging-only, admin/permission guarded, audited, idempotent, and explicitly rejects controlled Umbreon and Charizard fixtures.
4. The Physical Intake UI includes the separate **Complete demo intake** action and simulation disclosure copy.
5. Focused policy tests, API typecheck, frontend typecheck, Prisma validation, and builds were run before deployment.

## Current lifecycle state

- Submission: `APPROVED`
- Canonicalization: linked to the Asset above
- Production Physical Intake: not started
- Demo physical authority: implemented and deployed, not applied
- Ownership issuance: not started
- Initial Offering: not created
- Publication / market: not started
- Controlled Umbreon / Charizard: not modified

## Last successful lifecycle action

Canonical asset linkage for the existing approved submission. No physical, ownership, offering, or publication mutation followed.

## Known operational issue

The VPS root volume reached capacity due to historical release directories. Four explicitly verified non-current releases were removed to let the in-progress deployment finish. The active release is healthy but the host still has approximately 2 GB free; do not start another deployment without pruning non-current releases first.

## Resume procedure

Only resume after the explicit instruction **Resume Pikachu QA**.

1. Confirm `/opt/slice/current` still resolves to the recorded release and `/ready` is healthy.
2. Sign in to staging as `povnu@icloud.com`.
3. Open **Admin Console → Physical Intake**, filter by the submission ID, and choose **Complete demo intake** on the preserved Pikachu. Confirm the staging-only simulation disclosure.
4. Verify the resulting independent demo authority record and labels: Demo Intake Complete, Demo Verified, and Demo Custody. Do not create a production intake, shipment, receipt, or custody record.
5. Continue the pre-authorised ownership, Initial Offering, publication, and marketplace workflow only after the explicit resume instruction.
