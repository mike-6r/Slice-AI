import { AdminController } from './admin.controller';

describe('AdminController receipt validation', () => {
  const controller = new AdminController({} as never, {} as never);

  it('accepts a legacy JSON-encoded receipt payload during rollout', () => {
    const payload = {
      packageCondition: 'ACCEPTABLE',
      checklist: {
        packageReceived: true,
        correctIntakeReference: true,
        correctCollectible: true,
        visibleConditionAcceptable: true,
        tamperDamageChecked: true,
        trackingMatches: true,
      },
      notes: 'Received intact.',
    };

    expect(
      (controller as unknown as {
        parseIntakeReceiptConfirmation(value: unknown): unknown;
      }).parseIntakeReceiptConfirmation(JSON.stringify(payload)),
    ).toEqual(payload);
  });
});
