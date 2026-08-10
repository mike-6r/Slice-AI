# API conventions

Base prefix: `/api/v1`. IDs are opaque non-empty strings; timestamps are ISO-8601 UTC strings. Pagination is `{ data, nextCursor }`; errors are `{ code, message, fieldErrors?, requestId }`. GBP is integer minor units; USDC is a decimal string. Public contracts never expose raw Prisma models, dates, hashes, tokens or stacks.
