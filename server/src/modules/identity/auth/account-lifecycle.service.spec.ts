import { ConflictException } from '@nestjs/common';
import { AccountLifecycleService } from './account-lifecycle.service';
import { dataExportSchema, deactivateAccountSchema, deletionRequestSchema } from '../dto/identity.schemas';

type LifecycleInternals = {
  deletionDto(request: {
    status: string;
    requestedAt: Date;
    updatedAt: Date;
    cancelledAt: Date | null;
    blockedReason: string | null;
  }): unknown;
  blockDeactivation(blockers: string[]): never;
};

describe('account lifecycle request validation', () => {
  it('requires explicit customer confirmations', () => {
    expect(dataExportSchema.safeParse({ confirmation: 'EXPORT_MY_DATA' }).success).toBe(true);
    expect(deactivateAccountSchema.safeParse({ confirmation: 'DEACTIVATE_MY_ACCOUNT' }).success).toBe(true);
    expect(deletionRequestSchema.safeParse({ confirmation: 'DELETE_MY_ACCOUNT' }).success).toBe(true);
    expect(dataExportSchema.safeParse({}).success).toBe(false);
    expect(deactivateAccountSchema.safeParse({ confirmation: true }).success).toBe(false);
    expect(deletionRequestSchema.safeParse({ confirmation: 'delete' }).success).toBe(false);
  });

  it('does not expose raw deletion identifiers in the customer DTO', () => {
    const service = new AccountLifecycleService({} as never, {} as never, {} as never);
    const internals = service as unknown as LifecycleInternals;
    const dto = internals.deletionDto({ status: 'BLOCKED', requestedAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'), cancelledAt: null, blockedReason: 'OPEN_ORDERS' });
    expect(dto).toEqual(expect.objectContaining({ status: 'BLOCKED', blockedReason: 'OPEN_ORDERS', canCancel: true }));
    expect(JSON.stringify(dto)).not.toContain('id');
  });

  it('uses a safe conflict for unresolved deactivation obligations', () => {
    const service = new AccountLifecycleService({} as never, {} as never, {} as never);
    const internals = service as unknown as LifecycleInternals;
    expect(() => internals.blockDeactivation(['OPEN_ORDERS'])).toThrow(ConflictException);
  });
});
