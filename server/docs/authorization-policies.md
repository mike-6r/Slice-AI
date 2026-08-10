# Authorization policies

Roles: USER, SUPPORT, COMPLIANCE_ANALYST, ASSET_REVIEWER, VAULT_OPERATOR, FINANCE_OPERATOR, ADMIN. The pure policy engine evaluates actor status, roles, ownership and action. Active users can read/update their own profiles; restricted users retain limited self-account access; suspended/closed users are denied protected actions. SUPPORT may read limited account data but cannot manage roles. ADMIN can manage roles/status, except unsafe self-escalation is denied. Future asset policies are not implemented.
