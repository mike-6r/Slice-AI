# Planned identity API contract

`POST /auth/signup`, `/login`, `/refresh`, `/logout`, `GET /auth/session`, `GET/PATCH /me` are planned only. They use the canonical envelope, account-status restrictions, audit actions and rate-limit categories. Signup is idempotent; login/refresh are not. No controller exists until durable persistence is available.
