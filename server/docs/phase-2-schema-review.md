# Phase 2 schema review

The offline schema defines only `User`, `UserProfile`, `Session`, `AccountStatusHistory`, `RoleAssignment`, `AuditEvent`, and `IdempotencyRecord`.

- All primary IDs are opaque CUIDs. Normalized email and profile username are unique; role assignments are unique per user/role.
- Session refresh material is represented only by `tokenHash`; raw refresh tokens must never be stored. `familyId`, revocation, expiry, and activity fields support rotation/replay controls.
- Status history and audit events are append-only by application policy. Audit metadata is JSON and must be redacted before append.
- User, session, audit, idempotency, and status-history indexes support expected identity queries.
- No migration was created or applied. PostgreSQL validation must still confirm enum, JSON, unique-constraint, cascade, and concurrency behavior.
