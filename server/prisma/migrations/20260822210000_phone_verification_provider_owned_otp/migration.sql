-- Twilio Verify owns OTP generation and validation. Legacy local-test
-- challenges may retain a hash, but provider-backed challenges do not.
ALTER TABLE "PhoneVerificationChallenge"
  ALTER COLUMN "codeHash" DROP NOT NULL;
