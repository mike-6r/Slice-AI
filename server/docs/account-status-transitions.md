# Account-status transitions

All changes require an ADMIN and a non-empty reason. PENDING_REVIEW may move to ACTIVE, RESTRICTED, SUSPENDED or CLOSED. ACTIVE may move to RESTRICTED, SUSPENDED or CLOSED. RESTRICTED may restore to ACTIVE or move to SUSPENDED/CLOSED. SUSPENDED may restore to ACTIVE only with explicit restoration, or close. CLOSED is final. SUSPEND/CLOSED signal session revocation; every allowed change requires `account.status.changed` audit recording after persistence is available.
