import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { fingerprintRequest } from '../domain/idempotency';
import {
  IDENTITY_UNIT_OF_WORK,
  type IdempotencyIdentity,
  type IdentityTransaction,
  type IdentityUnitOfWork,
} from '../ports/repositories';

@Injectable()
export class IdempotencyCoordinator {
  constructor(
    @Inject(IDENTITY_UNIT_OF_WORK) private readonly uow: IdentityUnitOfWork,
  ) {}
  async run<T extends Record<string, unknown>>(
    identity: IdempotencyIdentity,
    method: string,
    path: string,
    body: unknown,
    execute: (tx: IdentityTransaction) => Promise<T>,
  ): Promise<{ value: T; replay: boolean }> {
    const hash = fingerprintRequest(method, path, body);
    return this.uow.withinTransaction(async (tx) => {
      const acquired = await tx.idempotency.acquire(
        identity,
        hash,
        new Date(Date.now() + 86_400_000),
      );
      if (acquired.state === 'FINGERPRINT_CONFLICT')
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_CONFLICT',
          message: 'The request key cannot be reused for this operation.',
        });
      if (acquired.state === 'EXISTING_IN_PROGRESS')
        throw new ConflictException({
          code: 'PERSISTENCE_CONFLICT',
          message: 'The request is already in progress. Please retry.',
        });
      if (acquired.state === 'EXISTING_COMPLETED')
        return { value: acquired.record.response!.body as T, replay: true };
      const value = await execute(tx);
      assertSafeDurableResult(value);
      await tx.idempotency.complete(
        identity,
        { status: 200, body: value },
        new Date(),
      );
      return { value, replay: false };
    });
  }

  async hasCompletedReplay(
    identity: IdempotencyIdentity,
    method: string,
    path: string,
    body: unknown,
  ): Promise<boolean> {
    const record = await this.uow.withinTransaction((tx) =>
      tx.idempotency.find(identity),
    );
    return Boolean(
      record &&
      record.status === 'COMPLETED' &&
      record.requestHash === fingerprintRequest(method, path, body),
    );
  }
}

const unsafeReplayField =
  /token|cookie|password|hash|normalizedemail|authorization|metadata/i;

function assertSafeDurableResult(value: Record<string, unknown>): void {
  for (const [key, child] of Object.entries(value)) {
    if (unsafeReplayField.test(key))
      throw new Error(`Unsafe idempotency result field: ${key}`);
    assertSafeValue(child);
  }
}

function assertSafeValue(value: unknown): void {
  if (Array.isArray(value)) {
    for (const child of value) assertSafeValue(child);
    return;
  }
  if (value && typeof value === 'object') {
    assertSafeDurableResult(value as Record<string, unknown>);
  }
}
