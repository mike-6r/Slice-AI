# Identity audit catalogue

Canonical actions cover signup, login success/failure, refresh/replay, logout, profile updates, role changes, account-status changes and session revocation. Request IDs are required for request-originated events. Metadata may include safe identifiers/reasons but never passwords, tokens, cookies, authorization, secrets, private keys or seed phrases. Storage remains blocked by PostgreSQL.
