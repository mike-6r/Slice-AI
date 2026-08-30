import {
  betaIntakeFixtureWhere,
  intakeAllowedActions,
  intakeCounts,
  intakeNextAction,
  intakeStage,
  intakeStageReason,
  resolveIntakeWorkType,
} from './admin-intake-projections';

const base = (overrides: Partial<Parameters<typeof intakeStage>[0]> = {}) => ({
  status: 'APPROVED',
  intake: null,
  ...overrides,
});

describe('admin intake projections', () => {
  it('keeps an accepted submission without an intake destination collector-owned', () => {
    const item = base();
    const stage = intakeStage(item);

    expect(stage).toBe('AWAITING_DESTINATION');
    expect(intakeNextAction({ ...item, stage })).toEqual({
      label: 'Await collector destination',
      actor: 'COLLECTOR',
      needsStaffAction: false,
    });
    expect(intakeAllowedActions({ ...item, stage })).toEqual([]);
  });

  it('distinguishes an authorised destination awaiting collector tracking from staff action', () => {
    const item = base({
      intake: {
        status: 'VAULT_SELECTED',
        shipment: null,
        receipt: null,
        verification: null,
        exceptions: [],
      },
    });
    const stage = intakeStage(item);

    expect(stage).toBe('AWAITING_SHIPMENT');
    expect(intakeNextAction({ ...item, stage })).toEqual({
      label: 'Await collector shipment',
      actor: 'COLLECTOR',
      needsStaffAction: false,
    });
    expect(intakeAllowedActions({ ...item, stage })).toEqual([]);
  });

  it('keeps an in-person handoff out of carrier and tracking states', () => {
    const item = base({
      intake: {
        status: 'SHIPPING_REQUIRED',
        deliveryMethod: 'IN_PERSON',
        shipment: null,
        receipt: null,
        verification: null,
        exceptions: [],
      },
    });
    const stage = intakeStage(item);

    expect(stage).toBe('AWAITING_DROP_OFF');
    expect(intakeNextAction({ ...item, stage })).toEqual({
      label: 'Confirm in-person receipt',
      actor: 'STAFF',
      needsStaffAction: true,
    });
    expect(intakeAllowedActions({ ...item, stage })).toEqual([
      'CONFIRM_RECEIPT',
    ]);
  });

  it('keeps carrier delivery, Slice receipt, verification, and custody boundaries separate', () => {
    const delivered = base({
      intake: {
        status: 'DELIVERED',
        shipment: { status: 'DELIVERED' },
        receipt: null,
        verification: null,
        exceptions: [],
      },
    });
    const received = base({
      intake: {
        status: 'RECEIVED',
        shipment: { status: 'DELIVERED' },
        receipt: {},
        verification: { status: 'NOT_STARTED' },
        exceptions: [],
      },
    });
    const verifying = base({
      intake: {
        status: 'VERIFICATION',
        shipment: { status: 'DELIVERED' },
        receipt: {},
        verification: { status: 'IN_PROGRESS' },
        exceptions: [],
      },
    });

    expect(intakeStage(delivered)).toBe('DELIVERED_AWAITING_RECEIPT');
    expect(intakeStage(received)).toBe('RECEIVED');
    expect(intakeStage(verifying)).toBe('VERIFICATION');
    expect(
      intakeNextAction({ ...delivered, stage: intakeStage(delivered) }).label,
    ).toBe('Confirm physical receipt');
    expect(
      intakeNextAction({ ...received, stage: intakeStage(received) }).label,
    ).toBe('Begin verification');
    expect(
      intakeNextAction({ ...verifying, stage: intakeStage(verifying) }).label,
    ).toBe('Complete verification');
    expect(intakeStageReason(received)).toContain('Physical receipt confirmed');
  });

  it('makes active exceptions staff-owned and counts only staff-owned work as needs action', () => {
    const exception = base({
      intake: {
        status: 'IN_TRANSIT',
        shipment: { status: 'EXCEPTION' },
        receipt: null,
        verification: null,
        exceptions: [],
      },
    });
    const exceptionStage = intakeStage(exception);
    expect(intakeNextAction({ ...exception, stage: exceptionStage })).toEqual({
      label: 'Resolve exception',
      actor: 'STAFF',
      needsStaffAction: true,
    });

    expect(
      intakeCounts([
        { stage: 'AWAITING_SHIPMENT', needsStaffAction: false },
        { stage: 'RECEIVED', needsStaffAction: true },
        { stage: 'EXCEPTION', needsStaffAction: true },
      ]),
    ).toMatchObject({
      awaitingDestination: 0,
      accepted: 1,
      needsAction: 2,
      exceptions: 1,
    });
  });
});

describe('Physical Intake fixture boundary', () => {
  it('keeps the staff staging board inclusive unless production is explicitly selected', () => {
    expect(resolveIntakeWorkType(undefined)).toBe('PRODUCTION');
    expect(resolveIntakeWorkType('ALL')).toBe('ALL');
    expect(resolveIntakeWorkType('PRODUCTION')).toBe('PRODUCTION');
    expect(resolveIntakeWorkType('DEMO_QA')).toBe('DEMO_QA');
  });

  it('keeps explicit staging fixtures out of the production projection', () => {
    expect(betaIntakeFixtureWhere()).toMatchObject({
      OR: expect.arrayContaining([
        {
          owner: {
            profile: { publicUsername: { startsWith: 'slice-demo-' } },
          },
        },
        { controlledBetaBypass: { isNot: null } },
        {
          asset: {
            is: {
              OR: expect.arrayContaining([
                { slug: { startsWith: 'qa-test-' } },
              ]),
            },
          },
        },
      ]),
    });
  });
});
