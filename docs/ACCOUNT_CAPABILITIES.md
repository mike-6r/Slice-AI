# Account capabilities

The application derives customer capabilities at request time from the existing
identity, account-security, compliance, operational-feature, and account-status
authorities. It does not persist a second verified-account flag.

`GET /v1/me/capabilities` is the safe read model. It returns only an allowed
flag, a customer-safe reason code, and requirement completion flags. It never
returns compliance-case identifiers, provider payloads, hold details, financial
account data, or ledger references.

| Capability family                                                       | Required account state                                                                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Browse, public discovery, portfolio read, profile and security settings | Authenticated account that is not restricted or deactivated                                                   |
| List an asset and link a bank                                           | ACTIVE account and verified email; listing additionally respects the operational listing switch               |
| Deposit, trade, and financial actions                                   | ACTIVE, verified email, enabled operational feature, approved identity/compliance state, and no relevant hold |
| Withdraw                                                                | Deposit/trade requirements plus verified phone and enabled TOTP                                               |

The API remains authoritative. Frontend checks provide an honest setup prompt,
but direct mutation requests are rejected by the same server-side capability
authority. Existing finance, ownership, trading, provider, and compliance gates
remain in force after a capability is granted.

Signup may be completed while verification is pending. The account can browse,
manage its profile and security settings, and return later to complete setup;
restricted actions are explicitly blocked until their requirements are met.
An active deletion request blocks high-risk capabilities while leaving the
account-security path available so a customer can inspect or cancel the request.
