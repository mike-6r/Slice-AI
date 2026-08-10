# Schema/public-contract boundaries

Prisma `passwordHash`, session `tokenHash`/family/IP data, normalized email, idempotency records, audit metadata and internal account controls are never public DTO fields. Profile update DTOs are allowlisted. Account history/audit are immutable by policy. Cascade behavior and concurrency require PostgreSQL testing.
