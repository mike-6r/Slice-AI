import {
  ConflictException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../database/prisma.service';
import type { Actor } from '../../identity/auth/auth.service';
import { AccountCapabilityService } from '../../identity/access/account-capability.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';
import { ProviderCryptoService } from './provider-crypto.service';
import { PlaidAdapter } from './plaid.adapter';

type BankConnection = {
  id: string;
  institutionName: string | null;
  accountName: string | null;
  accountMask: string | null;
  accountType: string;
  currency: string;
  status: string;
  updatedAt: string;
};

/**
 * Document 018's Link boundary.  Plaid access and Item tokens are encrypted at
 * rest and are deliberately absent from every return type and idempotency body.
 */
@Injectable()
export class PlaidBankLinkService {
  private readonly plaid: PlaidAdapter | null;

  constructor(
    private readonly db: PrismaService,
    private readonly crypto: ProviderCryptoService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Optional() private readonly capabilities?: AccountCapabilityService,
  ) {
    this.plaid =
      config.providerMode === 'local' || config.isBeta
        ? null
        : new PlaidAdapter(config);
  }

  async createLinkToken(actor: Actor) {
    await this.capabilities?.require(actor, 'LINK_BANK');
    const plaid = this.requirePlaid();
    const result = await plaid.createLinkToken({ userId: actor.userId });
    // Link tokens are intentionally short-lived and never persisted/replayed.
    return { linkToken: result.linkToken, expiration: result.expiration };
  }

  async exchangePublicToken(
    actor: Actor,
    publicToken: string,
    requestId: string,
    idempotencyKey: string,
  ): Promise<{ connections: BankConnection[]; replayed: boolean }> {
    await this.capabilities?.require(actor, 'LINK_BANK');
    const identity = {
      actorScope: `user:${actor.userId}`,
      scope: 'plaid.link.exchange',
      key: idempotencyKey,
    };
    const requestHash = this.crypto.hash(`plaid-link-exchange:${publicToken}`);
    const acquired = await this.db.$transaction(async (db) =>
      createIdentityTransaction(db).idempotency.acquire(
        identity,
        requestHash,
        new Date(Date.now() + 86_400_000),
      ),
    );
    if (acquired.state === 'FINGERPRINT_CONFLICT') {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_CONFLICT',
        message: 'The request key cannot be reused for this operation.',
      });
    }
    if (acquired.state === 'EXISTING_IN_PROGRESS') {
      throw new ConflictException({
        code: 'PERSISTENCE_CONFLICT',
        message: 'The bank connection is already being processed.',
      });
    }
    if (acquired.state === 'EXISTING_COMPLETED') {
      return {
        connections: acquired.record.response!.body
          .connections as BankConnection[],
        replayed: true,
      };
    }

    try {
      const plaid = this.requirePlaid();
      // The public token is only handled in memory and is never written to DB.
      const exchanged = await plaid.exchangePublicToken(publicToken);
      const accounts = await plaid.listAccounts(exchanged.accessToken);
      const connections = await this.db.$transaction(async (db) => {
        const itemContext = `plaid-item:${actor.userId}`;
        const itemHash = this.crypto.hash(exchanged.itemId);
        const encryptedItem = this.crypto.encrypt(
          exchanged.itemId,
          itemContext,
        );
        const encryptedAccessToken = this.crypto.encrypt(
          exchanged.accessToken,
          itemContext,
        );
        const accessTokenHash = this.crypto.hash(exchanged.accessToken);
        const result: BankConnection[] = [];
        for (const account of accounts) {
          const accountHash = this.crypto.hash(account.accountId);
          const context = `plaid-account:${actor.userId}:${accountHash}`;
          const row = await db.externalFinancialAccount.upsert({
            where: {
              provider_providerReferenceHash: {
                provider: 'PLAID',
                providerReferenceHash: accountHash,
              },
            },
            create: {
              id: randomUUID(),
              userId: actor.userId,
              provider: 'PLAID',
              providerReferenceCiphertext: this.crypto.encrypt(
                account.accountId,
                context,
              ),
              providerReferenceHash: accountHash,
              encryptionKeyVersion: this.crypto.keyVersion,
              itemReferenceCiphertext: encryptedItem,
              itemReferenceHash: itemHash,
              accessTokenCiphertext: encryptedAccessToken,
              accessTokenHash,
              institutionName: account.institutionName,
              accountName: account.name,
              accountMask: account.mask,
              currency: 'GBP',
              accountType: account.type,
              status: 'CONNECTED',
            },
            update: {
              itemReferenceCiphertext: encryptedItem,
              itemReferenceHash: itemHash,
              accessTokenCiphertext: encryptedAccessToken,
              accessTokenHash,
              institutionName: account.institutionName,
              accountName: account.name,
              accountMask: account.mask,
              accountType: account.type,
              status: 'CONNECTED',
              encryptionKeyVersion: this.crypto.keyVersion,
            },
          });
          result.push(this.safe(row));
        }
        await createIdentityTransaction(db).audit.append({
          id: randomUUID(),
          actorUserId: actor.userId,
          actorType: 'USER',
          action: 'PLAID_BANK_CONNECTED',
          resourceType: 'external-financial-account',
          resourceId: null,
          requestId,
          sessionId: actor.sessionId as never,
          result: 'SUCCESS',
          metadata: { provider: 'PLAID', accountCount: result.length },
          createdAt: new Date(),
        });
        await createIdentityTransaction(db).idempotency.complete(
          identity,
          { status: 200, body: { connections: result } },
          new Date(),
        );
        return result;
      });
      return { connections, replayed: false };
    } catch (error) {
      // A failed provider exchange must be retryable with the same idempotency key.
      await this.db.idempotencyRecord
        .deleteMany({
          where: { ...identity, requestHash, status: 'PROCESSING' },
        })
        .catch(() => undefined);
      throw error;
    }
  }

  async list(userId: string): Promise<{ items: BankConnection[] }> {
    const rows = await this.db.externalFinancialAccount.findMany({
      where: { userId, provider: 'PLAID' },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
    return { items: rows.map((row) => this.safe(row)) };
  }

  private requirePlaid(): PlaidAdapter {
    if (!this.plaid) {
      throw new ServiceUnavailableException({
        code: 'PLAID_LINK_UNAVAILABLE',
        message: 'Bank connection is unavailable in the current provider mode.',
      });
    }
    return this.plaid;
  }

  private safe(row: {
    id: string;
    institutionName: string | null;
    accountName: string | null;
    accountMask: string | null;
    accountType: string;
    currency: string;
    status: string;
    updatedAt: Date;
  }): BankConnection {
    return {
      id: row.id,
      institutionName: row.institutionName,
      accountName: row.accountName,
      accountMask: row.accountMask,
      accountType: row.accountType,
      currency: row.currency,
      status: row.status,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
