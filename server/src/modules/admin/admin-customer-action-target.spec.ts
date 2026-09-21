import {
  complianceCaseActionTarget,
  customerComplianceControlTarget,
  phoneVerificationActionTarget,
} from './admin-customer-action-target';

describe('admin customer compliance action targets', () => {
  it('targets the exact active provider-backed compliance case', () => {
    expect(
      complianceCaseActionTarget('user-1', {
        id: 'case-kyc-1',
        status: 'MANUAL_REVIEW',
      }),
    ).toMatchObject({
      authority: 'CUSTOMER_COMPLIANCE',
      kind: 'COMPLIANCE_CASE',
      userId: 'user-1',
      recordId: 'case-kyc-1',
      actionable: true,
      nextActor: 'ADMIN',
    });
  });

  it('does not advertise a dead case action when no case exists', () => {
    expect(complianceCaseActionTarget('user-1', null)).toMatchObject({
      actionable: false,
      recordId: null,
      unavailableReason: 'No active compliance case is available for review.',
      nextActor: 'SYSTEM',
    });
  });

  it('keeps provider-pending evidence provider-owned', () => {
    expect(
      complianceCaseActionTarget('user-1', {
        id: 'case-pending-1',
        status: 'PENDING',
      }),
    ).toMatchObject({
      actionable: true,
      nextActor: 'PROVIDER',
    });
  });

  it('routes phone review to the account blocker without fabricating verification', () => {
    expect(
      phoneVerificationActionTarget('user-1', {
        verified: false,
        nextAction: 'Verify the phone number.',
      }),
    ).toEqual({
      authority: 'CUSTOMER_COMPLIANCE',
      kind: 'PHONE_VERIFICATION',
      userId: 'user-1',
      recordId: 'phone-verification',
      actionable: true,
      unavailableReason: null,
      nextActor: 'CUSTOMER',
      nextAction: 'Verify the phone number.',
    });
  });

  it('uses the shared customer compliance control for the primary action', () => {
    const caseTarget = complianceCaseActionTarget('user-1', {
      id: 'case-1',
      status: 'REVIEW',
    });
    expect(customerComplianceControlTarget('user-1', caseTarget)).toMatchObject(
      {
        authority: 'CUSTOMER_COMPLIANCE',
        kind: 'CUSTOMER_CONTROL',
        userId: 'user-1',
        recordId: 'user-1',
        actionable: true,
        nextActor: 'ADMIN',
      },
    );
  });
});
