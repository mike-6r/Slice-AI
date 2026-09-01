import { ConflictException } from '@nestjs/common';

import { AdminService } from './admin.service';

const actor = { userId: 'admin-1', sessionId: 'session-1' } as never;
const now = new Date('2026-08-29T12:00:00.000Z');
const input = {
  displayName: 'Slice Beta Intake — UK Test Facility',
  locationType: 'DEMO_TEST' as const,
  environment: 'beta' as const,
  status: 'ACTIVE' as const,
  acceptingNewIntakes: false,
  operationallyApproved: false,
  acceptingShipments: true,
  acceptingInPerson: true,
  receiverName: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  region: 'Greater Manchester',
  postalCode: null,
  countryCode: 'GB',
  acceptedCategoryIds: [],
  shippingInstructions: '',
  inPersonInstructions: null,
  reason: 'Configure the beta test intake location.',
};

function location(overrides: Record<string, unknown> = {}) {
  return {
    id: 'beta-test-uk-intake',
    ...input,
    active: true,
    intakeAvailable: false,
    customerSafeAddress: '',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('admin intake location authority', () => {
  const authorize = jest.fn().mockResolvedValue(undefined);

  it('creates one auditable beta test location without inventing an address', async () => {
    const created = location();
    const tx = {
      vaultIntakeLocation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(created),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const db = {
      category: { count: jest.fn() },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new AdminService(
      db as never,
      { authorize } as never,
      { evaluate: jest.fn() } as never,
      { appEnvironment: 'beta' } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.createIntakeLocation(actor, input, 'request-1'),
    ).resolves.toMatchObject({
      id: 'beta-test-uk-intake',
      acceptingNewIntakes: false,
      acceptingInPerson: true,
      audited: true,
    });
    expect(tx.vaultIntakeLocation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerSafeAddress: '',
          locationType: 'DEMO_TEST',
        }),
      }),
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'INTAKE_LOCATION_CREATED',
          resourceType: 'vault-intake-location',
        }),
      }),
    );
  });

  it('rejects a selectable location that has no customer-safe address', async () => {
    const db = { category: { count: jest.fn() } };
    const service = new AdminService(
      db as never,
      { authorize } as never,
      { evaluate: jest.fn() } as never,
      { appEnvironment: 'beta' } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.createIntakeLocation(
        actor,
        { ...input, operationallyApproved: true, acceptingNewIntakes: true },
        'request-2',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INTAKE_ADDRESS_REQUIRED' }),
    });
  });

  it('uses the existing location id for updates and records a deactivation audit event', async () => {
    const previous = location({
      intakeAvailable: true,
      operationallyApproved: true,
    });
    const updated = location({
      status: 'INACTIVE',
      active: false,
      intakeAvailable: false,
      operationallyApproved: true,
      updatedAt: new Date(now.getTime() + 1_000),
    });
    const tx = {
      vaultIntakeLocation: {
        findUnique: jest.fn().mockResolvedValue(previous),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(updated),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const db = {
      category: { count: jest.fn() },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new AdminService(
      db as never,
      { authorize } as never,
      { evaluate: jest.fn() } as never,
      { appEnvironment: 'beta' } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.updateIntakeLocation(
      actor,
      previous.id,
      { ...input, status: 'INACTIVE', expectedUpdatedAt: now.toISOString() },
      'request-3',
    );
    expect(tx.vaultIntakeLocation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: previous.id },
        data: expect.objectContaining({
          active: false,
          intakeAvailable: false,
        }),
      }),
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'INTAKE_LOCATION_DEACTIVATED',
        }),
      }),
    );
  });

  it('rejects stale updates instead of silently overwriting another operator change', async () => {
    const tx = {
      vaultIntakeLocation: {
        findUnique: jest.fn().mockResolvedValue(location()),
      },
    };
    const db = {
      category: { count: jest.fn() },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new AdminService(
      db as never,
      { authorize } as never,
      { evaluate: jest.fn() } as never,
      { appEnvironment: 'beta' } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.updateIntakeLocation(
        actor,
        'beta-test-uk-intake',
        { ...input, expectedUpdatedAt: '2026-08-29T11:59:00.000Z' },
        'request-4',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
