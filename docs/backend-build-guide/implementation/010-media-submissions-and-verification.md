# 010 — Media, submissions and verification

## 1. Document metadata

Phase 4; **COMPLETE (verified 2026-08-07)**; high risk; prerequisites 004–006. Supports `/list` and listing components (`Section`, `Field`, `ImageSlots`, `ReviewSummary`). Affects submissions/media/review modules. Large; limited parallel safety.

## 2. Project-specific context

`src/routes/list.tsx`, `src/lib/listing-schema.ts`, listing components and validation schemas implement a rich local draft, image slots and simulated analysis. No backend upload/storage/submission/reviewer workflow exists. Backend must authoritatively store drafts and evidence while avoiding unsupported AI/authenticity claims. 011 consumes approved verification output.

## 3. Current implementation audit

Frontend uses browser File objects/local previews and local save indicators. Catalogue gives reference IDs but not submission records. Missing object-storage port, signed upload flow, checksums, media scanning, draft/version/transition/review entities, reviewer separation, audit, cleanup and APIs. Preserve the current form field vocabulary and visible disclaimer.

## 4. Files to read

Read list route, all `src/components/listing/*`, `src/lib/{listing-schema,listing-ai}.ts`, validation schemas/tests, asset/catalogue domain/mocks, frontend ports/hooks/provider, server identity/access/catalogue/common/Prisma, 004–006 and guides.

### Restored decision-record cross-references

Before implementation, read:

- `docs/backend-build-guide/product-decisions/SELLER_LIFECYCLE.md`
- `docs/backend-build-guide/product-decisions/CLAIMS_AND_DISCLOSURES.md`
- `docs/backend-build-guide/product-decisions/FRONTEND_CONTRACT_CORRECTIONS.md`
- `docs/backend-build-guide/product-decisions/DECISION_REGISTER.md`

## 5. Strict scope

Implement draft create/read/update, upload intent/complete/delete, secure media validation/scanning state, submit/cancel, reviewer queue/detail/request-changes/approve/reject, optimistic versioning, audit/idempotency and exact contracts.

## 6. Out of scope

No automatic authenticity claim, valuation/custody/insurance/publication (011), ownership, payout, raw public media, frontend visual redesign or unapproved cloud vendor lock-in.

## 7. Dependencies and preconditions

Require auth/access/catalogue and an approved object-storage/scanner adapter. If provider approval is absent, implement a local test adapter and keep production upload disabled by feature flag; do not claim scanning. Config includes bucket, signed URL TTL, max count/size, allowed MIME/magic signatures and scanner timeout.

## 8. Database specification

`AssetSubmission(id,ownerUserId,assetId?,status DRAFT|SUBMITTED|IN_REVIEW|CHANGES_REQUESTED|APPROVED|REJECTED|CANCELLED,version,categoryId,setId?,grading fields,declared metadata JSON allowlist,submittedAt?,reviewedAt?,reviewerId?,decisionCode?,decisionNote?,createdAt,updatedAt)`; `SubmissionMedia(id,submissionId,slot,objectKey unique,originalFilename private,mimeType,sizeBytes,sha256,status PENDING_UPLOAD|UPLOADED|SCANNING|SAFE|REJECTED|DELETED,scanResultCode?,createdAt,updatedAt)` unique submission+slot; `VerificationReview(id,submissionId,reviewerId,status,decision,reason codes/note,createdAt,completedAt)` append-only decisions. Index owner/status, queue/status/time. Restrict FKs; soft cancel/delete marker; retain evidence per policy. Migration `submissions_media_verification`.

## 9. Domain types and ports

Submission/media/review IDs and transitions; `ObjectStoragePort.createUploadIntent/head/delete/createReadUrl`; `MalwareScannerPort.scan`; `ChecksumVerifier`; repositories for draft/media/review with `findForUpdate` and version compare; `SubmissionPolicy` validates required slots/fields/reference compatibility.

## 10. Domain rules and invariants

Only owner edits DRAFT/CHANGES_REQUESTED. Submitted snapshots are immutable except workflow fields. Submit requires every category-required media slot SAFE, checksum/size/type verified server-side, and version match. Reviewer cannot review own submission and cannot approve incomplete evidence. Rejection/change uses reason code; approval is not publication/authenticity guarantee. Object keys are generated, tenant-scoped, non-guessable; filenames never form paths. Transitions are explicit and terminal CANCELLED/REJECTED except new submission.

## 11. Application services

Draft services validate owner/version and catalogue refs. Upload intent reserves media row/object key; complete HEADs object, verifies magic/size/checksum and requests scan; delete marks and best-effort removes. Submit locks draft/media and transitions atomically with audit/event. Review claim uses lock/lease, request-change/approve/reject enforce role/separation and append decision+audit.

## 12. API specification

Authenticated collector: `POST /v1/submissions`; `GET/PATCH /v1/submissions/:id`; `POST /:id/media/upload-intents`; `POST /:id/media/:mediaId/complete`; `DELETE /:id/media/:mediaId`; `POST /:id/submit`; `POST /:id/cancel`. Verifier: `GET /v1/reviews/submissions?status&cursor&limit`; `GET /v1/reviews/submissions/:id`; `POST /:id/claim`; `POST /:id/request-changes|approve|reject`. Mutations require idempotency/audit/rate; PATCH includes `version`; upload intent response has method/url/headers/objectKey/expiresAt, never credentials.

## 13. Error catalogue

`SUBMISSION_NOT_FOUND` 404; `SUBMISSION_STATE_CONFLICT` 409; `SUBMISSION_VERSION_CONFLICT` 409; `MEDIA_SLOT_REQUIRED` 422; `MEDIA_TYPE_UNSUPPORTED` 415; `MEDIA_TOO_LARGE` 413; `MEDIA_CHECKSUM_MISMATCH` 422; `MEDIA_SCAN_PENDING` 409; `MEDIA_REJECTED` 422; `REVIEW_SELF_FORBIDDEN` 403; `REVIEW_ALREADY_CLAIMED` 409; `STORAGE_UNAVAILABLE`/`SCANNER_UNAVAILABLE` 503. No object credentials/private reason leakage.

## 14. Authorization and security

Owner isolation in queries; verifier role/scope and self-review denial. Magic-byte validation, decompression/pixel limits, no SVG/HTML, malware scan, randomized keys, private bucket, short signed reads, CSP-safe content disposition, filename sanitization/redaction. Rate/quotas per user/IP. Reviewer notes may contain sensitive data and are private.

## 15. Audit and idempotency

Audit draft creation/submission/cancel, media lifecycle and all reviewer actions; include IDs, slots, checksum prefix only if approved, versions/reason codes; no URLs, filename, raw notes or media. Every mutation key scoped user+operation+resource; upload replay returns same active intent only while valid.

## 16. Events, realtime and jobs

Define `submission.submitted.v1`, `media.scan.requested/completed.v1`, `verification.changes_requested/approved/rejected.v1`; dispatch/job infrastructure deferred to 017. Scanner callback/poll job must be idempotent with bounded retry/dead-letter spec. Frontend invalidates draft/review queue on completion.

## 17. Frontend alignment

Map listing draft fields/slots/schema exactly; future adapter replaces local save/upload/analysis while preserving components. Define upload progress, scan pending, validation, version conflict, changes requested and success states. This backend document modifies no frontend.

## 18. Implementation file plan

Create server submissions/media/verification bounded module, storage/scanner ports/adapters, controllers, migration/tests. Modify app/contracts/config. Preserve frontend and later valuation/publication.

## 19. Numbered implementation process

1. Inventory listing schema/slot requirements.
2. Finalize transitions/entities/migration.
3. Add storage/scanner/checksum ports and test adapters.
4. Implement draft/version services.
5. Implement upload intent/complete/delete security.
6. Implement submit/cancel transaction.
7. Implement verifier queue/claim/decisions.
8. Add audits/events/errors/controllers.
9. Add DB/storage/security/E2E/race tests and manual QA.
10. Update state.

## 20. Test plan

Unit transition/required-slot/magic/size/checksum/self-review/version rules. DB duplicate slots, claim race, submit/update race, rollback/audit. Storage sandbox intent/head/delete, expired URL, spoofed MIME, malware/rejected/timeout. E2E owner isolation, all state paths/idempotency/rate. Browser integration waits until frontend adapter work; visual none.

## 21. Manual QA

Create draft, upload valid and spoofed/oversize files, complete scan, submit, attempt owner edit, claim as distinct verifier, request changes/resubmit/approve. Verify status/version/media/object privacy/audits and cleanup orphan test objects.

## 22. Verification commands

Server Prisma commands, lint/unit/integration/E2E/build; storage/scanner sandbox command added by this document. Root typecheck/build only for contract fixtures.

## 23. Documentation and state updates

Update state/control files and API/entity/business/workflow/feature/baseline docs. Record provider adapter status honestly.

## 24. Completion checklist

- [x] Draft ownership/version conflicts are enforced.
- [x] Required SAFE media gates submission.
- [x] MIME magic/size/checksum/scan controls are tested with deterministic local adapters.
- [x] Keys/URLs/filenames cannot leak or traverse.
- [x] Reviewer cannot self-review; claim race has one winner.
- [x] Every transition, audit and idempotency replay is correct.
- [x] Approval makes no valuation/publication claim.
- [x] DB/storage/E2E tests pass.

## 27. Completion evidence (2026-08-07)

- Migration `20260807041334_submissions_media_verification` is applied to real local PostgreSQL; `prisma migrate status` reports ten migrations and an up-to-date `slice_test` schema.
- The submissions bounded module provides owner-isolated versioned drafts, randomized private local-test object keys, upload intent/complete/delete, server-side MIME/signature/dimension/size/checksum checks, scanner state, submit/cancel, reviewer queue/claim/decisions, durable idempotency, audit and owner notifications. Production uploads remain disabled until an approved storage/scanner provider exists.
- Real-service focused E2E suites cover owner, media, reviewer and transition paths. The final backend run passed 63 unit, 35 PostgreSQL/Redis integration and 34 HTTP E2E tests. Root frontend regression passed 27 tests; no Document 010 frontend source was added.
- Approval ends at the Document 010 handoff boundary: it does not value, vault, insure or publish an asset. Document 011 is next and remains not started.

## 25. Final report format

Report all 17 standard items and next document `011`.

## 26. Stop condition

Stop after completing this document.

Do not start the next implementation document.

Do not begin later-phase work.

If any required dependency or verification is unavailable, stop and report the exact blocker rather than faking completion.
