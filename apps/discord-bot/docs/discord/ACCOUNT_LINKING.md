# Account linking

**BACKEND SEAM REQUIRED.** Slice currently exposes no bot-safe Discord linking contract. Required endpoints are a service-authenticated challenge creator, normalized link-status lookup, unlink operation, and a safe website verification handoff. The bot obtains the Discord identity only from `interaction.user.id`; it never accepts user-provided Discord IDs, passwords, tokens, or verification documents.
