# Account linking

Discord sends members to the authenticated Slice website for account linking and account management. Slice's existing OAuth flow owns the link, unlink, and Discord identity verification; the bot never handles a Slice session, password, token, or identity document.

Set `SLICE_WEB_BASE_URL` to the trusted Slice web origin. If it is absent, account, collector, and staff buttons fail closed with a short unavailable response. A future bot-specific account-status projection must be service-authenticated, derive identity from `interaction.user.id`, and return only customer-safe normalized data.
