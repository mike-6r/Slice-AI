# Audit events

Audit records contain actor/type, action, resource reference, request/session ID, result, timestamp and redacted metadata. Metadata recursively redacts password, hash, token, authorization, cookie, secret, key and seed-related fields. Records are append-only. Expected identity actions include signup, login success/failure, refresh/replay, logout, profile update, role changes, status changes and revocations. Durable retention, tamper resistance, administrator viewing limits and database append enforcement remain blocked by PostgreSQL.
