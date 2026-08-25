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

  it('returns verified identity details only for an approved case', async () => {
    const db = {
      complianceCase: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'APPROVED',
          identityVerifiedAt: new Date('2026-08-20T10:00:00.000Z'),
          providerReferenceCiphertext: 'encrypted-reference',
        }),
      },
    };
    const crypto = { decrypt: jest.fn().mockReturnValue('vs_test_verified') };
    const identity = {
      getIdentityVerification: jest.fn().mockResolvedValue({
        status: 'APPROVED',
        verifiedDetails: {
          fullName: 'Michael Fultz',
          email: 'povnu@example.com',
          phone: null,
          dateOfBirth: null,
          address: {
            line1: '1 Slice Street',
            line2: null,
            city: 'London',
            region: null,
            postalCode: 'SW1A 1AA',
            countryCode: 'GB',
          },
        },
      }),
    };
    const service = new ComplianceService(
      db as never,
      crypto as never,
      { providerMode: 'stripe_sandbox' } as never,
      identity as never,
    );

    await expect(service.identityDetails('user-1')).resolves.toMatchObject({
      available: true,
      verifiedAt: '2026-08-20T10:00:00.000Z',
      details: { fullName: 'Michael Fultz', address: { countryCode: 'GB' } },
    });
    expect(crypto.decrypt).toHaveBeenCalledWith('encrypted-reference', 'compliance:user-1');
    expect(identity.getIdentityVerification).toHaveBeenCalledWith('vs_test_verified');
  });

  it('does not ask the provider for details before approval', async () => {
    const db = {
      complianceCase: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'PENDING',
          identityVerifiedAt: null,
          providerReferenceCiphertext: 'encrypted-reference',
        }),
      },
    };
    const identity = { getIdentityVerification: jest.fn() };
    const service = new ComplianceService(
      db as never,
      {} as never,
      { providerMode: 'stripe_sandbox' } as never,
      identity as never,
    );

    await expect(service.identityDetails('user-1')).resolves.toEqual({
      available: false,
      verifiedAt: null,
      details: null,
    });
    expect(identity.getIdentityVerification).not.toHaveBeenCalled();
  });
});
