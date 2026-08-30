import type { Prisma } from '@prisma/client';
import { STAGING_DEMO_PIKACHU_SUBMISSION_ID } from '../lifecycle/domain/staging-demo-physical.policy';

export type AdminAttention = {
  id: string;
  type: string;
  subject: string;
  collector: string;
  stage: string;
  reason: string;
  age: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  waitingOn: 'COLLECTOR' | 'SLICE';
  target: 'reviews' | 'intake' | 'valuations' | 'custody';
};

/** Demo submissions remain auditable, but are not real beta intake records. */
export function isBetaFixtureSubmission(metadata: Prisma.JsonValue | null) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    return false;
  const value = metadata as Record<string, unknown>;
  return (
    value.betaFixtureRetired === true ||
    (typeof value.certificationNumber === 'string' &&
      value.certificationNumber.startsWith('STG-'))
  );
}

/**
 * Production Physical Intake must never be populated by the staging showcase,
 * controlled beta bypasses, or explicit owner-demo work. The records remain
 * queryable for controlled QA, but are not operational intake work.
 */
export function betaIntakeFixtureWhere(): Prisma.AssetSubmissionWhereInput {
  return {
    OR: [
      { id: STAGING_DEMO_PIKACHU_SUBMISSION_ID },
      { stagingDemoPhysicalIntake: { isNot: null } },
      { controlledBetaBypass: { isNot: null } },
      {
        owner: {
          profile: { publicUsername: { startsWith: 'slice-demo-' } },
        },
      },
      {
        asset: {
          is: {
            OR: [
              { slug: { startsWith: 'slice-demo-' } },
              { slug: { startsWith: 'qa-test-' } },
            ],
          },
        },
      },
      { declaredMetadata: { path: ['betaFixtureRetired'], equals: true } },
      {
        declaredMetadata: {
          path: ['certificationNumber'],
          string_starts_with: 'STG-',
        },
      },
    ],
  };
}

/** ALL is the staff staging view. Each non-production record is explicitly
 * tagged in the response; production deployment does not use this fixture
 * partition at all. */
export function resolveIntakeWorkType(
  value: 'ALL' | 'PRODUCTION' | 'DEMO_QA' | undefined,
): 'ALL' | 'PRODUCTION' | 'DEMO_QA' {
  if (value === 'DEMO_QA' || value === 'ALL') return value;
  return 'PRODUCTION';
}

export function ageLabel(updatedAt: Date) {
  const minutes = Math.max(
    1,
    Math.floor((Date.now() - updatedAt.getTime()) / 60_000),
  );
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function attention(
  id: string,
  type: string,
  subject: string,
  collector: string,
  stage: string,
  reason: string,
  age: string,
  severity: AdminAttention['severity'],
  waitingOn: AdminAttention['waitingOn'],
  target: AdminAttention['target'],
): AdminAttention {
  return {
    id,
    type,
    subject,
    collector,
    stage,
    reason,
    age,
    severity,
    waitingOn,
    target,
  };
}

type IntakeState = {
  status: string;
  intake: {
    status: string;
    deliveryMethod?: 'SHIPMENT' | 'IN_PERSON';
    shipment: { status: string } | null;
    receipt: unknown;
    verification?: { status: string } | null;
    exceptions?: Array<unknown>;
  } | null;
};

export function intakeStage(item: IntakeState) {
  // A submission cannot ship before Slice has selected an authorised receiving destination.
  if (!item.intake)
    return item.status === 'APPROVED' ? 'AWAITING_DESTINATION' : item.status;
  if (item.intake.exceptions?.length) return 'EXCEPTION';
  if (item.intake.shipment?.status === 'EXCEPTION') return 'EXCEPTION';
  if (item.intake.deliveryMethod === 'IN_PERSON' && !item.intake.receipt)
    return 'AWAITING_DROP_OFF';
  if (item.intake.shipment?.status === 'DELIVERED' && !item.intake.receipt)
    return 'DELIVERED_AWAITING_RECEIPT';
  if (
    item.intake.shipment &&
    ['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(
      item.intake.shipment.status,
    )
  )
    return 'IN_TRANSIT';
  if (item.intake.verification?.status === 'VERIFIED') return 'VERIFIED';
  if (item.intake.status === 'COMPLETE') return 'VAULT_READY';
  if (item.intake.status === 'RECEIVED') return 'RECEIVED';
  if (item.intake.status === 'VERIFICATION') return 'VERIFICATION';
  if (['SHIPPING_REQUIRED', 'VAULT_SELECTED'].includes(item.intake.status))
    return 'AWAITING_SHIPMENT';
  return item.intake.status;
}

export type IntakeNextActor = 'COLLECTOR' | 'STAFF' | 'SYSTEM' | 'NONE';
export type IntakeNextAction = {
  label: string;
  actor: IntakeNextActor;
  needsStaffAction: boolean;
};

/** One operator-facing authority for row action, actor, and staff-attention state. */
export function intakeNextAction(
  item: IntakeState & { stage: string },
): IntakeNextAction {
  // Destination selection is deliberately collector-owned. Admin staff approve and
  // manage the destination catalogue, but must not select a shipping destination
  // on a collector's behalf through this operational queue.
  if (!item.intake)
    return {
      label: 'Await collector destination',
      actor: 'COLLECTOR',
      needsStaffAction: false,
    };
  if (
    item.intake.exceptions?.length ||
    item.intake.shipment?.status === 'EXCEPTION'
  )
    return {
      label: 'Resolve exception',
      actor: 'STAFF',
      needsStaffAction: true,
    };
  if (item.intake.deliveryMethod === 'IN_PERSON' && !item.intake.receipt)
    return {
      label: 'Confirm in-person receipt',
      actor: 'STAFF',
      needsStaffAction: true,
    };
  if (!item.intake.shipment)
    return {
      label: 'Await collector shipment',
      actor: 'COLLECTOR',
      needsStaffAction: false,
    };
  if (item.stage === 'DELIVERED_AWAITING_RECEIPT')
    return {
      label: 'Confirm physical receipt',
      actor: 'STAFF',
      needsStaffAction: true,
    };
  if (item.intake.verification?.status === 'IN_PROGRESS')
    return {
      label: 'Complete verification',
      actor: 'STAFF',
      needsStaffAction: true,
    };
  if (item.intake.receipt && item.intake.verification?.status !== 'VERIFIED')
    return {
      label: 'Begin verification',
      actor: 'STAFF',
      needsStaffAction: true,
    };
  if (item.intake.status === 'COMPLETE')
    return {
      label: 'Ready for custody',
      actor: 'NONE',
      needsStaffAction: false,
    };
  return {
    label: 'Monitor carrier progress',
    actor: 'SYSTEM',
    needsStaffAction: false,
  };
}

export function nextIntakeAction(intake: NonNullable<IntakeState['intake']>) {
  if (intake.exceptions?.length) return 'Resolve intake exception';
  if (intake.deliveryMethod === 'IN_PERSON' && !intake.receipt)
    return 'Await in-person drop-off';
  if (!intake.shipment) return 'Collector needs to add tracking';
  if (intake.shipment.status === 'DELIVERED' && !intake.receipt)
    return 'Staff needs to confirm receipt';
  if (intake.verification?.status === 'IN_PROGRESS')
    return 'Complete verification';
  if (intake.status === 'VERIFICATION') return 'Complete verification';
  if (intake.status === 'RECEIVED') return 'Start verification';
  if (intake.status === 'COMPLETE') return 'No action required';
  return 'Monitor shipment';
}

export function stageLabel(stage: string) {
  return stage
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function intakeCounts(
  items: Array<{ stage: string; needsStaffAction?: boolean }>,
) {
  const oldestAt = items.length
    ? (items
        .map(
          (item) => (item as { currentStageSince?: string }).currentStageSince,
        )
        .filter((value): value is string => Boolean(value))
        .sort()[0] ?? null)
    : null;
  return {
    all: items.length,
    accepted: items.filter((item) => item.stage === 'AWAITING_SHIPMENT').length,
    awaitingDropOff: items.filter((item) => item.stage === 'AWAITING_DROP_OFF')
      .length,
    awaitingDestination: items.filter(
      (item) => item.stage === 'AWAITING_DESTINATION',
    ).length,
    shipped: items.filter((item) =>
      ['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(item.stage),
    ).length,
    delivered: items.filter(
      (item) => item.stage === 'DELIVERED_AWAITING_RECEIPT',
    ).length,
    received: items.filter((item) => item.stage === 'RECEIVED').length,
    verification: items.filter((item) => item.stage === 'VERIFICATION').length,
    verified: items.filter((item) => item.stage === 'VERIFIED').length,
    readyForVault: items.filter((item) => item.stage === 'VAULT_READY').length,
    exceptions: items.filter((item) => item.stage === 'EXCEPTION').length,
    needsAction: items.filter((item) => Boolean(item.needsStaffAction)).length,
    oldestAt,
    oldestAtByStage: Object.fromEntries(
      [...new Set(items.map((item) => item.stage))].map((stage) => [
        stage,
        items
          .filter((item) => item.stage === stage)
          .map(
            (item) =>
              (item as { currentStageSince?: string }).currentStageSince,
          )
          .filter((value): value is string => Boolean(value))
          .sort()[0] ?? null,
      ]),
    ),
  };
}

export function intakeStageReason(item: IntakeState) {
  if (!item.intake)
    return item.status === 'APPROVED'
      ? 'Waiting for the collector to select an authorised destination before shipping can begin'
      : 'Submission not accepted';
  if (item.intake.exceptions?.length)
    return 'Exception blocks normal intake progress';
  if (item.intake.shipment?.status === 'EXCEPTION')
    return 'Carrier exception requires review';
  if (item.intake.deliveryMethod === 'IN_PERSON' && !item.intake.receipt)
    return 'Waiting for collector in-person drop-off at the approved location';
  if (item.intake.shipment?.status === 'DELIVERED' && !item.intake.receipt)
    return 'Delivered by carrier · awaiting Slice receipt';
  if (!item.intake.shipment)
    return 'Waiting for collector shipment · tracking not provided';
  if (
    item.intake.verification?.status === 'IN_PROGRESS' ||
    item.intake.status === 'VERIFICATION'
  )
    return 'Verification in progress';
  if (
    item.intake.verification?.status === 'VERIFIED' ||
    item.intake.status === 'COMPLETE'
  )
    return 'Ready for downstream processing';
  if (item.intake.receipt)
    return 'Physical receipt confirmed · verification required';
  return 'Shipment is in transit';
}

export function intakeIssues(item: {
  stage: string;
  intake: {
    deliveryMethod?: 'SHIPMENT' | 'IN_PERSON';
    shipment: { status: string } | null;
    receipt: unknown;
    verification?: { status: string } | null;
    exceptions?: Array<{ code: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' }>;
  } | null;
}) {
  const issues: Array<{
    code: string;
    label: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
  }> = [];
  if (!item.intake)
    issues.push({
      code: 'DESTINATION_REQUIRED',
      label: 'No destination',
      severity: 'HIGH',
    });
  else if (
    (item.intake.deliveryMethod ?? 'SHIPMENT') === 'SHIPMENT' &&
    !item.intake.shipment
  )
    issues.push({
      code: 'TRACKING_MISSING',
      label: 'Tracking missing',
      severity: 'MEDIUM',
    });
  if (item.intake?.shipment?.status === 'EXCEPTION')
    issues.push({
      code: 'CARRIER_EXCEPTION',
      label: 'Carrier exception',
      severity: 'HIGH',
    });
  if (item.stage === 'DELIVERED_AWAITING_RECEIPT')
    issues.push({
      code: 'RECEIPT_PENDING',
      label: 'Delivered · receipt pending',
      severity: 'HIGH',
    });
  for (const exception of item.intake?.exceptions ?? [])
    issues.push({
      code: exception.code,
      label: exception.code.replaceAll('_', ' '),
      severity: exception.severity,
    });
  if (item.intake?.verification?.status === 'BLOCKED')
    issues.push({
      code: 'VERIFICATION_BLOCKED',
      label: 'Verification blocked',
      severity: 'HIGH',
    });
  return issues;
}

export function intakeAllowedActions(item: IntakeState & { stage: string }) {
  const next = intakeNextAction(item);
  if (!next.needsStaffAction) return [];
  return (
    (
      {
        'Resolve exception': ['RESOLVE_EXCEPTION'],
        'Confirm in-person receipt': ['CONFIRM_RECEIPT'],
        'Confirm physical receipt': ['CONFIRM_RECEIPT'],
        'Begin verification': ['START_VERIFICATION'],
        'Complete verification': ['COMPLETE_VERIFICATION'],
      } as Record<string, string[]>
    )[next.label] ?? []
  );
}
