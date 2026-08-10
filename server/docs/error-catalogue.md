# Identity error catalogue

Validation is 400; credentials/session errors 401; account unavailable/forbidden 403; duplicate/transition/idempotency conflicts 409; unassigned role 404; rate limit 429; dependency unavailable 503. Messages are generic where enumeration is possible, field errors are validation-only, and internal details never enter responses.
