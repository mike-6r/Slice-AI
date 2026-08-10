-- Keep legacy provider enum values for historical records while enabling the
-- active Plaid compliance adapter.
ALTER TYPE "ProviderCode" ADD VALUE IF NOT EXISTS 'PLAID';
