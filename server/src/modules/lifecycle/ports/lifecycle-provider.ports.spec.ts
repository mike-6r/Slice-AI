import {
  ManualLifecycleProvider,
  UnavailableLifecycleProvider,
} from './lifecycle-provider.ports';

describe('lifecycle provider boundaries', () => {
  it('labels manual verification honestly', async () => {
    await expect(
      new ManualLifecycleProvider('vault').verify('local-ref'),
    ).resolves.toEqual({ verified: false, code: 'MANUAL_UNVERIFIED' });
  });

  it('fails closed when no production provider is approved', async () => {
    await expect(
      new UnavailableLifecycleProvider('insurance').verify('ref'),
    ).rejects.toMatchObject({ response: { code: 'PROVIDER_UNAVAILABLE' } });
  });
});
