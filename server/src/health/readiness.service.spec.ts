import { ReadinessService } from './readiness.service';

describe('ReadinessService', () => {
  it('is ready only when both dependencies are up', async () => {
    const service = new ReadinessService(
      {
        check: jest.fn().mockResolvedValue({ status: 'up', latencyMs: 2 }),
      } as never,
      {
        ping: jest.fn().mockResolvedValue({ status: 'up', latencyMs: 1 }),
      } as never,
    );

    await expect(service.check()).resolves.toMatchObject({
      status: 'ready',
      checks: {
        postgres: { status: 'up', latencyMs: 2 },
        redis: { status: 'up', latencyMs: 1 },
      },
    });
  });

  it('returns a dependency-safe not-ready response when a check fails', async () => {
    const service = new ReadinessService(
      {
        check: jest.fn().mockRejectedValue(new Error('postgres://private')),
      } as never,
      {
        ping: jest.fn().mockResolvedValue({ status: 'up', latencyMs: 1 }),
      } as never,
    );

    const result = await service.check();
    expect(result).toEqual(
      expect.objectContaining({
        status: 'not_ready',
        checks: {
          postgres: { status: 'down' },
          redis: { status: 'up', latencyMs: 1 },
        },
      }),
    );
    expect(JSON.stringify(result)).not.toContain('private');
  });
});
