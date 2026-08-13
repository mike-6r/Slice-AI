import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import type { Actor } from '../../identity/auth/auth.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';
import { ProviderCryptoService } from './provider-crypto.service';
import { LocalIdentityVerificationAdapter } from './local-provider.adapters';
import type { NormalizedComplianceStatus } from '../domain/provider.types';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { PlaidAdapter } from './plaid.adapter';

@Injectable()
export class ComplianceService {
  private readonly identity: LocalIdentityVerificationAdapter | PlaidAdapter;
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: ProviderCryptoService,
    @Inject(APP_CONFIG)
    private readonly config: AppConfig = { providerMode: 'local' } as AppConfig,
  ) {
    this.identity =
      config.providerMode === 'local'
        ? new LocalIdentityVerificationAdapter()
        : new PlaidAdapter(config);
  }
  async start(actor: Actor, requestId: string) {
    const existing = await this.db.complianceCase.findUnique({
      where: {
        userId_provider_type: {
          userId: actor.userId,
          provider: this.provider(),
          type: 'KYC',
        },
      },
      select: { status: true, providerReferenceCiphertext: true },
    });
    if (existing?.status === 'APPROVED') {
      return {
        status: customerStatus(existing.status),
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
      if (current && current.status !== existing.status) {
        await this.persistDecision({
          userId: actor.userId,
          status: current.status,
          reasonCode: 'PLAID_STATUS_REFRESH',
          providerEventId: `start-refresh:${reference}:${current.status}`,
          requestId,
          actorUserId: null,
          sessionId: null,
        });
      }
      return {
        status: customerStatus(current?.status ?? existing.status),
        provider: this.provider(),
        sessionUrl: current?.sessionUrl ?? null,
      };
    }
    const session = await this.identity.createSession({
      userId: actor.userId,
      requestId,
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
          providerReferenceCiphertext: this.crypto.encrypt(
            session.providerReference,
            `compliance:${actor.userId}`,
          ),
          providerReferenceHash: referenceHash,
          encryptionKeyVersion: this.crypto.keyVersion,
        },
        update: {
          status: session.status,
          providerReferenceCiphertext: this.crypto.encrypt(
            session.providerReference,
            `compliance:${actor.userId}`,
          ),
          providerReferenceHash: referenceHash,
          encryptionKeyVersion: this.crypto.keyVersion,
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
        provider: this.provider(),
        sessionUrl: session.sessionUrl,
      };
    });
  }
  async self(userId: string) {
    const item = await this.db.complianceCase.findUnique({
      where: {
        userId_provider_type: {
          userId,
          provider: this.provider(),
          type: 'KYC',
        },
      },
      select: { status: true, expiresAt: true, updatedAt: true },
    });
    return {
      status: customerStatus(item?.status ?? 'NOT_STARTED'),
      expiresAt: item?.expiresAt?.toISOString() ?? null,
      updatedAt: item?.updatedAt.toISOString() ?? null,
    };
  }
  async requireApproved(
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
  async refreshPlaidDecision(
    userId: string,
    verificationId: string,
    providerEventId: string,
    requestId: string,
  ) {
    if (!(this.identity instanceof PlaidAdapter))
      throw new ConflictException({
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Plaid compliance is not configured.',
      });
    const current = await this.identity.getIdentityVerification(verificationId);
    return this.persistDecision({
      userId,
      status: current.status,
      reasonCode: 'PLAID_STATUS_REFRESH',
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
    return this.config.providerMode === 'local'
      ? ('LOCAL_TEST' as const)
      : ('PLAID' as const);
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
