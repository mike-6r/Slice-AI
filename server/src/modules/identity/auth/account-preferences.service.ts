import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Actor } from './auth.service';
import { AuthAbuseService } from './auth-abuse.service';
import { IdempotencyCoordinator } from './idempotency-coordinator';
import {
  IDENTITY_UNIT_OF_WORK,
  USER_REPOSITORY,
  type IdentityUnitOfWork,
  type UserRepository,
} from '../ports/repositories';

const DEFAULT_TIMEZONE = 'Europe/London';
const DEFAULT_LOCALE = 'en-GB' as const;

export type CustomerPreferencesDto = {
  timezone: string;
  locale: 'en-GB' | 'en-US';
  preferredCurrency: 'GBP' | 'USD' | 'CAD' | 'EUR';
};

@Injectable()
export class AccountPreferencesService {
  constructor(
    @Inject(IDENTITY_UNIT_OF_WORK) private readonly uow: IdentityUnitOfWork,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly idempotency: IdempotencyCoordinator,
    private readonly abuse: AuthAbuseService,
  ) {}

  async get(actor: Actor): Promise<CustomerPreferencesDto> {
    return this.toDto(await this.users.getProfile(actor.userId));
  }

  async update(
    actor: Actor,
    input: Partial<CustomerPreferencesDto>,
    ip: string,
    requestId: string,
    idempotencyKey: string,
  ): Promise<CustomerPreferencesDto> {
    await this.abuse.enforce('preferences', ip, actor.userId);
    const patch = {
      ...(input.timezone
        ? { timezone: normalizeTimezone(input.timezone) }
        : {}),
      ...(input.locale ? { locale: input.locale } : {}),
      ...(input.preferredCurrency
        ? { preferredCurrency: input.preferredCurrency }
        : {}),
    };
    const outcome = await this.idempotency.run(
      {
        actorScope: `user:${actor.userId}`,
        scope: 'account.preferences.update',
        key: idempotencyKey,
      },
      'PATCH',
      '/v1/me/preferences',
      patch,
      async (tx) => {
        const updated = await tx.users.updateProfile(actor.userId, patch);
        const now = new Date();
        await tx.audit.append({
          id: randomUUID(),
          actorUserId: actor.userId,
          actorType: 'USER',
          action: 'ACCOUNT_PREFERENCES_UPDATED',
          resourceType: 'user-preferences',
          resourceId: null,
          requestId,
          sessionId: actor.sessionId as never,
          result: 'SUCCESS',
          metadata: { changedFields: Object.keys(patch) },
          createdAt: now,
        });
        return this.toDto(updated.profile);
      },
    );
    return outcome.value;
  }

  private toDto(
    profile: Awaited<ReturnType<UserRepository['getProfile']>>,
  ): CustomerPreferencesDto {
    return {
      timezone: profile?.timezone ?? DEFAULT_TIMEZONE,
      locale: profile?.locale ?? DEFAULT_LOCALE,
      preferredCurrency: profile?.preferredCurrency ?? 'GBP',
    };
  }
}

function normalizeTimezone(value: string) {
  return Intl.DateTimeFormat('en-GB', { timeZone: value }).resolvedOptions()
    .timeZone;
}
