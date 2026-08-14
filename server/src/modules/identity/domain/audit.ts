const sensitive =
  /password|token|authorization|cookie|secret|apikey|privatekey|seedphrase/i;
const sensitiveValue =
  /password|token|authorization|cookie|secret|apikey|privatekey|seedphrase|hash|database(?:_|\s)?url|postgres(?:ql)?:\/\/|redis(?:s)?:\/\//i;

const metadataKeys: Record<string, readonly string[]> = {
  ACCOUNT_STATUS_CHANGED: ['fromStatus', 'toStatus', 'reasonCode'],
  ROLE_GRANTED: ['role', 'scopeType', 'scopeId', 'assignmentId'],
  ROLE_REVOKED: ['role', 'scopeType', 'scopeId', 'assignmentId'],
  AUTH_PROFILE_UPDATED: ['changedFields'],
  ACCOUNT_PREFERENCES_UPDATED: ['changedFields'],
  DATA_EXPORT_REQUESTED: [],
  ACCOUNT_DEACTIVATED: ['reasonCode'],
  ACCOUNT_DELETION_REQUESTED: ['status', 'blockedReasonCode'],
  ACCOUNT_DELETION_CANCELLED: [],
  PHONE_VERIFICATION_SENT: ['phoneLastFour'],
  PHONE_VERIFICATION_RESENT: ['phoneLastFour'],
  PHONE_VERIFIED: ['phoneLastFour'],
  PHONE_CHANGED: ['phoneLastFour'],
  CONSENT_ACCEPTED: ['consentTypes', 'termsVersion', 'privacyVersion'],
  AUTH_PASSWORD_CHANGED: ['revokedOtherSessionCount'],
  SESSION_REVOKED: ['currentSession'],
  OTHER_SESSIONS_REVOKED: ['revokedSessionCount'],
  ADMIN_BOOTSTRAPPED: ['operator'],
  ACCESS_DENIED: ['permission', 'reasonCode', 'targetUserId'],
  CATALOGUE_CATEGORY_CREATED: ['slug', 'status'],
  CATALOGUE_CATEGORY_UPDATED: ['changedFields', 'fromStatus', 'toStatus'],
  CATALOGUE_SET_CREATED: ['slug', 'categoryId', 'status'],
  CATALOGUE_SET_UPDATED: ['changedFields', 'fromStatus', 'toStatus'],
  CATALOGUE_GRADING_COMPANY_CREATED: ['code', 'status'],
  CATALOGUE_GRADING_COMPANY_UPDATED: [
    'changedFields',
    'fromStatus',
    'toStatus',
  ],
  CATALOGUE_GRADE_CREATED: ['companyId', 'grade', 'active'],
  CATALOGUE_GRADE_UPDATED: ['changedFields', 'active'],
  CATALOGUE_ASSET_CREATED: ['publicId', 'slug', 'status'],
  CATALOGUE_ASSET_UPDATED: ['changedFields', 'fromStatus', 'toStatus'],
  'WATCHLIST.ADD': ['assetId'],
  'WATCHLIST.REMOVE': ['assetId'],
  'NOTIFICATION.READ': ['notificationId'],
  'NOTIFICATION.READ-ALL': ['affectedCount'],
  SUBMISSION_DRAFT_CREATED: ['version'],
  SUBMISSION_DRAFT_UPDATED: ['version', 'marketResearchId'],
  SUBMISSION_MEDIA_INTENT_CREATED: ['submissionId', 'slot'],
  SUBMISSION_MEDIA_COMPLETED: ['submissionId', 'slot', 'status'],
  SUBMISSION_MEDIA_DELETED: ['submissionId', 'slot'],
  SUBMISSION_SUBMITTED: ['version'],
  SUBMISSION_CANCELLED: ['version'],
  SUBMISSION_REVIEW_CLAIMED: ['reviewId'],
  SUBMISSION_CHANGES_REQUESTED: ['reviewId', 'reasonCode', 'requestedItems', 'version'],
  SUBMISSION_APPROVED: ['reviewId', 'reasonCode', 'requestedItems', 'version'],
  SUBMISSION_APPROVED_ASSET_LINKED: ['assetId', 'ownerUserId'],
  SUBMISSION_REJECTED: ['reviewId', 'reasonCode', 'requestedItems', 'version'],
  VALUATION_EVIDENCE_RECORDED: ['assetId', 'sourceType', 'currency'],
  VALUATION_DECIDED: ['assetId', 'currency', 'confidence', 'methodologyCode'],
  CUSTODY_STATUS_CHANGED: ['assetId', 'fromStatus', 'toStatus'],
  INSURANCE_COVERAGE_RECORDED: ['assetId', 'status', 'currency'],
  ASSET_PUBLICATION_READINESS_EVALUATED: ['assetId', 'status'],
  ASSET_PUBLISHED: ['assetId', 'version'],
  ASSET_UNPUBLISHED: ['assetId', 'version'],
  OWNERSHIP_ISSUED: ['assetId', 'totalUnits', 'sequence'],
  OWNERSHIP_TRANSFERRED: ['assetId', 'units', 'sequence'],
  OWNERSHIP_RESERVED: ['assetId', 'units', 'reservationId', 'sequence'],
  OWNERSHIP_RESERVATION_RELEASED: ['assetId', 'reservationId', 'sequence'],
  OWNERSHIP_CORRECTED: ['assetId', 'units', 'reasonCode', 'sequence'],
  OWNERSHIP_RECONCILED: ['assetId', 'status', 'mismatchCodes'],
  FINANCE_JOURNAL_POSTED: ['transactionId', 'type'],
  FINANCE_CASH_RESERVED: ['reservationId', 'amountMinor'],
  FINANCE_CASH_RELEASED: ['reservationId', 'amountMinor'],
  FINANCE_LOT_ACQUIRED: ['lotId', 'assetId', 'units'],
  FINANCE_LOT_DISPOSED: ['assetId', 'units', 'costBasisMinor'],
  FINANCE_JOURNAL_REVERSED: ['transactionId', 'reversalId', 'reasonCode'],
  FINANCE_RECONCILED: ['reconciliationId', 'status', 'mismatchCodes'],
  TRADING_ORDER_OPENED: ['assetId', 'side', 'units', 'limitPriceMinor'],
  TRADING_ORDER_CANCELLED: ['assetId'],
  TRADING_ORDER_EXPIRED: ['assetId'],
  TRADING_EXECUTION_SETTLED: [
    'assetId',
    'units',
    'priceMinor',
    'marketSequence',
  ],
  TRADING_MARKET_STATUS_CHANGED: ['assetId', 'fromStatus', 'toStatus'],
  COMMUNITY_COLLECTOR_FOLLOWED: [],
  COMMUNITY_POST_CREATED: ['assetId'],
  COMMUNITY_POST_EDITED: [],
  COMMUNITY_POST_REMOVED: [],
  COMMUNITY_CONTENT_REPORTED: ['postId'],
  COMMUNITY_CONTENT_MODERATED: ['action', 'postId'],
  COMMUNITY_REPORT_REVIEWED: ['status'],
  GOVERNANCE_PROPOSAL_CREATED: ['assetId'],
  GOVERNANCE_PROPOSAL_OPENED: ['eligibleUnits'],
  GOVERNANCE_VOTE_CAST: ['choice'],
  GOVERNANCE_PROPOSAL_CLOSED: ['approve', 'reject', 'quorumMet'],
  GOVERNANCE_EXTERNAL_SALE_VERIFIED: ['grossMinor'],
  DISTRIBUTION_PREPARED: ['netMinor'],
  DISTRIBUTION_POSTED: ['netMinor'],
  COMPLIANCE_SESSION_STARTED: ['provider'],
  PLAID_BANK_CONNECTED: ['provider', 'accountCount'],
  COMPLIANCE_DECISION_RECORDED: ['status', 'reasonCode'],
  WALLET_MOVEMENT_CREATED: ['type', 'amountMinor'],
  WALLET_MOVEMENT_UPDATED: ['status', 'reasonCode'],
  PROVIDER_WEBHOOK_ACCEPTED: ['provider', 'eventType'],
  PROVIDER_RECONCILED: ['provider', 'status', 'mismatchCodes'],
  COMPLIANCE_HOLD_CREATED: ['scope', 'reasonCode'],
  OUTBOX_EVENT_REQUEUED: ['eventId', 'previousStatus', 'resultingStatus'],
  NOTIFICATION_DELIVERY_REQUEUED: [
    'deliveryId',
    'previousStatus',
    'resultingStatus',
  ],
};

/** Enforces action-specific metadata before it reaches durable audit storage. */
export function sanitizeAuditMetadata(
  action: string,
  metadata: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (metadata === null) return null;
  const allowed = metadataKeys[action];
  if (!allowed || !isPlainObject(metadata)) {
    throw new Error('AUDIT_METADATA_NOT_PERMITTED');
  }
  for (const [key, value] of Object.entries(metadata)) {
    if (
      !allowed.includes(key) ||
      sensitive.test(key) ||
      containsSensitive(value)
    ) {
      throw new Error('AUDIT_METADATA_NOT_PERMITTED');
    }
  }
  return structuredClone(metadata);
}
export function redactAuditMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAuditMetadata);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sensitive.test(key) ? '[REDACTED]' : redactAuditMetadata(item),
      ]),
    );
  return value;
}
export function createAuditEvent(input: {
  actorId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  requestId?: string;
  sessionId?: string;
  result: 'SUCCESS' | 'FAILURE';
  metadata?: unknown;
  at: Date;
}) {
  return {
    ...input,
    metadata: sanitizeAuditMetadata(
      input.action,
      (input.metadata as Record<string, unknown> | null | undefined) ?? null,
    ),
    appendOnly: true,
  };
}

function containsSensitive(value: unknown): boolean {
  if (typeof value === 'string') return sensitiveValue.test(value);
  if (Array.isArray(value)) return value.some(containsSensitive);
  if (isPlainObject(value)) {
    return Object.entries(value).some(
      ([key, child]) => sensitive.test(key) || containsSensitive(child),
    );
  }
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
