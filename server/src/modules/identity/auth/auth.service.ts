import {
  Inject,
  Injectable,
  Optional,
  forwardRef,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { AuthTokenService } from '../security/auth-token.service';
import {
  IDENTITY_UNIT_OF_WORK,
  SESSION_REPOSITORY,
  USER_REPOSITORY,
  ROLE_ASSIGNMENT_REPOSITORY,
  type IdentityUnitOfWork,
  type IdentityTransaction,
  type SessionRepository,
  type UserRepository,
  type RoleAssignmentRepository,
} from '../ports/repositories';
import type {
  IdentitySession,
  IdentityUser,
  UserId,
} from '../domain/identity.types';
import { RepositoryConflict } from '../domain/errors';
import { IdempotencyCoordinator } from './idempotency-coordinator';
import { PASSWORD_HASHER, type PasswordHasher } from '../ports/security.ports';
import {
  TwoFactorService,
  type TwoFactorLoginChallenge,
} from '../two-factor/two-factor.service';
import {
  CAPTCHA_VERIFIER,
  type CaptchaVerifier,
} from '../captcha/captcha-verifier';
import {
  SignupConsentService,
  type SignupConsentInput,
} from './signup-consent.service';
import { EmailVerificationService } from '../email-verification/email-verification.service';
import { TransactionalEmailService } from '../email-delivery/transactional-email.service';

export type AuthResult = {
  user: ReturnType<AuthService['publicUser']>;
  session: { id: string; expiresAt: string };
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
};
export type Actor = {
  userId: UserId;
  sessionId: string;
  status: IdentityUser['accountStatus'];
  roles: string[];
  sessionRevokedAt: Date | null;
  sessionRevocationReason: IdentitySession['revocationReason'];
  authenticatedAt: Date;
};
export type DurableSignupResult = {
  userId: UserId;
  sessionId: string;
  user: ReturnType<AuthService['publicUser']>;
  completedAt: string;
};
export type DurableLogoutAllResult = {
  userId: UserId;
  revokedSessionCount: number;
  completedAt: string;
};
export type DurableProfileUpdateResult = {
  userId: UserId;
  user: ReturnType<AuthService['publicUser']>;
  completedAt: string;
};
export type TransientCredentials = Pick<
  AuthResult,
  'accessToken' | 'expiresIn' | 'refreshToken' | 'session'
>;
export type SessionContext = { userAgent?: string | null };

@Injectable()
export class AuthService {
  private dummyPasswordHash?: string;
  private dummyPasswordHashPromise?: Promise<string>;
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(IDENTITY_UNIT_OF_WORK) private readonly uow: IdentityUnitOfWork,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(ROLE_ASSIGNMENT_REPOSITORY)
    private readonly roles: RoleAssignmentRepository,
    @Inject(PASSWORD_HASHER) private readonly passwords: PasswordHasher,
    private readonly tokens: AuthTokenService,
    private readonly idempotency: IdempotencyCoordinator,
    @Optional() private readonly twoFactor?: TwoFactorService,
    @Optional()
    @Inject(CAPTCHA_VERIFIER)
    private readonly captcha?: CaptchaVerifier,
    @Optional() private readonly signupConsent?: SignupConsentService,
    @Optional()
    @Inject(forwardRef(() => EmailVerificationService))
    private readonly emailVerification?: EmailVerificationService,
    @Optional() private readonly transactionalEmail?: TransactionalEmailService,
  ) {}

  async onModuleInit() {
    await this.getDummyPasswordHash();
  }

  async signup(
    input: {
      email: string;
      password: string;
      displayName: string;
      username?: string;
      captchaToken?: string;
      consent?: SignupConsentInput;
    },
    requestId: string,
    idempotencyKey: string = randomUUID(),
    sessionContext: SessionContext = {},
  ): Promise<AuthResult> {
    const identity = {
      actorScope: `anonymous:${this.hashScope(input.email)}`,
      scope: 'auth.signup',
      key: idempotencyKey,
    };
    // An exact completed replay must mint fresh credentials without asking a
    // customer to solve a deliberately one-time CAPTCHA again.
    if (
      await this.idempotency.hasCompletedReplay(
        identity,
        'POST',
        '/v1/auth/signup',
        input,
      )
    ) {
      const replay = await this.idempotency.run(
        identity,
        'POST',
        '/v1/auth/signup',
        input,
        async () => {
          throw new Error(
            'Completed idempotency replay unexpectedly executed.',
          );
        },
      );
      return this.issueSignupReplayCredentials(
        replay.value,
        requestId,
        sessionContext,
      );
    }
    if (this.config.captcha.enabled) {
      if (!input.captchaToken) {
        throw new BadRequestException({
          code: 'CAPTCHA_VERIFICATION_FAILED',
          message: 'Signup verification could not be completed.',
        });
      }
      if (!this.captcha) {
        throw new BadRequestException({
          code: 'CAPTCHA_UNAVAILABLE',
          message: 'Signup verification is temporarily unavailable.',
        });
      }
      await this.captcha.verify({
        token: input.captchaToken,
        action: 'signup',
      });
    }
    this.signupConsent?.assertValid(input.consent);
    const now = new Date();
    const userId = randomUUID() as UserId;
    const session = this.newSession(
      userId,
      now,
      undefined,
      undefined,
      sessionContext.userAgent,
    );
    const passwordHash = await this.passwords.hash(input.password);
    try {
      const outcome = await this.idempotency.run(
        identity,
        'POST',
        '/v1/auth/signup',
        input,
        (tx) =>
          this.signupDurable(
            tx,
            input,
            requestId,
            now,
            userId,
            passwordHash,
            session.value,
          ),
      );
      if (outcome.replay)
        return this.issueSignupReplayCredentials(
          outcome.value,
          requestId,
          sessionContext,
        );
      void this.emailVerification?.sendForNewAccount({
        userId,
        email: input.email,
        requestId,
      }).catch(() => undefined);
      return {
        user: outcome.value.user,
        ...(await this.transientCredentials(
          userId,
          session.value,
          session.raw,
        )),
      };
    } catch (error) {
      if (
        error instanceof RepositoryConflict &&
        error.code === 'DUPLICATE_USERNAME'
      )
        throw new ConflictException({
          code: 'USERNAME_UNAVAILABLE',
          message: 'That username is unavailable.',
        });
      if (error instanceof RepositoryConflict)
        throw new ConflictException({
          code: 'EMAIL_ALREADY_REGISTERED',
          message: 'Unable to create this account.',
        });
      throw error;
    }
  }

  async login(
    input: { email: string; password: string },
    requestId: string,
    sessionContext: SessionContext = {},
  ): Promise<AuthResult> {
    const user = await this.authenticatePassword(input);
    return this.issueLogin(user, requestId, sessionContext);
  }

  async loginWithTwoFactor(
    input: { email: string; password: string },
    requestId: string,
    sessionContext: SessionContext = {},
    requestIp = 'unknown',
  ): Promise<AuthResult | TwoFactorLoginChallenge> {
    const user = await this.authenticatePassword(input);
    const challenge = await this.twoFactor?.createLoginChallenge(
      user.id,
      requestId,
      requestIp,
    );
    if (challenge) return challenge;
    return this.issueLogin(user, requestId, sessionContext);
  }

  private async authenticatePassword(input: {
    email: string;
    password: string;
  }) {
    const user = await this.users.findByNormalizedEmail(input.email);
    const valid = user
      ? await this.passwords.verify(user.passwordHash, input.password)
      : await this.passwords.verify(
          await this.getDummyPasswordHash(),
          input.password,
        );
    if (!user || !valid || !this.canLogIn(user.accountStatus)) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }
    return user;
  }

  private async issueLogin(
    user: IdentityUser,
    requestId: string,
    sessionContext: SessionContext = {},
  ): Promise<AuthResult> {
    const now = new Date();
    const session = this.newSession(
      user.id,
      now,
      undefined,
      undefined,
      sessionContext.userAgent,
    );
    await this.uow.withinTransaction(async (tx) => {
      await tx.sessions.create(session.value);
      await tx.audit.append(
        this.audit(
          'AUTH_LOGIN_SUCCEEDED',
          user.id,
          session.value.id,
          requestId,
          now,
        ),
      );
    });
    return this.result(user, session.value, session.raw);
  }

  async completeTwoFactorLogin(
    userId: UserId,
    requestId: string,
    sessionContext: SessionContext = {},
  ): Promise<AuthResult> {
    const user = await this.users.findById(userId);
    if (!user || !this.canLogIn(user.accountStatus)) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }
    const now = new Date();
    const session = this.newSession(
      user.id,
      now,
      undefined,
      undefined,
      sessionContext.userAgent,
    );
    await this.uow.withinTransaction(async (tx) => {
      await tx.sessions.create(session.value);
      await tx.audit.append(
        this.audit(
          'AUTH_LOGIN_SUCCEEDED',
          user.id,
          session.value.id,
          requestId,
          now,
        ),
      );
    });
    return this.result(user, session.value, session.raw);
  }

  async refresh(raw: string, requestId: string): Promise<AuthResult> {
    const current = await this.sessions.findByRefreshTokenHash(
      this.tokens.hashRefreshToken(raw),
    );
    if (!current) throw this.invalidRefresh();
    const user = await this.users.findById(current.userId);
    if (!user || !this.canLogIn(user.accountStatus))
      throw this.invalidRefresh();
    const now = new Date();
    if (
      current.revokedAt ||
      current.expiresAt <= now ||
      current.replacedBySessionId
    ) {
      await this.uow.withinTransaction(async (tx) => {
        await tx.sessions.revokeSessionFamily(
          current.familyId,
          'REFRESH_REPLAY',
          now,
        );
        await tx.audit.append(
          this.audit(
            'AUTH_REFRESH_REPLAY',
            current.userId,
            current.id,
            requestId,
            now,
          ),
        );
      });
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_REUSED',
        message: 'Your session is no longer valid.',
      });
    }
    const successor = this.newSession(
      current.userId,
      now,
      current.familyId,
      current.authenticatedAt,
      current.userAgent,
    );
    try {
      await this.uow.withinTransaction(async (tx) => {
        await tx.sessions.rotate(current.id, successor.value, now);
        await tx.audit.append(
          this.audit(
            'AUTH_SESSION_ROTATED',
            current.userId,
            successor.value.id,
            requestId,
            now,
          ),
        );
      });
    } catch {
      throw this.invalidRefresh();
    }
    return this.result(user, successor.value, successor.raw);
  }

  async actor(
    token: string,
    options: {
      allowRevokedSession?: boolean;
      allowRestrictedRevokedSession?: boolean;
    } = {},
  ): Promise<Actor> {
    const claims = await this.tokens.verify(token);
    if (!claims) throw this.invalidAccess();
    const [session, user] = await Promise.all([
      this.sessions.findById(claims.sid as never),
      this.users.findById(claims.sub as never),
    ]);
    if (
      !session ||
      !user ||
      session.userId !== user.id ||
      (session.revokedAt &&
        !options.allowRevokedSession &&
        !(
          options.allowRestrictedRevokedSession &&
          session.revocationReason === 'RESTRICTED' &&
          user.accountStatus === 'RESTRICTED'
        )) ||
      session.expiresAt <= new Date() ||
      (!this.canLogIn(user.accountStatus) &&
        !(
          options.allowRestrictedRevokedSession &&
          user.accountStatus === 'RESTRICTED'
        ))
    )
      throw this.invalidAccess();
    return {
      userId: user.id,
      sessionId: session.id,
      status: user.accountStatus,
      roles: (await this.roles.listForUser(user.id))
        .filter((role) => role.scopeType === 'GLOBAL' && role.scopeId === '*')
        .map((role) => role.role),
      sessionRevokedAt: session.revokedAt,
      sessionRevocationReason: session.revocationReason,
      authenticatedAt: session.authenticatedAt,
    };
  }

  async logoutAllActor(token: string, idempotencyKey: string | undefined) {
    const actor = await this.actor(token, { allowRevokedSession: true });
    if (!actor.sessionRevokedAt) return actor;
    if (!idempotencyKey) throw this.invalidAccess();
    const completedReplay = await this.idempotency.hasCompletedReplay(
      {
        actorScope: `user:${actor.userId}`,
        scope: 'auth.logout-all',
        key: idempotencyKey,
      },
      'POST',
      '/v1/auth/logout-all',
      {},
    );
    if (!completedReplay) throw this.invalidAccess();
    return actor;
  }
  async logout(actor: Actor, requestId: string) {
    const now = new Date();
    await this.uow.withinTransaction(async (tx) => {
      await tx.sessions.revoke(actor.sessionId as never, 'LOGOUT', now);
      await tx.audit.append(
        this.audit(
          'AUTH_LOGOUT',
          actor.userId,
          actor.sessionId as never,
          requestId,
          now,
        ),
      );
    });
  }
  async logoutAll(
    actor: Actor,
    requestId: string,
    idempotencyKey: string = randomUUID(),
  ): Promise<DurableLogoutAllResult> {
    const now = new Date();
    const outcome = await this.idempotency.run(
      {
        actorScope: `user:${actor.userId}`,
        scope: 'auth.logout-all',
        key: idempotencyKey,
      },
      'POST',
      '/v1/auth/logout-all',
      {},
      (tx) => this.logoutAllDurable(tx, actor, requestId, now),
    );
    return outcome.value;
  }
  async me(actor: Actor) {
    const user = await this.users.findById(actor.userId);
    if (!user) throw new ForbiddenException();
    // Role assignments can change after a session was issued (for example the
    // staged collector workspace enablement). Resolve them at projection time
    // so the navigation and workspace guard reflect current authority.
    return this.publicUser(
      user,
      (await this.roles.listForUser(user.id))
        .filter((role) => role.scopeType === 'GLOBAL' && role.scopeId === '*')
        .map((role) => role.role),
    );
  }
  async usernameTaken(username: string) {
    return Boolean(await this.users.findByUsername(username));
  }
  async session(actor: Actor) {
    return {
      authenticated: true,
      user: await this.me(actor),
      session: { id: actor.sessionId },
    };
  }
  async updateProfile(
    actor: Actor,
    patch: Parameters<UserRepository['updateProfile']>[1],
    requestId: string,
    idempotencyKey: string = randomUUID(),
  ): Promise<ReturnType<AuthService['publicUser']>> {
    const now = new Date();
    const outcome = await this.idempotency.run(
      {
        actorScope: `user:${actor.userId}`,
        scope: 'profile.update',
        key: idempotencyKey,
      },
      'PATCH',
      '/v1/me/profile',
      patch,
      (tx) => this.profileUpdateDurable(tx, actor, patch, requestId, now),
    );
    return outcome.value.user;
  }
  async changePassword(
    actor: Actor,
    input: { currentPassword: string; newPassword: string },
    requestId: string,
    idempotencyKey: string = randomUUID(),
  ) {
    const user = await this.users.findById(actor.userId);
    if (
      !user ||
      !(await this.passwords.verify(user.passwordHash, input.currentPassword))
    )
      throw new UnauthorizedException({
        code: 'CURRENT_PASSWORD_INVALID',
        message: 'The current password is incorrect.',
      });
    const passwordHash = await this.passwords.hash(input.newPassword);
    const now = new Date();
    const outcome = await this.idempotency.run(
      {
        actorScope: `user:${actor.userId}`,
        scope: 'auth.password-change',
        key: idempotencyKey,
      },
      'POST',
      '/v1/me/security/password',
      input,
      async (tx) => {
        await tx.users.updatePasswordHash(actor.userId, passwordHash);
        await tx.users.invalidateTwoFactorLoginChallenges(actor.userId);
        const revokedSessionCount = await tx.sessions.revokeAllExcept(
          actor.userId,
          actor.sessionId as never,
          'PASSWORD_CHANGED',
          now,
        );
        await tx.audit.append(
          this.audit(
            'AUTH_PASSWORD_CHANGED',
            actor.userId,
            actor.sessionId as never,
            requestId,
            now,
            {
              revokedOtherSessionCount: revokedSessionCount,
            },
          ),
        );
        return {
          revokedOtherSessionCount: revokedSessionCount,
          changedAt: now.toISOString(),
        };
      },
    );
    await this.transactionalEmail?.safeSecurityNotification({
      userId: actor.userId,
      event: 'PASSWORD_CHANGED',
      idempotencyKey: `security-password-change:${idempotencyKey}`,
    });
    return outcome.value;
  }
  private async signupDurable(
    tx: IdentityTransaction,
    input: {
      email: string;
      password: string;
      displayName: string;
      username?: string;
      captchaToken?: string;
      consent?: SignupConsentInput;
    },
    requestId: string,
    now: Date,
    userId: UserId,
    passwordHash: string,
    session: IdentitySession,
  ): Promise<DurableSignupResult> {
    if (input.username && (await tx.users.findByUsername(input.username)))
      throw new RepositoryConflict('DUPLICATE_USERNAME');
    const user = await tx.users.create({
      id: userId,
      email: input.email,
      normalizedEmail: input.email as never,
      passwordHash,
      emailVerifiedAt: null,
      accountStatus: 'PENDING_REVIEW',
      profile: {
        displayName: input.displayName,
        publicUsername: input.username ?? null,
        usernameChangedAt: input.username ? now : null,
        avatarReference: null,
        countryCode: 'GB',
        preferredCurrency: 'GBP',
        timezone: 'Europe/London',
      },
    });
    await tx.roles.assign({
      id: randomUUID() as never,
      userId,
      role: 'USER',
      scopeType: 'GLOBAL',
      scopeId: '*',
      assignedByUserId: null,
      createdAt: now,
      revokedAt: null,
    });
    if (this.config.signupConsent.required) {
      // assertValid ran before password work. This narrow guard makes a future
      // direct application call fail closed rather than persisting a user alone.
      if (!input.consent) {
        throw new BadRequestException({
          code: 'REQUIRED_CONSENT_MISSING',
          message: 'Current Terms and Privacy Policy acceptance is required.',
        });
      }
      await tx.consents.appendMany([
        {
          id: randomUUID(),
          userId,
          consentType: 'TERMS_OF_SERVICE',
          policyVersion: input.consent.termsVersion,
          acceptedAt: now,
          source: 'SIGNUP',
        },
        {
          id: randomUUID(),
          userId,
          consentType: 'PRIVACY_POLICY',
          policyVersion: input.consent.privacyVersion,
          acceptedAt: now,
          source: 'SIGNUP',
        },
      ]);
      await tx.audit.append(
        this.audit('CONSENT_ACCEPTED', userId, session.id, requestId, now, {
          consentTypes: ['TERMS_OF_SERVICE', 'PRIVACY_POLICY'],
          termsVersion: input.consent.termsVersion,
          privacyVersion: input.consent.privacyVersion,
        }),
      );
    }
    await tx.sessions.create(session);
    await tx.audit.append(
      this.audit('AUTH_SIGNUP_SUCCEEDED', userId, session.id, requestId, now),
    );
    return {
      userId,
      sessionId: session.id,
      user: this.publicUser(user, ['USER']),
      completedAt: now.toISOString(),
    };
  }
  private async logoutAllDurable(
    tx: IdentityTransaction,
    actor: Actor,
    requestId: string,
    now: Date,
  ): Promise<DurableLogoutAllResult> {
    const revokedSessionCount = await tx.sessions.revokeAllForUser(
      actor.userId,
      'LOGOUT',
      now,
    );
    await tx.audit.append(
      this.audit(
        'AUTH_LOGOUT_ALL',
        actor.userId,
        actor.sessionId as never,
        requestId,
        now,
      ),
    );
    return {
      userId: actor.userId,
      revokedSessionCount,
      completedAt: now.toISOString(),
    };
  }
  private async profileUpdateDurable(
    tx: IdentityTransaction,
    actor: Actor,
    patch: Parameters<UserRepository['updateProfile']>[1],
    requestId: string,
    now: Date,
  ): Promise<DurableProfileUpdateResult> {
    const current = await tx.users.findById(actor.userId);
    if (!current?.profile) throw new ForbiddenException();
    const requestedUsername = patch.publicUsername;
    const usernameChanged =
      requestedUsername !== undefined &&
      requestedUsername !== current.profile.publicUsername;
    if (usernameChanged && current.profile.usernameChangedAt) {
      const nextEligibleAt = new Date(current.profile.usernameChangedAt);
      nextEligibleAt.setUTCDate(nextEligibleAt.getUTCDate() + 30);
      if (nextEligibleAt > now)
        throw new ConflictException({
          code: 'USERNAME_CHANGE_COOLDOWN',
          message: `You can change your username again on ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(nextEligibleAt)}.`,
        });
    }
    if (
      usernameChanged &&
      requestedUsername &&
      (await tx.users.findByUsername(requestedUsername))
    )
      throw new ConflictException({
        code: 'USERNAME_UNAVAILABLE',
        message: 'That username is unavailable.',
      });
    let user: IdentityUser;
    try {
      user = await tx.users.updateProfile(actor.userId, {
        ...patch,
        ...(usernameChanged ? { usernameChangedAt: now } : {}),
      });
    } catch (error) {
      if (
        error instanceof RepositoryConflict &&
        error.code === 'DUPLICATE_USERNAME'
      )
        throw new ConflictException({
          code: 'USERNAME_UNAVAILABLE',
          message: 'That username is unavailable.',
        });
      throw error;
    }
    await tx.audit.append(
      this.audit(
        'AUTH_PROFILE_UPDATED',
        actor.userId,
        actor.sessionId as never,
        requestId,
        now,
        { changedFields: Object.keys(patch) },
      ),
    );
    return {
      userId: actor.userId,
      user: this.publicUser(user, actor.roles),
      completedAt: now.toISOString(),
    };
  }
  private async issueSignupReplayCredentials(
    durable: DurableSignupResult,
    requestId: string,
    sessionContext: SessionContext = {},
  ): Promise<AuthResult> {
    const now = new Date();
    const session = this.newSession(
      durable.userId,
      now,
      undefined,
      undefined,
      sessionContext.userAgent,
    );
    await this.uow.withinTransaction(async (tx) => {
      await tx.sessions.create(session.value);
      await tx.audit.append(
        this.audit(
          'AUTH_SIGNUP_REPLAY_CREDENTIAL_ISSUED',
          durable.userId,
          session.value.id,
          requestId,
          now,
        ),
      );
    });
    return {
      user: durable.user,
      ...(await this.transientCredentials(
        durable.userId,
        session.value,
        session.raw,
      )),
    };
  }
  private async transientCredentials(
    userId: UserId,
    session: IdentitySession,
    refreshToken: string,
  ): Promise<TransientCredentials> {
    return {
      session: { id: session.id, expiresAt: session.expiresAt.toISOString() },
      accessToken: await this.tokens.issue(userId, session.id),
      expiresIn: this.config.accessTokenTtlSeconds,
      refreshToken,
    };
  }
  private getDummyPasswordHash() {
    if (this.dummyPasswordHash) return Promise.resolve(this.dummyPasswordHash);
    this.dummyPasswordHashPromise ??= this.passwords
      .hash('slice-auth-non-enumeration-dummy-password')
      .then((hash) => {
        this.dummyPasswordHash = hash;
        return hash;
      });
    return this.dummyPasswordHashPromise;
  }
  private hashScope(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
  private newSession(
    userId: UserId,
    now: Date,
    familyId: string = randomUUID(),
    authenticatedAt: Date = now,
    userAgent: string | null | undefined = null,
  ) {
    const raw = this.tokens.createOpaqueRefreshToken();
    const value: IdentitySession = {
      id: randomUUID() as never,
      publicId: `session_${randomUUID()}`,
      userId,
      tokenHash: this.tokens.hashRefreshToken(raw),
      familyId,
      replacedBySessionId: null,
      issuedAt: now,
      authenticatedAt,
      expiresAt: new Date(
        now.getTime() + this.config.refreshTokenTtlSeconds * 1000,
      ),
      revokedAt: null,
      revocationReason: null,
      lastActivityAt: now,
      userAgent: userAgent?.slice(0, 512) ?? null,
      ipHash: null,
    };
    return { raw, value };
  }
  private async result(
    user: IdentityUser,
    session: IdentitySession,
    refreshToken: string,
  ): Promise<AuthResult> {
    return {
      user: this.publicUser(
        user,
        (await this.roles.listForUser(user.id)).map((role) => role.role),
      ),
      ...(await this.transientCredentials(user.id, session, refreshToken)),
    };
  }
  private publicUser(user: IdentityUser, roles: string[]) {
    return {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
      accountStatus: user.accountStatus,
      emailVerified: Boolean(user.emailVerifiedAt),
      emailVerificationStatus: user.emailVerifiedAt ? 'VERIFIED' : 'UNVERIFIED',
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      phone: user.phoneE164 ? maskPhone(user.phoneE164) : null,
      phoneVerified: Boolean(user.phoneVerifiedAt),
      phoneVerifiedAt: user.phoneVerifiedAt?.toISOString() ?? null,
      twoFactorEnabled: Boolean(user.twoFactorEnabledAt),
      twoFactorEnabledAt: user.twoFactorEnabledAt?.toISOString() ?? null,
      twoFactorMethod: user.twoFactorMethod ?? null,
      profile: user.profile
        ? {
            displayName: user.profile.displayName,
            username: user.profile.publicUsername,
            usernameChangedAt:
              user.profile.usernameChangedAt?.toISOString() ?? null,
            avatarReference: user.profile.avatarReference,
            countryCode: user.profile.countryCode,
            preferredCurrency: user.profile.preferredCurrency,
            timezone: user.profile.timezone,
          }
        : null,
      roles,
    };
  }
  private audit(
    action: string,
    userId: UserId,
    sessionId: string,
    requestId: string,
    createdAt: Date,
    metadata: Record<string, unknown> | null = null,
  ) {
    return {
      id: randomUUID(),
      actorUserId: userId,
      actorType: 'USER' as const,
      action,
      resourceType: 'user',
      resourceId: userId,
      requestId,
      sessionId: sessionId as never,
      result: 'SUCCESS' as const,
      metadata,
      createdAt,
    };
  }
  private canLogIn(status: IdentityUser['accountStatus']) {
    return status === 'ACTIVE' || status === 'PENDING_REVIEW';
  }
  private invalidRefresh() {
    return new UnauthorizedException({
      code: 'REFRESH_TOKEN_INVALID',
      message: 'Your session is no longer valid.',
    });
  }
  private invalidAccess() {
    return new UnauthorizedException({
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Authentication is required.',
    });
  }
}

function maskPhone(phone: string) {
  return `${phone.slice(0, Math.min(3, phone.length - 4))}${'•'.repeat(Math.max(0, phone.length - 7))}${phone.slice(-4)}`;
}
