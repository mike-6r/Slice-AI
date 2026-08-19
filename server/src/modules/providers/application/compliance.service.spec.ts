import { ConflictException } from '@nestjs/common';
import { ComplianceService } from './compliance.service';

describe('ComplianceService identity gate and manual hold separation', () => {
  it('blocks a configured action while a hold is active and restores policy evaluation after release', async () => {
    let activeHold: { status: 'ACTIVE' } | null = { status: 'ACTIVE' };
    const db = {
      complianceCase: { findUnique: jest.fn().mockResolvedValue({ status: 'APPROVED' }) },
      complianceHold: { findFirst: jest.fn().mockImplementation(async () => activeHold) },
    };
    const service = new ComplianceService(
      db as never,
      {} as never,
      { providerMode: 'local' } as never,
    );

    const blocked = service.requireIdentityApproved('user-1', ['WITHDRAWAL']);
    await expect(blocked).rejects.toBeInstanceOf(ConflictException);

    activeHold = null;
    await expect(service.requireIdentityApproved('user-1', ['WITHDRAWAL'])).resolves.toBeUndefined();
    expect(db.complianceCase.findUnique).toHaveBeenCalledTimes(2);
    expect(db.complianceHold.findFirst).toHaveBeenCalledTimes(2);
  });
});
