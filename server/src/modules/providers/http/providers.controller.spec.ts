import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { MoneyMovementStatus } from '@prisma/client';
import { AccessTokenGuard } from '../../identity/auth/access-token.guard';
import { ProvidersController } from './providers.controller';

describe('ProvidersController wallet movement queries', () => {
  const list = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
  const controller = new ProvidersController(
    undefined as never,
    { list } as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
  );
  const request = { actor: { userId: 'user-1' } } as never;

  beforeEach(() => jest.clearAllMocks());

  it('keeps authentication and uses the actor with the existing default page size', async () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, controller.list)).toContain(
      AccessTokenGuard,
    );
    await expect(controller.list({}, request)).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(list).toHaveBeenCalledWith('user-1', undefined, 20, {});
  });

  it('validates and forwards all filters with the existing ID cursor', () => {
    controller.list(
      {
        cursor: 'movement-id',
        limit: '100',
        type: 'WITHDRAWAL',
        status: 'HELD',
        search: '  WLT-ABC12345  ',
        from: '2026-09-01T00:00:00Z',
        to: '2026-09-18T23:59:59.999Z',
      },
      request,
    );
    expect(list).toHaveBeenCalledWith('user-1', 'movement-id', 100, {
      type: 'WITHDRAWAL',
      status: 'HELD',
      search: 'WLT-ABC12345',
      from: '2026-09-01T00:00:00Z',
      to: '2026-09-18T23:59:59.999Z',
    });
  });

  it.each(Object.values(MoneyMovementStatus))('accepts status %s', (status) => {
    controller.list({ status }, request);
    expect(list).toHaveBeenCalledWith('user-1', undefined, 20, { status });
  });

  it.each([
    { limit: '1' },
    { type: 'DEPOSIT' },
    { search: 'x'.repeat(100) },
    { search: '   ' },
    { from: '2026-09-18T00:00:00Z' },
    { from: '2026-09-18T00:00:00.1Z' },
    { to: '2026-09-18T00:00:00.01Z' },
    { to: '2026-09-18T00:00:00.001Z' },
    { from: '2026-09-18T00:00:00Z', to: '2026-09-18T00:00:00.000Z' },
  ])('accepts boundary query %j', (query) => {
    controller.list(query, request);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it.each([
    { limit: '0' },
    { limit: '-1' },
    { limit: '101' },
    { limit: '1.5' },
    { limit: 'NaN' },
    { limit: 'Infinity' },
    { limit: '' },
    { cursor: '' },
    { cursor: 'x'.repeat(257) },
    { cursor: ['movement-id'] },
    { type: 'deposit' },
    { type: 'TRANSFER' },
    { type: ['DEPOSIT', 'WITHDRAWAL'] },
    { status: 'COMPLETED' },
    { status: ['SETTLED'] },
    { search: 'x'.repeat(101) },
    { search: ` ${'x'.repeat(100)} ` },
    { search: ['bank'] },
    { from: '2026-09-18' },
    { from: '2026-09-18T12:00:00' },
    { from: '2026-09-18T12:00:00+01:00' },
    { to: '2026-02-30T12:00:00Z' },
    { to: 'not-a-date' },
    { from: '2026-09-18T12:00:00.0009Z' },
    { to: '2026-09-18T12:00:00.0001Z' },
    { from: '2026-09-18T12:00:00.0009Z', to: '2026-09-18T12:00:00.0001Z' },
    { from: '2026-09-18T00:00:00.001Z', to: '2026-09-18T00:00:00Z' },
    { userId: 'another-user' },
    { providerReference: 'secret' },
  ])('rejects invalid query %j before service work', (query) => {
    expect(() => controller.list(query, request)).toThrow(BadRequestException);
    try {
      controller.list(query, request);
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'VALIDATION_FAILED',
      });
    }
    expect(list).not.toHaveBeenCalled();
  });
});
