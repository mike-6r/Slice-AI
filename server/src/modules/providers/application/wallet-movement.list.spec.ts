import { BadRequestException } from '@nestjs/common';
import { Prisma, MoneyMovementStatus } from '@prisma/client';
import { WalletMovementService } from './wallet-movement.service';

const timestamp = new Date('2026-09-18T12:00:00.000Z');
const baseMovement = {
  id: 'abc12345-hidden-id',
  userId: 'user-1',
  type: 'DEPOSIT',
  status: 'SETTLED',
  rail: 'BACS_DIRECT_DEBIT',
  amountMinor: 1000n,
  currency: 'GBP',
  createdAt: timestamp,
  updatedAt: timestamp,
  providerReferenceCiphertext: 'encrypted-provider-secret',
  providerReferenceHash: 'provider-hash-secret',
  idempotencyKeyHash: 'idempotency-secret',
  selectedPayoutDestinationIdCiphertext: 'payout-secret',
  externalAccount: {
    userId: 'user-1',
    institutionName: 'Example Bank',
    accountName: 'Holiday Savings',
    accountMask: '6789',
    accountType: 'bacs_debit',
    accessTokenCiphertext: 'bank-token-secret',
    providerReferenceHash: 'bank-reference-secret',
  },
  history: [
    {
      toStatus: 'SETTLED',
      reasonCode: 'PROVIDER_CONFIRMED',
      createdAt: timestamp,
    },
  ],
  providerCosts: [{ amountMinor: 10n, status: 'OBSERVED' }],
};
type Movement = Omit<typeof baseMovement, 'externalAccount'> & {
  externalAccount: typeof baseMovement.externalAccount | null;
};

function movement(
  id: string,
  createdAt: string,
  overrides: Partial<Movement> = {},
): Movement {
  return { ...baseMovement, id, createdAt: new Date(createdAt), ...overrides };
}

// Small in-memory query executor for pagination regressions. Evaluate the actual
// Prisma predicates (including LIKE escaping), rather than canned page results.
function like(value: unknown, pattern: string) {
  let expression = '';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '%') expression += '.*';
    else if (char === '_') expression += '.';
    else {
      const literal = char === '\\' ? pattern[++i] : char;
      expression += literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return (
    typeof value === 'string' && new RegExp(`^${expression}$`, 'i').test(value)
  );
}

function matches(row: object, where: object): boolean {
  return Object.entries(where).every(([key, condition]: [string, unknown]) => {
    if (key === 'AND' || key === 'OR') {
      const clauses = condition as object[];
      return key === 'AND'
        ? clauses.every((clause) => matches(row, clause))
        : clauses.some((clause) => matches(row, clause));
    }
    const actual = (row as Record<string, unknown>)[key];
    if (condition instanceof Date) {
      return actual instanceof Date && actual.getTime() === condition.getTime();
    }
    if (typeof condition !== 'object' || condition === null)
      return actual === condition;
    return Object.entries(condition).every(
      ([operator, expected]: [string, unknown]) => {
        if (operator === 'mode') return true;
        if (operator === 'is') {
          return (
            actual !== null &&
            typeof actual === 'object' &&
            matches(actual, expected as object)
          );
        }
        if (operator === 'startsWith')
          return like(actual, `${String(expected)}%`);
        if (operator === 'contains')
          return like(actual, `%${String(expected)}%`);
        const left =
          actual instanceof Date ? actual.getTime() : (actual as string);
        const right =
          expected instanceof Date ? expected.getTime() : (expected as string);
        if (operator === 'lt') return left < right;
        if (operator === 'gte') return left >= right;
        if (operator === 'lte') return left <= right;
        throw new Error(`Unsupported test predicate: ${operator}`);
      },
    );
  });
}

function harness(rows: Movement[] = []) {
  const moneyMovement = {
    findFirst: jest.fn(async (args: Prisma.MoneyMovementFindFirstArgs) => {
      const row = rows.find((item) => matches(item, args.where ?? {}));
      return row ? { id: row.id, createdAt: row.createdAt } : null;
    }),
    findMany: jest.fn(async (args: Prisma.MoneyMovementFindManyArgs) => {
      expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
      return rows
        .filter((item) => matches(item, args.where ?? {}))
        .sort(
          (a, b) =>
            b.createdAt.getTime() - a.createdAt.getTime() ||
            (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
        )
        .slice(0, args.take);
    }),
  };
  const crypto = { decrypt: jest.fn().mockReturnValue('pi_private_ABC789') };
  const service = new WalletMovementService(
    { moneyMovement } as never,
    undefined as never,
    undefined as never,
    undefined as never,
    crypto as never,
    { providerMode: 'local' } as never,
  );
  const reconcileDeposits = jest.spyOn(
    service,
    'reconcilePendingStripeDeposits',
  );
  const reconcilePayouts = jest.spyOn(service, 'reconcilePendingStripePayouts');
  return {
    service,
    moneyMovement,
    crypto,
    reconcileDeposits,
    reconcilePayouts,
  };
}

describe('WalletMovementService history pagination and filtering', () => {
  it('preserves default pagination and the customer-safe projection', async () => {
    const { service, moneyMovement, reconcileDeposits, reconcilePayouts } =
      harness([baseMovement]);
    const result = await service.list('user-1');
    expect(moneyMovement.findFirst).not.toHaveBeenCalled();
    expect(moneyMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        take: 21,
        include: {
          externalAccount: {
            select: {
              institutionName: true,
              accountName: true,
              accountMask: true,
              accountType: true,
            },
          },
          history: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: { toStatus: true, reasonCode: true, createdAt: true },
          },
          providerCosts: { select: { amountMinor: true, status: true } },
        },
      }),
    );
    expect(reconcileDeposits).toHaveBeenCalledWith(
      'wallet-movements-list',
      'user-1',
    );
    expect(reconcilePayouts).toHaveBeenCalledWith(
      'wallet-movements-list',
      'user-1',
    );
    expect(result.nextCursor).toBeNull();
    expect(result.items[0]).toMatchObject({
      id: baseMovement.id,
      reference: 'WLT-ABC12345',
      amountMinor: '1000',
      sourceLabel: 'Example Bank · •••• 6789',
      provider: { reference: 'STR-ABC789' },
      fees: { providerFeeMinor: '10' },
      timeline: [{ status: 'SETTLED', occurredAt: timestamp.toISOString() }],
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(
      /secret|Ciphertext|Hash|userId|externalAccount|pi_private/,
    );
  });

  it.each([1, 2, 3, 5])(
    'walks out-of-order IDs and timestamp ties without omissions or duplicates (limit %i)',
    async (limit) => {
      const rows = [
        movement('z-oldest', '2026-09-15T00:00:00Z'),
        movement('a-newest', '2026-09-18T00:00:00Z'),
        movement('m-tie', '2026-09-17T00:00:00Z'),
        movement('a-tie', '2026-09-17T00:00:00Z'),
        movement('z-tie', '2026-09-17T00:00:00Z'),
        movement('foreign', '2026-09-16T00:00:00Z', { userId: 'user-2' }),
      ];
      const { service } = harness(rows);
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 6; page++) {
        const result = await service.list('user-1', cursor, limit);
        seen.push(...result.items.map((item) => item.id));
        if (result.nextCursor === null) break;
        expect(result.nextCursor).toBe(result.items.at(-1)?.id);
        cursor = result.nextCursor;
      }
      expect(seen).toEqual(['a-newest', 'z-tie', 'm-tie', 'a-tie', 'z-oldest']);
    },
  );

  it('does not duplicate an earlier page when a newer movement arrives', async () => {
    const rows = [
      movement('a-first', '2026-09-18T00:00:00Z'),
      movement('z-second', '2026-09-17T00:00:00Z'),
    ];
    const { service } = harness(rows);
    const first = await service.list('user-1', undefined, 1);
    rows.push(movement('0-new', '2026-09-19T00:00:00Z'));
    const next = await service.list('user-1', first.nextCursor!, 1);
    expect(next.items.map((item) => item.id)).toEqual(['z-second']);
    expect(next.nextCursor).toBeNull();
  });

  it.each(['missing', 'foreign'])(
    'rejects %s cursors identically before reconciliation or listing',
    async (cursor) => {
      const { service, moneyMovement, reconcileDeposits, reconcilePayouts } =
        harness([{ ...baseMovement, id: 'foreign', userId: 'user-2' }]);
      await expect(service.list('user-1', cursor)).rejects.toMatchObject({
        constructor: BadRequestException,
        response: { code: 'INVALID_CURSOR', message: 'Cursor is invalid.' },
      });
      expect(moneyMovement.findFirst).toHaveBeenCalledWith({
        where: { id: cursor, userId: 'user-1' },
        select: { id: true, createdAt: true },
      });
      expect(moneyMovement.findMany).not.toHaveBeenCalled();
      expect(reconcileDeposits).not.toHaveBeenCalled();
      expect(reconcilePayouts).not.toHaveBeenCalled();
    },
  );

  it('ANDs filters with the compound cursor and resolves anchors outside the filter', async () => {
    const { service, moneyMovement } = harness([baseMovement]);
    const result = await service.list('user-1', baseMovement.id, 3, {
      type: 'WITHDRAWAL',
      status: 'HELD',
      search: '  wlt-abC12345  ',
      from: '2026-09-01T00:00:00Z',
      to: '2026-09-17T23:59:59Z',
    });
    expect(result).toEqual({ items: [], nextCursor: null });
    expect(moneyMovement.findFirst).toHaveBeenCalledWith({
      where: { id: baseMovement.id, userId: 'user-1' },
      select: { id: true, createdAt: true },
    });
    expect(moneyMovement.findMany.mock.calls[0][0]).toMatchObject({
      take: 4,
      where: {
        userId: 'user-1',
        type: 'WITHDRAWAL',
        status: 'HELD',
        createdAt: {
          gte: new Date('2026-09-01T00:00:00Z'),
          lte: new Date('2026-09-17T23:59:59Z'),
        },
        AND: [
          {
            OR: [
              { createdAt: { lt: timestamp } },
              { createdAt: timestamp, id: { lt: baseMovement.id } },
            ],
          },
          {
            OR: [
              { id: { startsWith: 'ABC12345', mode: 'insensitive' } },
              {
                externalAccount: {
                  is: {
                    userId: 'user-1',
                    OR: [
                      {
                        institutionName: {
                          contains: 'wlt-abC12345',
                          mode: 'insensitive',
                        },
                      },
                      {
                        accountName: {
                          contains: 'wlt-abC12345',
                          mode: 'insensitive',
                        },
                      },
                      {
                        accountMask: {
                          contains: 'wlt-abC12345',
                          mode: 'insensitive',
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
    });
  });

  it.each(Object.values(MoneyMovementStatus))(
    'filters type and status %s',
    async (status) => {
      const { service } = harness([
        { ...baseMovement, id: 'match', type: 'WITHDRAWAL', status },
        { ...baseMovement, id: 'wrong-type', type: 'DEPOSIT', status },
        {
          ...baseMovement,
          id: 'wrong-status',
          type: 'WITHDRAWAL',
          status: status === 'FAILED' ? 'SETTLED' : 'FAILED',
        },
        {
          ...baseMovement,
          id: 'foreign',
          type: 'WITHDRAWAL',
          status,
          userId: 'user-2',
        },
      ]);
      const result = await service.list('user-1', undefined, 20, {
        type: 'WITHDRAWAL',
        status,
      });
      expect(result.items.map((item) => item.id)).toEqual(['match']);
    },
  );

  it.each([
    [{ from: '2026-09-18T12:00:00Z' }, ['after', 'at']],
    [{ to: '2026-09-18T12:00:00Z' }, ['at', 'before']],
    [{ from: '2026-09-18T12:00:00Z', to: '2026-09-18T12:00:00Z' }, ['at']],
  ])('uses inclusive timestamp bounds %j', async (filters, ids) => {
    const { service } = harness([
      movement('before', '2026-09-18T11:59:59.999Z'),
      movement('at', '2026-09-18T12:00:00.000Z'),
      movement('after', '2026-09-18T12:00:00.001Z'),
    ]);
    const result = await service.list('user-1', undefined, 20, filters);
    expect(result.items.map((item) => item.id)).toEqual(ids);
  });

  it('paginates filtered results across ties even when the cursor status changes', async () => {
    const rows = ['z-match', 'y-other', 'x-match', 'w-match'].map((id) => ({
      ...baseMovement,
      id,
      status: id === 'y-other' ? 'FAILED' : 'SETTLED',
    }));
    const { service } = harness(rows);
    const filters = { status: 'SETTLED' as const, search: 'savings' };
    const first = await service.list('user-1', undefined, 1, filters);
    expect(first.items.map((item) => item.id)).toEqual(['z-match']);
    rows[0].status = 'FAILED';
    const second = await service.list('user-1', first.nextCursor!, 1, filters);
    const third = await service.list('user-1', second.nextCursor!, 1, filters);
    expect(second.items.map((item) => item.id)).toEqual(['x-match']);
    expect(third.items.map((item) => item.id)).toEqual(['w-match']);
    expect(third.nextCursor).toBeNull();
  });

  it.each([
    'wlt-abc12345',
    'ABC12345',
    '12345',
    'T-ABC',
    'WLT-',
    'example bank',
    'HOLIDAY',
    '6789',
  ])('searches safe displayed fields for %s', async (search) => {
    const { service } = harness([baseMovement]);
    const result = await service.list('user-1', undefined, 20, { search });
    expect(result.items.map((item) => item.id)).toEqual([baseMovement.id]);
  });

  it.each([
    'hidden',
    'hidden-id',
    '45-h',
    'abc12345-hidden',
    'WLT-ABC12345-HIDDEN',
    'provider-secret',
    'provider-hash-secret',
    'idempotency-secret',
    'bank-token-secret',
    'bank-reference-secret',
    'payout-secret',
    'pi_private',
    'ABC789',
    '%',
    '_',
    '\\',
  ])(
    'does not search hidden fields or interpret user wildcards: %s',
    async (search) => {
      const { service, crypto } = harness([baseMovement]);
      expect(await service.list('user-1', undefined, 20, { search })).toEqual({
        items: [],
        nextCursor: null,
      });
      expect(crypto.decrypt).not.toHaveBeenCalled();
    },
  );

  it('matches LIKE metacharacters literally in safe account labels', async () => {
    const { service, moneyMovement } = harness([
      {
        ...baseMovement,
        externalAccount: {
          ...baseMovement.externalAccount,
          accountName: '100%_\\ Savings',
        },
      },
    ]);
    const result = await service.list('user-1', undefined, 20, {
      search: '%_\\',
    });
    expect(result.items).toHaveLength(1);
    const query = JSON.stringify(moneyMovement.findMany.mock.calls[0][0].where);
    expect(query).toContain(JSON.stringify('\\%\\_\\\\'));
  });

  it('does not match a different tenant through the reference or account branch', async () => {
    const { service } = harness([
      { ...baseMovement, userId: 'user-2' },
      {
        ...baseMovement,
        id: 'different-id',
        externalAccount: { ...baseMovement.externalAccount, userId: 'user-2' },
      },
    ]);
    for (const search of ['WLT-ABC12345', 'Example Bank']) {
      expect(
        (await service.list('user-1', undefined, 20, { search })).items,
      ).toEqual([]);
    }
  });

  it('handles blank search, missing accounts, and empty results', async () => {
    const { service, moneyMovement } = harness([
      { ...baseMovement, externalAccount: null },
    ]);
    expect(
      (await service.list('user-1', undefined, 20, { search: '   ' })).items,
    ).toHaveLength(1);
    expect(moneyMovement.findMany.mock.calls[0][0].where).toEqual({
      userId: 'user-1',
    });
    expect(
      (await service.list('user-1', undefined, 20, { search: 'WLT-ABC12345' }))
        .items,
    ).toHaveLength(1);
    expect(
      (await service.list('user-1', undefined, 20, { search: 'Example Bank' }))
        .items,
    ).toEqual([]);
    expect(await harness().service.list('user-1')).toEqual({
      items: [],
      nextCursor: null,
    });
  });
});
