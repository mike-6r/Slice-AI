# Slice backend architecture proposal

This document is a proposal only; this task does not implement a backend or financial system.

## Recommended stack

- **NestJS** for modular APIs, authentication boundaries, WebSocket gateways, background workflow orchestration, and explicit service contracts.
- **PostgreSQL** as the durable system of record, with **Prisma** where its migration and type safety suit the team (or a query builder if ledger/query requirements become more specialised).
- **Redis** for caching, rate limits, ephemeral presence, and job coordination; **BullMQ** for idempotent asynchronous workflows.
- **WebSockets** for scoped market, order, portfolio, notification, vault, discussion, and proposal events.
- **S3-compatible object storage** with signed upload/download flows for asset media and custody evidence.
- **Plaid** behind the provider-neutral identity-verification and Monitor boundary; sandbox certification remains a launch gate.
- **Bridge** behind the provider-neutral external GBP money-movement boundary; sandbox certification remains a launch gate.
- **BlockchainAnalysis.io** behind the provider-neutral explicit-chain KYT boundary; live/account certification remains a launch gate.
- **GBP** integer minor units as the current financial authority. No FX, stablecoin, or crypto-ledger authority is implied.

## Custom systems

The product should own and audit asset management, verification/vault workflow, ownership ledger, order book/trading engine, portfolio calculations, sale proposals, payout/distribution workflow, and audit logs. These require append-only records, idempotency keys, segregation of duties, reconciliation, and strong access controls.

## Boundaries

The frontend data layer added here is intentionally adapter-driven. The future API should replace only the local repository implementations. It must remain authoritative for all identity, KYC, custody, pricing, ownership, balance, trading, fees, settlements, distributions, compliance, and audit decisions. Frontend order previews must never be used as settlement instructions.

## Delivery sequence

1. Authenticate users and implement profile/KYC status read models.
2. Introduce read-only asset, market, vault, and portfolio APIs.
3. Add signed media uploads and moderation/verification workflows.
4. Implement restricted demo order APIs with no real settlement.
5. Conduct security, regulatory, custody, financial-controls, and provider assessments before any production transaction capability.
