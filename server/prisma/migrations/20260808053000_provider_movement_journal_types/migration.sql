-- Document 016: provider-confirmed GBP movement journals remain within the
-- established Document 013 authority; no foreign currency or FX is introduced.
ALTER TYPE "JournalTransactionType" ADD VALUE IF NOT EXISTS 'EXTERNAL_DEPOSIT';
ALTER TYPE "JournalTransactionType" ADD VALUE IF NOT EXISTS 'EXTERNAL_WITHDRAWAL';
