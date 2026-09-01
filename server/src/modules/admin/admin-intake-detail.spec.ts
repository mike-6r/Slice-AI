import { AdminService } from './admin.service';

describe('admin intake detail projection', () => {
  const now = new Date('2026-08-28T12:00:00.000Z');
  const actor = { userId: 'admin-1', sessionId: null } as never;

  it('returns one server-authoritative lifecycle detail without exposing custody provider references', async () => {
    const db = {
      assetSubmission: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'submission-1',
          intake: {
            id: 'intake-1',
            intakeReference: 'SLICE-00000001',
            status: 'COMPLETE',
            selectedAt: now,
            shippedAt: now,
            deliveredAt: now,
            receivedAt: now,
            updatedAt: now,
            vault: {
              id: 'vault-1',
              displayName: 'Beta intake',
              region: 'Manchester',
              countryCode: 'GB',
              active: true,
              intakeAvailable: true,
              operationallyApproved: true,
              acceptingShipments: true,
              environment: 'beta',
            },
            shipment: {
              carrier: 'UPS',
              trackingNumber: 'TRACK-1',
              status: 'DELIVERED',
              shippedAt: now,
              deliveredAt: now,
              lastCheckedAt: now,
              notes: 'Delivered to the receiving desk.',
            },
            receipt: {
              id: 'receipt-1',
              confirmedAt: now,
              packageCondition: 'ACCEPTABLE',
              checklist: { packageReceived: true },
              notes: 'Package and reference checked.',
              confirmedBy: {
                profile: {
                  displayName: 'Intake operator',
                  publicUsername: 'operator',
                },
              },
            },
            verification: {
              id: 'verification-1',
              status: 'VERIFIED',
              identityMatch: true,
              certificationMatch: true,
              gradeMatch: true,
              variantMatch: true,
              note: 'Verified against the accepted submission.',
              startedAt: now,
              completedAt: now,
            },
            exceptions: [],
          },
          asset: {
            custodyRecord: {
              status: 'INSPECTED',
              receivedAt: now,
              securedAt: null,
              updatedAt: now,
              events: [
                {
                  id: 'custody-event-1',
                  fromStatus: 'RECEIVED',
                  toStatus: 'INSPECTED',
                  actorUserId: 'admin-1',
                  occurredAt: now,
                  providerRef: 'must-not-be-selected',
                },
              ],
            },
          },
        }),
      },
      auditEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'audit-1',
            action: 'INTAKE_VERIFICATION_COMPLETED',
            actorType: 'USER',
            createdAt: now,
            actor: {
              profile: {
                displayName: 'Intake operator',
                publicUsername: 'operator',
              },
            },
          },
        ]),
      },
    };
    const authorize = jest.fn().mockResolvedValue(undefined);
    const service = new AdminService(
      db as never,
      { authorize } as never,
      { evaluate: jest.fn() } as never,
      { isBeta: true } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest.spyOn(service, 'listIntake').mockResolvedValue({
      items: [{ submissionId: 'submission-1', title: 'Canonical card' }],
    } as never);

    const detail = await service.intakeDetail(actor, 'submission-1');

    expect(detail.row.title).toBe('Canonical card');
    expect(detail.intake).toMatchObject({
      id: 'intake-1',
      reference: 'SLICE-00000001',
      receipt: {
        packageCondition: 'ACCEPTABLE',
        confirmedBy: 'Intake operator',
      },
      verification: { status: 'VERIFIED', identityMatch: true },
    });
    expect(detail.custody).toEqual({
      status: 'INSPECTED',
      receivedAt: now.toISOString(),
      securedAt: null,
      updatedAt: now.toISOString(),
    });
    expect(detail.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'INTAKE',
          action: 'INTAKE_VERIFICATION_COMPLETED',
        }),
        expect.objectContaining({
          source: 'CUSTODY',
          action: 'CUSTODY_INSPECTED',
        }),
      ]),
    );
    expect(JSON.stringify(detail)).not.toContain('must-not-be-selected');
    expect(authorize).toHaveBeenCalledWith(actor, 'admin.console.read');
  });
});
