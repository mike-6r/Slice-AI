import { assertStagingDemoSafety, requiredSecret } from './staging-demo-safety';

describe('staging demo safety', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('fails closed without the two explicit staging acknowledgements', () => {
    delete process.env.SLICE_ENV;
    delete process.env.ALLOW_DEMO_DATA_SETUP;
    expect(assertStagingDemoSafety).toThrow('SLICE_ENV');

    process.env.SLICE_ENV = 'staging';
    delete process.env.ALLOW_DEMO_DATA_SETUP;
    expect(assertStagingDemoSafety).toThrow('ALLOW_DEMO_DATA_SETUP');
  });

  it('accepts only an explicit staging setup environment and never logs a secret', () => {
    process.env.SLICE_ENV = 'staging';
    process.env.ALLOW_DEMO_DATA_SETUP = 'true';
    process.env.DATABASE_URL = 'postgresql://slice:password@127.0.0.1:5432/slice';
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';
    process.env.DEMO_TEST_SECRET = 'twelve-characters';

    expect(assertStagingDemoSafety).not.toThrow();
    expect(requiredSecret('DEMO_TEST_SECRET')).toBe('twelve-characters');
    expect(() => requiredSecret('MISSING_DEMO_TEST_SECRET')).toThrow(
      'MISSING_DEMO_TEST_SECRET',
    );
  });
});
