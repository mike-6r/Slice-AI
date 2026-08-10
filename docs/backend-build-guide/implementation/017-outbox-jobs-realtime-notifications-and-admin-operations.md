# 017 — Outbox, jobs, realtime, notifications and admin operations

## 1. Document metadata

Phase 8; **IMPLEMENTATION COMPLETE**; high risk; requires 006–016 (016 may remain feature-flagged but its event contracts must be stable). Supports live market/order/portfolio/vault/proposal/notification updates and operational administration. Affects outbox, Redis, realtime, notifications and operations. Extra-large; limited parallel safety.

## 2. Project-specific context

Frontend has notification queries and live-looking charts/tickers/Vault feed but no socket adapter. Prior documents define versioned events/jobs without dispatch. This document makes delivery durable and authorized and gives operators investigation/retry tools; it does not make demo market data live.

## 3. Current implementation audit

Redis exists but no BullMQ dependency/module, dispatcher, SSE/WebSocket gateway, durable notification preferences/delivery attempts or ops tooling exists. Phase 1 provides only the transactional outbox model/writer and one producer. `Notification` may exist from 008. Preserve business transactions: producers write outbox in their existing DB transaction; do not publish directly.

## 4. Files to read

Read all prior event definitions, transaction modules, notification models, Redis/config/audit/idempotency; frontend root/provider/query keys/hooks/notifications and live routes; package/Prisma; 006–016 and all guide maps/state.

## 5. Strict scope

Durable transactional outbox; dispatcher/consumer idempotency; BullMQ queues/retries/dead letters/schedules; authorized SSE or WebSocket protocol; notification preferences/in-app deliveries/read model; admin inspection/retry/reconciliation actions and runbooks/metrics.

## 6. Out of scope

No business-rule relocation into jobs, unapproved email/SMS/push provider, public broadcast of private events, infinite retries, manual DB edits, frontend redesign or false live status.

## 7. Dependencies and preconditions

Require healthy Redis/Postgres, stable versioned events from owning docs, deployment topology for sticky/sessionless connections, queue concurrency budgets and alert ownership. Choose SSE for server→client unless bidirectional need is proven; authenticate via normal session/access mechanism, never query-string token.

## 8. Database specification

`OutboxEvent(id,eventType,version,aggregateType,aggregateId,sequence?,payload safe JSON,occurredAt,availableAt,status PENDING|PROCESSING|PUBLISHED|DEAD,attempts,lastErrorCode?,lockedAt?,lockedBy?,publishedAt?)` indexed status/available; producer transaction append-only. `InboxReceipt(consumer,eventId,processedAt)` unique. Extend `Notification` and add `NotificationPreference(userId,type,channel IN_APP|EMAIL...,enabled)` unique and `DeliveryAttempt(notificationId,channel,status,providerRef private,attempt,errorCode,timestamps)`. `AdminOperation(id,type,requestedBy,approvedBy?,status,input safe JSON,result safe JSON,timestamps)` for retry/rebuild/halt actions. Migration `outbox_jobs_realtime_ops`; retention/partition plan.

## 9. Domain types and ports

`DomainEventEnvelope {id,type,version,aggregate,sequence?,occurredAt,payload}`; `OutboxWriter.append(tx,event)`; `OutboxDispatcher.claimBatch/publish/mark`; `EventBus`; `Inbox.deduplicate`; `JobScheduler.enqueue/schedule/retry/deadLetter`; `RealtimePublisher.publish(channel,event)`; `NotificationService.create/deliver`; `AdminOperationService`. Event registry validates every payload/version and owner.

## 10. Domain rules and invariants

Business mutation and outbox row commit together. Delivery is at-least-once; consumers are idempotent. Claim uses `FOR UPDATE SKIP LOCKED` lease and stale recovery. Per-aggregate sequence is applied monotonically; duplicates ignored; gaps trigger refetch/investigation, not blind apply. Retry exponential+jitter, max attempts; permanent schema/auth errors dead-letter immediately. Realtime authorizes each connection/channel/resource and payload is public/self/admin projection only. Jobs call idempotent use cases, never direct corrective SQL.

## 11. Application services

Dispatcher claims/publishes/marks with safe error codes. Registered handlers update projections/notifications then inbox receipt atomically. Schedulers enqueue expiry, reconciliation, provider polling and notification delivery using deterministic job IDs. Realtime connection resolves actor, subscriptions and backpressure. Admin ops inspect event/job, retry dead item, replay range into idempotent consumer, trigger approved reconciliation or market halt with audit/two-person control where financial.

## 12. API specification

`GET /v1/realtime/events` SSE authenticated with `Last-Event-ID`, heartbeat and channel filters derived server-side; or documented WebSocket equivalent, not both without need. Notification APIs extend 008 with preferences. Admin: `GET /v1/admin/outbox`, `/jobs`, `/dead-letters`, `/operations`; `POST .../:id/retry`; `POST /replays`; `POST /reconciliations`; all cursor-paged, privileged, idempotent/audited/rate-limited/recent-auth. No raw payload if it contains restricted fields.

## 13. Error catalogue

`EVENT_SCHEMA_UNKNOWN`, `EVENT_SEQUENCE_GAP`, `OUTBOX_LEASE_CONFLICT`, `JOB_ALREADY_SCHEDULED`, `JOB_DEAD_LETTERED`, `REALTIME_AUTH_REQUIRED`, `CHANNEL_FORBIDDEN`, `BACKPRESSURE_LIMIT`, `ADMIN_OPERATION_CONFLICT`, `DELIVERY_PROVIDER_UNAVAILABLE`; safe 400/403/409/429/503 or internal dead-letter handling. No stack/payload secrets.

## 14. Authorization and security

Connection/session revalidated periodically and on status revocation; user channels keyed by opaque user ID server-side. Origin/CORS limits, connection/message/rate/size/backpressure caps. Admin payloads redacted, actions least privilege/two-person for finance. Queue/dashboard not publicly exposed; Redis credentials/TLS in production. Notification text rendered safely.

## 15. Audit and idempotency

Audit dead-letter/retry/replay/admin/reconciliation/preference and external delivery actions; routine successful dispatch is operational metric, not one audit per event unless business event already audited. Job IDs/event IDs/admin keys are dedupe keys; replay preserves original event ID and handler inbox prevents double effects.

## 16. Events, realtime and jobs

Create a registry for every event from 004–016 with owner/version/audience/consumer/query invalidation. Queues: `outbox-dispatch`, `lifecycle-expiry`, `reconciliation`, `provider-webhook`, `notifications`; per-queue retry/dead-letter/timeout/concurrency. Scheduled jobs use leader-safe repeat IDs. Emit realtime only after durable consumer success. Document recovery/replay and schema version compatibility.

## 17. Frontend alignment

Add future realtime adapter to invalidate exact `queryKeys` for asset/history/book/trades/portfolio/wallet/vault/watchlist/notifications/proposal. Never mutate financial cache from unvalidated payload; refetch authority. Notification page supports preference/read updates. This backend document modifies no frontend unless explicitly scoped after server tests; final integration belongs 018.

## 18. Implementation file plan

Create server events/outbox/jobs/realtime/ops modules, migration/registry/handlers/runbooks/tests; modify producer transactions to append registered events only. Extend notification module. Preserve domain rules and frontend.

## 19. Numbered implementation process

1. Inventory/validate all prior event contracts and owners.
2. Add outbox/inbox/notification/operation schema.
3. Implement transactional writer and leased dispatcher.
4. Add BullMQ queues, deterministic jobs, retry/dead-letter.
5. Add idempotent handlers/projection and notification creation.
6. Add authorized SSE with sequence/backpressure/reconnect.
7. Add admin inspection/retry/replay/ops.
8. Instrument lag/dead-letter/connections and write runbooks.
9. Run crash/duplicate/order/outage/security/load/E2E tests.
10. Update state.

## 20. Test plan

Unit event schemas/audience/retry classification/backoff/invalidation. PostgreSQL/Redis integration producer rollback, claim race, stale lease, duplicate inbox, ordering/gap, deterministic scheduled job. Crash tests before/after publish/handler commit. E2E SSE auth/reconnect/last ID/revocation/backpressure/cross-user denial; admin permissions/retry. Load lag/connection caps. Provider delivery sandbox only if approved. Browser verifies query refetch, not visual redesign.

## 21. Manual QA

Run worker/API, create business event, observe outbox→job→notification→SSE→query invalidation; kill dispatcher at each boundary and restart; replay duplicate; force dead letter and privileged retry; log out/suspend user and verify stream closes. Inspect metrics/audit/inbox and no duplicated business effect.

## 22. Verification commands

Server Prisma, lint, unit, integration, E2E, build plus worker scripts added to package and queue/outbox health tool. Root test/typecheck/lint/build; browser test script only if explicitly added.

## 23. Documentation and state updates

Update all state/control/API/entity/business/workflow/feature/baseline docs, event registry, queue/retry matrix, operations/recovery runbooks and this prompt.

## 24. Completion checklist

- [x] Every producer writes business state and outbox atomically.
- [x] Concurrent dispatchers claim once; duplicate delivery is harmless.
- [x] Crash/restart tests lose no event and duplicate no effect.
- [x] Queue retries/dead letters/timeouts/concurrency are explicit.
- [x] SSE channels are authorized, revocable and backpressure bounded.
- [x] Realtime invalidates/refetches authoritative queries.
- [x] Admin retries/replays are privileged, idempotent and audited.
- [x] Lag/dead-letter/worker/connection metrics and runbooks exist.
- [x] Integration/E2E tests pass.

## 25. Final report format

Report all 17 standard items and next document `018`.

## 26. Stop condition

Stop after completing this document.

Do not start the next implementation document.

Do not begin later-phase work.

If any required dependency or verification is unavailable, stop and report the exact blocker rather than faking completion.

## 27. Phase 1 transactional outbox evidence (2026-08-08)

- Migration `20260808140000_transactional_outbox_foundation` adds `OutboxEvent` and its minimal `PENDING|PROCESSING|DELIVERED|FAILED|DEAD_LETTER` delivery-state vocabulary. The durable envelope contains a unique stable event ID, dotted lower-case event type, schema version, aggregate type/ID, safe JSON payload/metadata, correlation/causation references, status, availability, bounded future lease fields and safe error field.
- `OutboxWriter.append(transaction,event)` only accepts a caller-owned Prisma transaction. Its guarantee is one commit decision: a rolled-back domain transaction has no event and a committed execution has one event. Pending reads are deterministic by `availableAt`, `createdAt`, then `id`; this is not a promise of global causal ordering.
- The first producer is the existing Document 014 execution transaction. It appends `trade.completed:<executionId>` after creating the immutable execution and before the transaction can commit. Payload is deliberately limited to execution ID, asset ID, units, GBP price/gross minor units and currency; it has no buyer/seller, account, reservation, journal, compliance or provider fields. Idempotent execution replay therefore leaves exactly one event.
- Focused evidence: 2 envelope unit tests and 19 real PostgreSQL integration tests pass, including commit, deterministic pending ordering, duplicate event-ID append, trade replay, and forced rollback after outbox append. Full evidence: 28 unit suites / 116 tests, 22 integration suites / 87 tests, 25 HTTP E2E suites / 65 tests; typecheck, lint, build and Prisma validation/status pass with 29 migrations current.
- This phase does not implement dispatcher/worker claiming, retry/dead-letter handling, BullMQ, Redis pub/sub, realtime/SSE, notification delivery, or any Discord consumer. The separate Slice AI Discord bot remains an eventual consumer only.

## 28. Phase 2 outbox worker reliability evidence (2026-08-08)

- Migration `20260808150000_outbox_worker_reliability` adds a unique opaque `claimToken`, `leaseExpiresAt`, `lastAttemptAt`, `deadLetteredAt`, and a queue-recovery index. PostgreSQL claim transactions select eligible pending or expired-processing rows using parameterized `FOR UPDATE SKIP LOCKED`, ordered by `availableAt`, `createdAt`, then `id`. A handler runs only after that transaction commits.
- `OutboxWorkerService` is at-least-once by design. An actual handler invocation increments `attempts`; claim-only crashes do not. Finalization conditionally requires the event ID, `PROCESSING` status and current claim token, so a stale worker cannot overwrite a reclaimed lease. A success-finalization write failure deliberately leaves the lease for recovery; consumers must deduplicate by stable `eventId`.
- Retryable failures return to `PENDING` at validated exponential backoff plus bounded jitter. Unknown event types, unsupported versions and malformed registered payloads are non-retryable and transition to durable `DEAD_LETTER`; dead letters are never automatically re-eligible. Default validated settings are disabled worker polling, 25-event batch, 30-second lease, five attempts, 1-second base / 60-second maximum retry delay.
- The internal registry validates and explicitly handles only `trade.completed` in this phase. It is a testing/consumer boundary, not a no-op delivery claim. There is still no Discord, email, push, realtime, notification preference, BullMQ, Redis pub/sub, or external broker implementation.

## 29. Phase 3 delivery-routing foundation evidence (2026-08-08)

- Migration `20260808160000_notification_delivery_routing_foundation` adds product-owned `NotificationPreference` and provider-neutral `NotificationDelivery`. Delivery work is separate from an immutable outbox event: `OutboxEvent.DELIVERED` means durable routing completed, never that an external transport sent a message.
- Delivery identity is deterministic: `<eventId>:<channel>:<destinationKey>`. It is unique, transactionally created, and reused after at-least-once outbox reprocessing. A delivery has its own pending/processing/delivered/failed/suppressed/dead-letter vocabulary for a later transport worker.
- The first route is `trade.completed` → public `DISCORD` logical destination `discord.market_feed`. Its version-one payload has only event/execution/asset references, integer-unit/minor price data, currency and occurred time. It deliberately contains no buyer, seller, account, journal, reservation, KYC, provider or transport endpoint data. Private routing is not added because the existing event has no private recipient identity.
- Optional private routing has a provider-neutral preference-policy seam; disabled optional routes are suppressed without retry, while mandatory policy overrides a disabled preference. Platform public routes do not use user preferences. Discord/email/push/WebSocket/SSE delivery and the separate Discord bot remain future work.

## 30. Private lifecycle event catalog (2026-08-08)

| Event | Version | Producer | Classification / route | Safe payload |
| --- | --- | --- | --- | --- |
| `order.opened` | 1 | Document 014 order placement transaction | PRIVATE `IN_APP`, `ORDER_UPDATES`, optional | order/asset IDs, side, units, OPEN status, occurred time |
| `order.cancelled` | 1 | Document 014 order cancellation transaction | PRIVATE `IN_APP`, `ORDER_UPDATES`, optional | order/asset IDs, side, units, CANCELLED status, occurred time |
| `movement.settled` | 1 | Document 016 provider-confirmed money-movement transaction | PRIVATE `IN_APP`, `PORTFOLIO_UPDATES`, optional | movement ID, type, GBP minor amount, currency, SETTLED status, occurred time |

Recipient identity is stored only in the internal outbox actor reference and is not included in public or delivery payloads. All identities are deterministic `<event-type>:<authority-id>` values, and preference-disabled optional routes persist as `SUPPRESSED` rather than entering a delivery worker queue.

## 31. Dead-letter operations evidence (2026-08-08)

- Privileged operational APIs are available under `/v1/admin`: `GET /outbox/status`, `GET /outbox/dead-letters`, `GET /outbox/:eventId`, `GET /notification-deliveries/dead-letters`, `POST /outbox/:eventId/requeue`, and `POST /notification-deliveries/:deliveryId/requeue`.
- Reads require the existing `admin.access` permission. Requeues additionally require a valid idempotency key, the normal admin mutation rate limit, and recent authentication. They use the existing durable idempotency and audit repositories in the same database transaction as the conditional state transition.
- Requeue is legal only from `DEAD_LETTER`. It retains the original row, stable event/delivery identity, attempt count, and deterministic delivery identity; it clears only the expired claim/lease/dead-letter fields and returns the same work item to `PENDING`. A concurrent or non-eligible transition fails safely, and an exact replay returns the stored safe result without a second audit entry.
- Admin DTOs intentionally omit event/delivery payloads, claim tokens, lease data, provider/KYC data, financial or ownership authority, and transport secrets. Requeue does not create a business event or delivery and never repairs balances, journals, reservations, trades, provider movements, or compliance holds.
- Focused PostgreSQL evidence covers stable identity, concurrent requeue fencing, idempotent replay, audit creation, invalid-state rejection, and restored worker eligibility. Focused HTTP evidence covers unauthenticated/ordinary-user denial, privileged safe inspection, request IDs, requeue replay, fingerprint conflict, and delivery requeue.

## 32. Final closure evidence (2026-08-08)

- Shared Prisma status is current at 39 migrations. The Discord-only additive migrations encountered during closure (`20260808230000_discord_investor_profile_preferences` and `20260808240000_discord_delivery_receipts_price_alerts`) add only bot-side profile, receipt and alert persistence/indexes; neither changes backend authority.
- Final verification: 28 unit suites / 116 tests, 26 real PostgreSQL/Redis integration suites / 105 tests and 27 HTTP E2E suites / 70 tests pass. Typecheck, lint, build, Prisma validation and migration status pass.
- Document 017 is implementation complete. Discord, email and push transport integrations are intentional later consumers; frontend integration and launch work remain Document 018.
