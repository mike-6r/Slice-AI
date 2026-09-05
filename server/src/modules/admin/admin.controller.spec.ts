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

  it('normalizes receipt payloads from older admin bundles without inventing attestations', () => {
    const parse = (value: unknown) =>
      (controller as unknown as {
        parseIntakeReceiptConfirmation(input: unknown): unknown;
      }).parseIntakeReceiptConfirmation(value);

    expect(
      parse({
        packageCondition: 'GOOD',
        packageReceived: true,
        correctIntakeReference: true,
        correctCollectible: true,
        visibleConditionAcceptable: true,
        tamperDamageChecked: true,
        trackingMatches: true,
      }),
    ).toEqual({
      packageCondition: 'ACCEPTABLE',
      checklist: {
        packageReceived: true,
        correctIntakeReference: true,
        correctCollectible: true,
        visibleConditionAcceptable: true,
        tamperDamageChecked: true,
        trackingMatches: true,
      },
    });
  });
});
