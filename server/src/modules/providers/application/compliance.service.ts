import { ConflictException, Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import type { Actor } from '../../identity/auth/auth.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';
import { ProviderCryptoService } from './provider-crypto.service';
import { LocalIdentityVerificationAdapter } from './local-provider.adapters';
import type { IdentityVerificationProvider, IdentityVerificationState, NormalizedComplianceStatus } from '../domain/provider.types';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import {
  UnavailableExternalIdentityProvider,
  providerCode,
} from './external-provider-boundaries';
import { StripeIdentityVerificationService, mapIdentityStatus, safeFailureCode } from './stripe-identity.service';

@Injectable()
export class ComplianceService {
  private readonly identity: IdentityVerificationProvider;
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: ProviderCryptoService,
    @Inject(APP_CONFIG)
    private readonly config: AppConfig = { providerMode: 'local' } as AppConfig,
    @Optional() private readonly stripeIdentity?: StripeIdentityVerificationService,
  ) {
    this.identity =
      config.providerMode === 'local'
        ? new LocalIdentityVerificationAdapter()
        : stripeIdentity ?? new UnavailableExternalIdentityProvider(providerCode(config.providerMode));
  }
  async start(actor: Actor, requestId: string) {
    if (this.config.isBeta) {
      return {
        status: 'NOT_STARTED' as const,
        identityState: 'NOT_STARTED' as const,
        provider: providerCode(this.config.providerMode),
        sessionUrl: null,
        capability: 'NOT_REQUIRED_IN_CURRENT_BETA' as const,
      };
    }
    const existing = await this.db.complianceCase.findUnique({
      where: {
        userId_provider_type: {
          userId: actor.userId,
          provider: this.provider(),
          type: 'KYC',
        },
      },
      select: { status: true, identityState: true, identityCompletedAt: true, providerReferenceCiphertext: true },
    });
    if (existing?.status === 'APPROVED') {
      return {
        status: customerStatus(existing.status),
        identityState: existing.identityState as IdentityVerificationState,
        provider: this.provider(),
        sessionUrl: null,
      };
    }
    if (
      (existing?.status === 'PENDING' || existing?.status === 'REVIEW') &&
      existing.providerReferenceCiphertext
    ) {
      const reference = this.crypto.decrypt(
        existing.providerReferenceCiphertext,
        `compliance:${actor.userId}`,
      );
      const current = await this.identity.getIdentityVerification?.(reference);
      const nextIdentityState = current?.identityState ?? legacyIdentityState(current?.status ?? existing.status);
      if (current && (current.status !== existing.status || nextIdentityState !== existing.identityState)) {
        await this.ingestIdentityProviderEvent({
          provider: this.provider(),
          providerReference: reference,
          providerStatus: current.status,
          identityState: nextIdentityState,
          failureCode: current.safeFailureCode ?? null,
          providerEventId: `start-refresh:${reference}:${current.status}:${nextIdentityState}`,
          occurredAt: new Date(),
          requestId,
        });
      }
      return {
        status: customerStatus(current?.status ?? existing.status),
        identityState: nextIdentityState ?? existing.identityState ?? legacyIdentityState(existing.status),
        provider: this.provider(),
        sessionUrl: current?.sessionUrl ?? null,
      };
    }
    const session = await this.identity.createSession({
      userId: actor.userId,
      requestId,
      idempotencyKey: `slice-identity-attempt:${this.provider()}:${actor.userId}:${existing?.identityCompletedAt?.toISOString() ?? 'initial'}`,
    });
    return this.db.$transaction(async (db) => {
      const referenceHash = this.crypto.hash(session.providerReference);
      const item = await db.complianceCase.upsert({
        where: {
          userId_provider_type: {
            userId: actor.userId,
            provider: this.provider(),
            type: 'KYC',
          },
        },
        create: {
          id: randomUUID(),
          userId: actor.userId,
          provider: this.provider(),
          type: 'KYC',
          status: session.status,
          identityState: session.identityState ?? legacyIdentityState(session.status),
          providerReferenceCiphertext: this.crypto.encrypt(
            session.providerReference,
            `compliance:${actor.userId}`,
          ),
          providerReferenceHash: referenceHash,
          encryptionKeyVersion: this.crypto.keyVersion,
          identityRequestedAt: new Date(),
          identityLastProviderSync: new Date(),
        },
        update: {
          status: session.status,
          providerReferenceCiphertext: this.crypto.encrypt(
            session.providerReference,
            `compliance:${actor.userId}`,
          ),
          providerReferenceHash: referenceHash,
          encryptionKeyVersion: this.crypto.keyVersion,
          identityState: session.identityState ?? legacyIdentityState(session.status),
          identityRequestedAt: new Date(),
          identityCompletedAt: session.identityState && ['VERIFIED', 'FAILED', 'CANCELED'].includes(session.identityState) ? new Date() : null,
          identityVerifiedAt: session.identityState === 'VERIFIED' ? new Date() : null,
          identitySafeFailureCode: null,
          identityLastProviderSync: new Date(),
        },
      });
      await db.complianceDecision.create({
        data: {
          id: randomUUID(),
          caseId: item.id,
          status: session.status,
          reasonCode: 'SESSION_CREATED',
          actorUserId: actor.userId,
        },
      });
      await createIdentityTransaction(db).audit.append({
        id: randomUUID(),
        actorUserId: actor.userId,
        actorType: 'USER',
        action: 'COMPLIANCE_SESSION_STARTED',
        resourceType: 'compliance-case',
        resourceId: item.id,
        requestId,
        sessionId: actor.sessionId as never,
        result: 'SUCCESS',
        metadata: { provider: this.provider() },
        createdAt: new Date(),
      });
      return {
        status: customerStatus(item.status),
        identityState: session.identityState ?? legacyIdentityState(item.status),
        provider: this.provider(),
        sessionUrl: session.sessionUrl,
      };
    });
  }
  async self(userId: string) {
    if (this.config.isBeta) {
      return {
        status: 'NOT_STARTED' as const,
        identityState: 'NOT_STARTED' as const,
        expiresAt: null,
        updatedAt: null,
        capability: 'NOT_REQUIRED_IN_CURRENT_BETA' as const,
      };
    }
    const item = await this.db.complianceCase.findUnique({
      where: {
        userId_provider_type: {
          userId,
          provider: this.provider(),
          type: 'KYC',
        },
      },
      select: { status: true, identityState: true, expiresAt: true, updatedAt: true },
    });
    return {
      status: customerStatus(item?.status ?? 'NOT_STARTED'),
      identityState: (item?.identityState as IdentityVerificationState | undefined) ?? legacyIdentityState(item?.status ?? 'NOT_STARTED'),
      provider: this.provider(),
      expiresAt: item?.expiresAt?.toISOString() ?? null,
      updatedAt: item?.updatedAt.toISOString() ?? null,
    };
  }
  /**
   * Identity approval is an input to the current product gate only. It is not
   * an AML-cleared, sanctions-cleared, investment-eligible, or jurisdiction
   * decision; those domains remain undefined until separately authorized.
   */
  async requireIdentityApproved(
    userId: string,
    scopes: string[] = ['EXTERNAL_MOVEMENT', 'ACCOUNT'],
  ) {
    const [caseRecord, hold] = await Promise.all([
      this.db.complianceCase.findUnique({
        where: {
          userId_provider_type: {
            userId,
            provider: this.provider(),
            type: 'KYC',
          },
        },
      }),
      this.db.complianceHold.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
          scope: { in: [...scopes, 'EXTERNAL_MOVEMENT', 'ACCOUNT'] },
        },
      }),
    ]);
    if (hold)
      throw new ConflictException({
        code: 'COMPLIANCE_REQUIRED',
        message: 'External financial operations are temporarily unavailable.',
      });
    if (caseRecord?.status !== 'APPROVED')
      throw new ConflictException({
        code:
          caseRecord?.status === 'PENDING' || caseRecord?.status === 'REVIEW'
            ? 'COMPLIANCE_PENDING'
            : 'COMPLIANCE_REQUIRED',
        message: 'Approved compliance is required.',
      });
  }
  /** Backwards-compatible name for existing callers; this is identity-only. */
  async requireApproved(userId: string, scopes: string[] = ['EXTERNAL_MOVEMENT', 'ACCOUNT']) {
    return this.requireIdentityApproved(userId, scopes);
  }
  async ingestDecision(
    actor: Actor,
    userId: string,
    status: NormalizedComplianceStatus,
    reasonCode: string,
    providerEventId: string,
    requestId: string,
  ) {
    return this.persistDecision({
      userId,
      status,
      reasonCode,
      providerEventId,
      requestId,
      actorUserId: actor.userId,
      sessionId: actor.sessionId,
    });
  }

  async ingestIdentityProviderEvent(input: {
    provider: ReturnType<typeof providerCode>;
    providerReference: string;
    providerStatus: string;
    identityState?: IdentityVerificationState;
    failureCode?: string | null;
    providerEventId: string;
    occurredAt: Date;
    requestId: string;
  }) {
    if (input.provider !== this.provider()) return { ignored: true, reason: 'PROVIDER_MISMATCH' };
    const item = await this.db.complianceCase.findUnique({
      where: { provider_providerReferenceHash: { provider: input.provider, providerReferenceHash: this.crypto.hash(input.providerReference) } },
      select: { id: true, userId: true, status: true, identityState: true, identityLastProviderSync: true },
    });
    if (!item) return { ignored: true, reason: 'SESSION_UNKNOWN' };
    const mapped = mapIdentityStatus(input.providerStatus);
    const effective = input.identityState ? { ...mapped, identityState: input.identityState } : mapped;
    if (item.identityState === 'VERIFIED' && effective.identityState !== 'VERIFIED') return { ignored: true, stale: true };
    if (item.identityLastProviderSync && item.identityLastProviderSync > input.occurredAt) return { ignored: true, stale: true };
    const safeCode = safeFailureCode(input.failureCode);
    return this.db.$transaction(async (db) => {
      const hash = this.crypto.hash(input.providerEventId);
      const duplicate = await db.complianceDecision.findFirst({ where: { caseId: item.id, providerEventIdHash: hash } });
      if (duplicate) return { ignored: false, replayed: true, status: effective.identityState };
      const terminal = ['VERIFIED', 'FAILED', 'CANCELED'].includes(effective.identityState);
      await db.complianceCase.update({
        where: { id: item.id },
        data: {
          status: mapped.complianceStatus,
          identityState: effective.identityState,
          identityCompletedAt: terminal ? input.occurredAt : null,
          identityVerifiedAt: effective.identityState === 'VERIFIED' ? input.occurredAt : null,
          identitySafeFailureCode: safeCode,
          identityLastProviderSync: input.occurredAt,
        },
      });
      await db.complianceDecision.create({ data: { id: randomUUID(), caseId: item.id, status: mapped.complianceStatus, reasonCode: safeCode ? `STRIPE_IDENTITY_${safeCode}` : `STRIPE_IDENTITY_${effective.identityState}`, providerEventIdHash: hash, actorUserId: null } });
      await createIdentityTransaction(db).audit.append({ id: randomUUID(), actorUserId: null, actorType: 'SYSTEM', action: 'IDENTITY_VERIFICATION_UPDATED', resourceType: 'compliance-case', resourceId: item.id, requestId: input.requestId, sessionId: null, result: 'SUCCESS', metadata: { source: 'PROVIDER', provider: input.provider, identityState: effective.identityState }, createdAt: new Date() });
      return { ignored: false, replayed: false, status: effective.identityState };
    });
  }
  /** Verified provider callbacks are system actions, never impersonated users. */
  async ingestProviderDecision(
    userId: string,
    status: NormalizedComplianceStatus,
    reasonCode: string,
    providerEventId: string,
    requestId: string,
  ) {
    return this.persistDecision({
      userId,
      status,
      reasonCode,
      providerEventId,
      requestId,
      actorUserId: null,
      sessionId: null,
    });
  }
  private async persistDecision(input: {
    userId: string;
    status: NormalizedComplianceStatus;
    reasonCode: string;
    providerEventId: string;
    requestId: string;
    actorUserId: string | null;
    sessionId: string | null;
  }) {
    return this.db.$transaction(async (db) => {
      const item = await db.complianceCase.findUniqueOrThrow({
        where: {
          userId_provider_type: {
            userId: input.userId,
            provider: this.provider(),
            type: 'KYC',
          },
        },
      });
      const hash = this.crypto.hash(input.providerEventId);
      const duplicate = await db.complianceDecision.findFirst({
        where: { caseId: item.id, providerEventIdHash: hash },
      });
      if (duplicate) return { status: item.status, replayed: true };
      await db.complianceCase.update({
        where: { id: item.id },
        data: { status: input.status },
      });
      await db.complianceDecision.create({
        data: {
          id: randomUUID(),
          caseId: item.id,
          status: input.status,
          reasonCode: input.reasonCode,
          providerEventIdHash: hash,
          actorUserId: input.actorUserId as never,
        },
      });
      await createIdentityTransaction(db).audit.append({
        id: randomUUID(),
        actorUserId: input.actorUserId as never,
        actorType: input.actorUserId ? 'USER' : 'SYSTEM',
        action: 'COMPLIANCE_DECISION_RECORDED',
        resourceType: 'compliance-case',
        resourceId: item.id,
        requestId: input.requestId,
        sessionId: input.sessionId as never,
        result: 'SUCCESS',
        metadata: { status: input.status, reasonCode: input.reasonCode },
        createdAt: new Date(),
      });
      return { status: input.status, replayed: false };
    });
  }
  private provider() {
    return providerCode(this.config.providerMode);
  }
}

function customerStatus(
  status: string,
): 'NOT_STARTED' | 'PENDING' | 'APPROVED' | 'REVIEW' | 'REJECTED' {
  if (status === 'MANUAL_REVIEW') return 'REVIEW';
  if (status === 'EXPIRED') return 'REJECTED';
  if (
    status === 'NOT_STARTED' ||
    status === 'PENDING' ||
    status === 'APPROVED' ||
    status === 'REVIEW' ||
    status === 'REJECTED'
  )
    return status;
  return 'REJECTED';
}

function legacyIdentityState(status: string): IdentityVerificationState {
  if (status === 'APPROVED') return 'VERIFIED';
  if (status === 'REVIEW' || status === 'MANUAL_REVIEW') return 'PROCESSING';
  if (status === 'PENDING') return 'REQUIRES_INPUT';
  if (status === 'REJECTED') return 'FAILED';
  if (status === 'EXPIRED') return 'CANCELED';
  return 'NOT_STARTED';
}
