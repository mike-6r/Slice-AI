export type AdminCustomerActionTarget = {
  authority: 'CUSTOMER_COMPLIANCE';
  kind: 'CUSTOMER_CONTROL' | 'COMPLIANCE_CASE' | 'PHONE_VERIFICATION';
  userId: string;
  recordId: string | null;
  actionable: boolean;
  unavailableReason: string | null;
  nextActor: 'ADMIN' | 'CUSTOMER' | 'PROVIDER' | 'SYSTEM';
  nextAction: string;
};

type ComplianceCaseReference = {
  id: string;
  status: string;
};

export function complianceCaseActionTarget(
  userId: string,
  complianceCase: ComplianceCaseReference | null,
): AdminCustomerActionTarget {
  if (!complianceCase)
    return {
      authority: 'CUSTOMER_COMPLIANCE',
      kind: 'COMPLIANCE_CASE',
      userId,
      recordId: null,
      actionable: false,
      unavailableReason: 'No active compliance case is available for review.',
      nextActor: 'SYSTEM',
      nextAction:
        'Wait for an active provider-backed case or compliance exception.',
    };

  const providerPending = complianceCase.status === 'PENDING';
  return {
    authority: 'CUSTOMER_COMPLIANCE',
    kind: 'COMPLIANCE_CASE',
    userId,
    recordId: complianceCase.id,
    actionable: true,
    unavailableReason: null,
    nextActor: providerPending ? 'PROVIDER' : 'ADMIN',
    nextAction: providerPending
      ? 'Review normalized provider state and wait for provider evidence before any Slice decision.'
      : 'Review normalized evidence and use only actions exposed by the compliance case.',
  };
}

export function phoneVerificationActionTarget(
  userId: string,
  input: { verified: boolean; nextAction: string | null },
): AdminCustomerActionTarget {
  return {
    authority: 'CUSTOMER_COMPLIANCE',
    kind: 'PHONE_VERIFICATION',
    userId,
    recordId: 'phone-verification',
    actionable: !input.verified,
    unavailableReason: input.verified
      ? 'The customer phone number is already verified.'
      : null,
    nextActor: 'CUSTOMER',
    nextAction:
      input.nextAction ??
      'The customer must complete provider-backed phone verification from Account settings.',
  };
}

export function customerComplianceControlTarget(
  userId: string,
  source?: AdminCustomerActionTarget,
): AdminCustomerActionTarget {
  return {
    authority: 'CUSTOMER_COMPLIANCE',
    kind: 'CUSTOMER_CONTROL',
    userId,
    recordId: userId,
    actionable: true,
    unavailableReason: null,
    nextActor: source?.nextActor ?? 'ADMIN',
    nextAction:
      source?.nextAction ??
      'Review the customer compliance record and follow the next valid workflow action.',
  };
}
