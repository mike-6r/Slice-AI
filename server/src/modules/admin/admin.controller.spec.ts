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

  it('decodes a double-encoded checklist from a legacy client', () => {
    const payload = {
      packageCondition: 'ACCEPTABLE',
      checklist: JSON.stringify(
        JSON.stringify({
          packageReceived: true,
          correctIntakeReference: true,
          correctCollectible: true,
          visibleConditionAcceptable: true,
          tamperDamageChecked: true,
          trackingMatches: true,
        }),
      ),
    };

    expect(
      (controller as unknown as {
        parseIntakeReceiptConfirmation(value: unknown): unknown;
      }).parseIntakeReceiptConfirmation(payload),
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

  it('accepts legacy checklist aliases and array entries', () => {
    const payload = {
      packageCondition: 'ACCEPTABLE',
      checklist: [
        { name: 'Package received', checked: true },
        { name: 'Correct intake reference', checked: true },
        { name: 'Correct collectible', checked: true },
        { name: 'Visible condition acceptable', checked: true },
        { name: 'Tamper / damage checked', checked: true },
        { name: 'Tracking matches', checked: true },
      ],
    };

    expect(
      (controller as unknown as {
        parseIntakeReceiptConfirmation(value: unknown): unknown;
      }).parseIntakeReceiptConfirmation(payload),
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
