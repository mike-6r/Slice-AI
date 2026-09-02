import { ConflictException, ForbiddenException } from '@nestjs/common';

import { AdminAccountControlService } from './admin-account-control.service';

const actor = {
  userId: 'admin-1',
  sessionId: 'session-1',
  authenticatedAt: new Date(),
} as never;
const revision = '2026-09-01T12:00:00.000Z';

function transaction() {
  return {
    idempotencyRecord: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'user-1',
        updatedAt: new Date(revision),
        accountStatus: 'ACTIVE',
      }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    roleAssignment: {
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(2),
    },
    accountStatusHistory: { create: jest.fn().mockResolvedValue({}) },
    userProfile: { upsert: jest.fn().mockResolvedValue({}) },
    session: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
    userTwoFactor: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    userSmsTwoFactor: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    twoFactorRecoveryCode: {
      deleteMany: jest.fn().mockResolvedValue({ count: 4 }),
    },
    twoFactorLoginChallenge: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    twoFactorActionChallenge: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    complianceHold: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'hold-1',
        scope: 'WITHDRAWAL',
        status: 'ACTIVE',
        reasonCode: 'MANUAL_REVIEW',
        source: 'ADMIN_ACCOUNT_CONTROL',
      }),
      update: jest.fn(),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
    accountAdminOverride: {
      create: jest.fn().mockResolvedValue({ id: 'override-1' }),
    },
  };
}

function setup(tx = transaction()) {
  const db = { $transaction: jest.fn((callback) => callback(tx)) };
  const authorization = { authorize: jest.fn().mockResolvedValue(undefined) };
  const recentAuth = { require: jest.fn() };
  const capabilities = {
    evaluate: jest.fn().mockResolvedValue({
      capability: 'LIST_ASSET',
      allowed: false,
      status: 'ACTION_REQUIRED',
      reason: 'FEATURE_DISABLED',
      nextAction: null,
      requirements: [],
    }),
  };
  return {
    service: new AdminAccountControlService(
      db as never,
      authorization as never,
      recentAuth as never,
      capabilities as never,
    ),
    db,
    tx,
    authorization,
    recentAuth,
    capabilities,
  };
}

describe('AdminAccountControlService', () => {
  it('updates profile fields through a revision-checked, audited, idempotent mutation', async () => {
    const { service, tx, authorization, recentAuth } = setup();

    const result = await service.updateProfile(
      actor,
      'user-1',
      {
        expectedRevision: revision,
        reasonCode: 'PROFILE_CORRECTION',
        displayName: 'Corrected collector',
        timezone: 'Europe/London',
      },
      'request-1',
      'key-1',
    );

    expect(authorization.authorize).toHaveBeenCalledWith(
      actor,
      'users.profile.manage',
      'user-1',
      undefined,
      'request-1',
    );
    expect(recentAuth.require).toHaveBeenCalledWith(actor);
    expect(tx.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1', updatedAt: new Date(revision) },
      }),
    );
    expect(tx.userProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        update: {
          displayName: 'Corrected collector',
          timezone: 'Europe/London',
        },
      }),
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ADMIN_ACCOUNT_PROFILE_UPDATED',
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        changedFields: ['displayName', 'timezone'],
      }),
    );
  });

  it('refuses a self-directed administrative security action before mutating sessions', async () => {
    const { service, tx } = setup();

    await expect(
      service.revokeSessions(
        actor,
        'admin-1',
        { expectedRevision: revision, reasonCode: 'SECURITY_REVIEW' },
        'request-2',
        'key-2',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.session.updateMany).not.toHaveBeenCalled();
  });

  it('does not create a second active restriction for the same scope', async () => {
    const tx = transaction();
    tx.complianceHold.findFirst.mockResolvedValue({ id: 'existing-hold' });
    const { service } = setup(tx);

    await expect(
      service.createRestriction(
        actor,
        'user-1',
        {
          expectedRevision: revision,
          reasonCode: 'MANUAL_REVIEW',
          scope: 'WITHDRAWAL',
        },
        'request-3',
        'key-3',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.complianceHold.create).not.toHaveBeenCalled();
  });

  it('refuses unsupported locked state correction without mutating the account', async () => {
    const { service, tx } = setup();

    await expect(
      service.forceSetState(
        actor,
        'user-1',
        {
          expectedRevision: revision,
          targetState: 'LOCKED',
          reason: 'The login projection is stale.',
          confirmation: 'FORCE OVERRIDE',
        },
        'request-4',
        'key-4',
      ),
    ).rejects.toMatchObject({ response: { code: 'ACCOUNT_STATE_UNSUPPORTED' } });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('records a capability override as an explicit audited exception', async () => {
    const { service, tx } = setup();

    const result = await service.overrideCapability(
      actor,
      'user-1',
      {
        expectedRevision: revision,
        capability: 'LIST_ASSET',
        forcedState: 'ENABLED',
        reason: 'Repair the stale Collector projection.',
        confirmation: 'FORCE OVERRIDE',
      },
      'request-5',
      'key-5',
    );

    expect(tx.accountAdminOverride.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetType: 'CAPABILITY',
          targetKey: 'LIST_ASSET',
          forcedState: 'ENABLED',
          source: 'ADMIN_OVERRIDE',
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        overrideId: 'override-1',
        capability: 'LIST_ASSET',
        forcedState: 'ENABLED',
      }),
    );
  });
});
