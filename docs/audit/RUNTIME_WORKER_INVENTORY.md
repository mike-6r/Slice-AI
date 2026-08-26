# Runtime and worker inventory

Current code is an SSR web frontend, a Nest API containing in-process workers,
and two separately supervised Discord processes. This is an observation of
current staging and source configuration, not a change to activation.

| Runtime | Activation and authority | Staging evidence | Dependency / caveat |
| --- | --- | --- | --- |
| Web frontend | `slice-web.service` | Active/running | SSR frontend; API remains domain authority. |
| Nest API | `slice-api.service` | Active/running | Hosts controllers plus in-process workers below. |
| Outbox worker | `OutboxWorkerService` starts when `OUTBOX_WORKER_ENABLED=true` | Flag true; worker id `slice-vps-01` | PostgreSQL outbox and notification routing. It does not canonicalize approved submissions. |
| Notification delivery worker | `NotificationDeliveryWorkerService` shares the outbox enabled flag | Enabled by the same staging flag | Durable delivery queue and configured transports. |
| Market refresh worker | `MarketRefreshWorker` starts when `MARKET_REFRESH_WORKER_ENABLED` is true, otherwise defaults enabled outside tests | API is active; effective flag not printed because it is absent from the environment file | PostgreSQL market-refresh jobs and configured market providers. It excludes beta `slice-demo-*` assets and has no canonicalization role. |
| Portfolio snapshot worker | `PortfolioSnapshotWorker` shares the market-refresh flag/interval | Same effective-flag caveat as market refresh | PostgreSQL/finance projections. No separate `PORTFOLIO_*` flag exists. |
| Discord bot | `slice-discord.service` | Active/running | Discord API plus shared database/API integration. |
| Discord lifecycle/notification worker | `slice-discord-worker.service` | Active/running | Discord scheduled/community workflows. Static call-site tracing found no caller for canonical Asset creation/linking. |

No source worker, unit, outbox consumer, or Discord process is a durable
canonicalization job. The active approved-submission outbox event is routed to
private notifications only. Production activation should remain verified per
deployment environment rather than inferred from staging flags.
