-- Phase 3: distinguish a provider return from a manual/legacy reversal while
-- preserving all historical movement and journal rows.
ALTER TYPE "MoneyMovementStatus" ADD VALUE IF NOT EXISTS 'RETURNED';
