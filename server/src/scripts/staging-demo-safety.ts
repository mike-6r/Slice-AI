/**
 * Hard boundary for the permanent, human-operated staging showcase fixtures.
 * These scripts must never be used as a general seed or reset mechanism.
 */
export function assertStagingDemoSafety() {
  if (process.env.SLICE_ENV !== 'staging') {
    throw new Error(
      'Refusing demo setup: SLICE_ENV must be exactly "staging".',
    );
  }
  if (process.env.ALLOW_DEMO_DATA_SETUP !== 'true') {
    throw new Error(
      'Refusing demo setup: ALLOW_DEMO_DATA_SETUP=true is required explicitly.',
    );
  }
  if (!process.env.DATABASE_URL || !process.env.REDIS_URL) {
    throw new Error(
      'Refusing demo setup: DATABASE_URL and REDIS_URL are required.',
    );
  }
}

export function requiredSecret(name: string) {
  const value = process.env[name];
  if (!value || value.length < 12) {
    throw new Error(`${name} must be set to a 12+ character runtime secret.`);
  }
  return value;
}

export const demoAccounts = {
  investor: {
    email: 'demo-investor@slicecollectable.com',
    displayName: 'Slice Demo Investor',
    passwordEnv: 'DEMO_INVESTOR_PASSWORD',
  },
  collector: {
    email: 'demo-collector@slicecollectable.com',
    displayName: 'Slice Demo Collector',
    passwordEnv: 'DEMO_COLLECTOR_PASSWORD',
  },
  collectorB: {
    email: 'demo-collector-b@slicecollectable.com',
    displayName: 'Slice Demo Collector B',
    passwordEnv: 'DEMO_COLLECTOR_B_PASSWORD',
  },
  marketMaker: {
    email: 'demo-market-maker@slicecollectable.com',
    displayName: 'Slice Demo Market Maker',
    passwordEnv: 'DEMO_MARKET_MAKER_PASSWORD',
  },
} as const;
