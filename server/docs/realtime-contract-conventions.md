# Future real-time envelope

Events use `{ id, type, occurredAt, resource, version, payload }`. IDs support replay/deduplication; authorization scopes distinguish private user channels from public asset channels. Consumers invalidate the documented query key and tolerate unknown future versions. No WebSocket gateway exists.
