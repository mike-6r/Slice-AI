# Graded Card Certification Verification QA

## Scope

Step 2 company-aware grading, certification reservation, official manual
verification, graded media requirements, staff review projection, and public
semantic grade fields.

## Acceptance matrix

| Area | Expected result |
| --- | --- |
| Company registry | PSA, BGS, BVG, BCCG, CGC, SGC, TAG, ACE are available as data-driven options |
| PSA scale | Official entries include 10 through 1 and half grades where defined; no 9.5 |
| BGS scale | Half grades, Pristine designation, and staff-confirmed Black Label designation remain distinct |
| CGC scale | Current and legacy entries preserve designation and era |
| Raw card | No professional grade, cert field, or AI value is treated as official |
| Cert input | Normalized and reserved transactionally; duplicate active claim returns `CERT_DUPLICATE_BLOCKED` |
| Verify button | Creates `MANUAL_REVIEW_REQUIRED`, shows official lookup link, and does not claim provider verification |
| Staff verify | Server matches identity/company/grade/designation; mismatch remains blocked and audited |
| Submission | Graded cards require `VERIFIED` certification plus front, back, and grading-label media; raw cards require front/back and raw AI policy only |
| AI | Slab recognition is supporting evidence; it never changes the official grade |
| History | Rejected/cancelled claims release for reuse; verification/audit history remains |
| Provider calls | Zero automated grading-provider calls in current mode |

## Commands

```text
server: npm run prisma:validate
server: npm run typecheck
server: npm test -- --runInBand src/modules/submissions/domain/grading-certification.spec.ts src/modules/submissions/domain/submission.policy.spec.ts
frontend: npm run typecheck
frontend: npm test -- src/routes/list.test.tsx
frontend: npm run build
server: npm run build
```

## Current release decision

Automated provider verification is **NO-GO** until Slice obtains and approves a
machine-access provider adapter for each company. The implemented manual
official lookup path is safe for controlled staging and blocks submission until
staff confirmation. No fake provider response is generated.

## Deployment QA

After migration deployment, confirm the catalogue endpoint returns the registry,
the graded Step 2 screen shows company-specific labels and certificate
verification state, and a duplicate cert cannot be reserved by a second active
submission. Confirm no PriceCharting, Ximilar, custody, ownership, order, or
financial records are created by the verification action.
