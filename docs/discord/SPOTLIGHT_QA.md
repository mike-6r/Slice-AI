# Collector and Collectible Spotlight

## Sources and privacy

Spotlight uses the Discord-safe Slice backend client only. Collector requests
require an explicitly public profile and matching linked Discord identity.
Collectible requests use only public assets. Private accounts, wallets, KYC,
email, internal identifiers, ownership records, and unapproved assets are not
rendered.

## Workflow

`/spotlight collector` and `/spotlight collectible` create durable requests.
Staff can list, view, edit editorial title/copy, approve, cancel, publish, or
prepare a Snapshot-mode scheduler draft. Source data is refreshed immediately
before publish; stale or private records block publication.

## Publication safety

Publication records the target channel and message receipt. Per-guild cooldown
prevents repeat source spam. Editorial fields are sanitized and cannot alter
backend-derived public facts. State changes use a revision check and every
operation has a durable audit entry.

## Validation

Unit tests cover public-data enforcement, identity requirements, source
locking, cooldown, approval, and guild isolation. Manual publish QA must use a
configured non-public QA channel.
