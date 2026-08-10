import { IdempotencyCoordinator } from './idempotency-coordinator';
import type { IdentityUnitOfWork } from '../ports/repositories';

describe('IdempotencyCoordinator safe replay payloads', () => {
  it('rejects sensitive fields nested inside arrays before durable completion', async () => {
    const uow: IdentityUnitOfWork = {
      withinTransaction: async (work) =>
        work({
          idempotency: {
            acquire: async () => ({ state: 'ACQUIRED', record: {} }),
            complete: async () => undefined,
            find: async () => null,
          },
        } as never),
    };
    const coordinator = new IdempotencyCoordinator(uow);
    await expect(
      coordinator.run(
        { actorScope: 'user:test', scope: 'test', key: 'key' },
        'POST',
        '/test',
        {},
        async () => ({ records: [{ refreshToken: 'must-not-persist' }] }),
      ),
    ).rejects.toThrow('Unsafe idempotency result field: refreshToken');
  });
});
