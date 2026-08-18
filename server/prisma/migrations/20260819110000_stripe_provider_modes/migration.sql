-- Additive provider preparation only. Historical Bridge/Plaid rows remain
-- readable; no existing provider data is rewritten or deleted.
ALTER TYPE "ProviderCode" ADD VALUE IF NOT EXISTS 'STRIPE_SANDBOX';
ALTER TYPE "ProviderCode" ADD VALUE IF NOT EXISTS 'STRIPE_LIVE';
