// Keep HTTP E2E deterministic even when an operator has configured real local
// provider credentials. Provider-specific suites opt in explicitly per test.
process.env.NODE_ENV = 'test';
process.env.CAPTCHA_ENABLED = 'false';
process.env.CAPTCHA_PROVIDER = 'local_test';
process.env.SIGNUP_CONSENT_REQUIRED = 'false';
process.env.PHONE_DELIVERY_MODE = 'local_test';
process.env.EMAIL_DELIVERY_MODE = 'local_test';
