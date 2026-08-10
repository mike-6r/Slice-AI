# Observability and incident runbook

## Signals

- `/health` is dependency-free liveness. `/ready` checks PostgreSQL and Redis and returns `503` when
  either dependency is unavailable without revealing topology.
- Every HTTP response has a request ID. Structured request and exception logs include method, safe
  route, status and duration; log redaction covers authorisation, cookies, passwords, tokens,
  secrets, API keys and payment/bank fields.
- The transactional outbox and notification-delivery workers retain attempts, leases, retries and
  dead letters in PostgreSQL. Retry backoff is bounded and stale leases are reclaimed with fencing.

## Alert conditions for staging/production

Alert on readiness failure, repeated authentication/rate-limit spikes, provider circuit open,
webhook validation failures, reconciliation mismatch, worker dead letters/lease age, transaction
rollback failures, high request 5xx rate and migration mismatch. Alerts must include a request or
correlation ID where available and must never include a credential or raw provider payload.

## Response sequence

1. Preserve request/correlation IDs and assess read-only health.
2. Use an operational control to stop new risk while keeping cancellation, reads, reconciliation and
   signed inbound recovery paths available.
3. Reconcile affected ownership, finance, trading, provider and outbox records before re-enabling a
   control.
4. Open a human incident record; provider, compliance and financial escalation remains external to
   this source repository.

Metrics export, paging destinations, SLO thresholds and on-call ownership are deployment concerns
that must be configured and exercised before a production launch.
