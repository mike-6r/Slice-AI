import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Patch,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { Inject } from '@nestjs/common';
import {
  loginSchema,
  passwordChangeSchema,
  recentAuthSchema,
  profileUpdateSchema,
  preferencesUpdateSchema,
  activityQuerySchema,
  dataExportSchema,
  deactivateAccountSchema,
  deletionRequestSchema,
  emptyObjectSchema,
  signupSchema,
  usernameAvailabilitySchema,
  twoFactorChallengeSchema,
  twoFactorResendSchema,
} from '../dto/identity.schemas';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from './access-token.guard';
import { AuthService, type AuthResult } from './auth.service';
import { AuthAbuseService } from './auth-abuse.service';
import { LogoutAllAccessTokenGuard } from './logout-all-access-token.guard';
import { RestrictedSafeAccessTokenGuard } from './restricted-safe-access-token.guard';
import { TwoFactorService } from '../two-factor/two-factor.service';
import { SessionManagementService } from './session-management.service';
import { AccountPreferencesService } from './account-preferences.service';
import { CustomerActivityService } from './customer-activity.service';
import { AccountLifecycleService } from './account-lifecycle.service';
import { SignupConsentService } from './signup-consent.service';

export type RefreshCookieInstruction = {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    secure: boolean;
    sameSite: 'lax';
    path: string;
    domain: string | undefined;
    maxAge: number;
  };
};

@Controller()
export class AuthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly auth: AuthService,
    private readonly abuse: AuthAbuseService,
    private readonly twoFactor: TwoFactorService,
    private readonly sessionManagement: SessionManagementService,
    private readonly preferences: AccountPreferencesService,
    private readonly activity: CustomerActivityService,
    private readonly lifecycle: AccountLifecycleService,
    private readonly signupConsent: SignupConsentService,
  ) {}
  @Get('me/consents') @UseGuards(AccessTokenGuard) async consents(
    @Req() request: AuthenticatedRequest,
  ) {
    return this.signupConsent.projection(request.actor!);
  }
  /** Safe public configuration needed to collect current consent and CAPTCHA proof.
   * It intentionally excludes provider names, secrets, and every delivery credential. */
  @Get('auth/signup-policy')
  signupPolicy() {
    return {
      captcha: {
        required: this.config.captcha.enabled,
        siteKey: this.config.captcha.enabled
          ? (this.config.captcha.siteKey ?? null)
          : null,
        localTest:
          this.config.environment !== 'production' &&
          this.config.captcha.enabled &&
          this.config.captcha.provider === 'local_test',
      },
      consent: {
        required: this.config.signupConsent.required,
        termsVersion: this.config.signupConsent.required
          ? (this.config.signupConsent.termsVersion ?? null)
          : null,
        privacyVersion: this.config.signupConsent.required
          ? (this.config.signupConsent.privacyVersion ?? null)
          : null,
      },
    };
  }
  @Get('auth/usernames/availability')
  async usernameAvailability(@Query() query: unknown) {
    const input = parse(usernameAvailabilitySchema, query);
    return {
      username: input.username,
      available: !(await this.auth.usernameTaken(input.username)),
    };
  }
  @Post('auth/signup') async signup(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.requireIdempotencyKey(key);
    const input = parse(signupSchema, body);
    await this.abuse.enforce('signup', request.ip ?? 'unknown', input.email);
    return this.withCookie(
      await this.auth.signup(
        input,
        request.requestId ?? 'unknown',
        key!,
        sessionContext(request),
      ),
      response,
    );
  }
  @Post('auth/login') @HttpCode(200) async login(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = parse(loginSchema, body);
    await this.abuse.enforce('login', request.ip ?? 'unknown', input.email);
    const result = await this.auth.loginWithTwoFactor(
      input,
      request.requestId ?? 'unknown',
      sessionContext(request),
      request.ip ?? 'unknown',
    );
    if ('requiresTwoFactor' in result && result.requiresTwoFactor)
      return result;
    return this.withCookie(result as AuthResult, response);
  }
  @Post('auth/2fa/verify') @HttpCode(200) async verifyTwoFactorLogin(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = parse(twoFactorChallengeSchema, body);
    const userId = await this.twoFactor.verifyLoginChallenge(
      input,
      request.ip ?? 'unknown',
      request.requestId ?? 'unknown',
    );
    return this.withCookie(
      await this.auth.completeTwoFactorLogin(
        userId as never,
        request.requestId ?? 'unknown',
        sessionContext(request),
      ),
      response,
    );
  }
  @Post('auth/2fa/resend') @HttpCode(200) async resendTwoFactorLogin(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parse(twoFactorResendSchema, body);
    return this.twoFactor.resendLoginChallenge(
      input.challenge,
      request.ip ?? 'unknown',
      request.requestId ?? 'unknown',
    );
  }
  @Post('auth/refresh') @HttpCode(200) async refresh(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = readCookie(request, this.config.refreshCookieName);
    await this.abuse.enforce('refresh', request.ip ?? 'unknown');
    if (!token) {
      await this.abuse.enforce('refresh-failure', request.ip ?? 'unknown');
      throw new BadRequestException({
        code: 'REFRESH_TOKEN_INVALID',
        message: 'Your session is no longer valid.',
      });
    }
    try {
      return this.withCookie(
        await this.auth.refresh(token, request.requestId ?? 'unknown'),
        response,
      );
    } catch (error) {
      await this.abuse.enforce(
        'refresh-failure',
        request.ip ?? 'unknown',
        token,
      );
      throw error;
    }
  }
  @Post('auth/logout')
  @HttpCode(204)
  @UseGuards(RestrictedSafeAccessTokenGuard)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(request.actor!, request.requestId ?? 'unknown');
    this.clearCookie(response);
  }
  @Post('auth/logout-all')
  @HttpCode(204)
  @UseGuards(LogoutAllAccessTokenGuard)
  async logoutAll(
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.requireIdempotencyKey(key);
    await this.abuse.enforce(
      'logout-all',
      request.ip ?? 'unknown',
      request.actor!.userId,
    );
    await this.auth.logoutAll(
      request.actor!,
      request.requestId ?? 'unknown',
      key!,
    );
    this.clearCookie(response);
  }
  @Get('session') @UseGuards(RestrictedSafeAccessTokenGuard) session(
    @Req() request: AuthenticatedRequest,
  ) {
    return this.auth.session(request.actor!);
  }
  @Get('me') @UseGuards(RestrictedSafeAccessTokenGuard) me(
    @Req() request: AuthenticatedRequest,
  ) {
    return this.auth.me(request.actor!);
  }
  @Get('me/sessions') @UseGuards(AccessTokenGuard) listSessions(
    @Req() request: AuthenticatedRequest,
  ) {
    return this.sessionManagement.list(request.actor!);
  }
  @Get('me/preferences') @UseGuards(AccessTokenGuard) getPreferences(
    @Req() request: AuthenticatedRequest,
  ) {
    return this.preferences.get(request.actor!);
  }
  @Patch('me/preferences') @UseGuards(AccessTokenGuard) async updatePreferences(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    this.requireIdempotencyKey(key);
    return this.preferences.update(
      request.actor!,
      parse(preferencesUpdateSchema, body),
      request.ip ?? 'unknown',
      request.requestId ?? 'unknown',
      key!,
    );
  }
  @Get('me/activity') @UseGuards(AccessTokenGuard) listActivity(
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.activity.list(
      request.actor!,
      parse(activityQuerySchema, query),
    );
  }
  @Post('me/data-export')
  @UseGuards(AccessTokenGuard)
  async exportData(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    this.requireIdempotencyKey(key);
    parse(dataExportSchema, body);
    return this.lifecycle.exportData(
      request.actor!,
      request.ip ?? 'unknown',
      request.requestId ?? 'unknown',
      key!,
    );
  }
  @Post('me/deactivate')
  @UseGuards(AccessTokenGuard)
  async deactivate(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.requireIdempotencyKey(key);
    const input = parse(deactivateAccountSchema, body);
    const result = await this.lifecycle.deactivate(
      request.actor!,
      { reason: input.reason },
      request.ip ?? 'unknown',
      request.requestId ?? 'unknown',
      key!,
    );
    this.clearCookie(response);
    return result;
  }
  @Get('me/deletion-request')
  @UseGuards(AccessTokenGuard)
  getDeletionRequest(@Req() request: AuthenticatedRequest) {
    return this.lifecycle.deletionStatus(request.actor!);
  }
  @Post('me/deletion-request')
  @UseGuards(AccessTokenGuard)
  async requestDeletion(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    this.requireIdempotencyKey(key);
    const input = parse(deletionRequestSchema, body);
    return this.lifecycle.requestDeletion(
      request.actor!,
      { reason: input.reason },
      request.ip ?? 'unknown',
      request.requestId ?? 'unknown',
      key!,
    );
  }
  @Post('me/deletion-request/cancel')
  @UseGuards(AccessTokenGuard)
  async cancelDeletion(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    this.requireIdempotencyKey(key);
    parse(emptyObjectSchema, body);
    return this.lifecycle.cancelDeletion(
      request.actor!,
      request.ip ?? 'unknown',
      request.requestId ?? 'unknown',
      key!,
    );
  }
  @Post('me/sessions/revoke-others')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  async revokeOtherSessions(@Req() request: AuthenticatedRequest) {
    return this.sessionManagement.revokeOthers(
      request.actor!,
      request.ip ?? 'unknown',
      request.requestId ?? 'unknown',
    );
  }
  @Delete('me/sessions/:sessionReference')
  @HttpCode(204)
  @UseGuards(AccessTokenGuard)
  async revokeSession(
    @Param('sessionReference') sessionReference: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const outcome = await this.sessionManagement.revoke(
      request.actor!,
      sessionReference,
      request.ip ?? 'unknown',
      request.requestId ?? 'unknown',
    );
    if (outcome.currentSessionRevoked) this.clearCookie(response);
  }
  @Patch('me/profile') @UseGuards(AccessTokenGuard) async updateProfile(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    this.requireIdempotencyKey(key);
    const input = parse(profileUpdateSchema, body);
    const { username, ...profilePatch } = input;
    await this.abuse.enforce(
      'profile',
      request.ip ?? 'unknown',
      request.actor!.userId,
    );
    return this.auth.updateProfile(
      request.actor!,
      {
        ...profilePatch,
        publicUsername: username,
      } as never,
      request.requestId ?? 'unknown',
      key!,
    );
  }
  @Post('me/security/password')
  @UseGuards(AccessTokenGuard)
  async changePassword(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    this.requireIdempotencyKey(key);
    const input = parse(passwordChangeSchema, body);
    await this.abuse.enforce(
      'password',
      request.ip ?? 'unknown',
      request.actor!.userId,
    );
    return this.auth.changePassword(
      request.actor!,
      input,
      request.requestId ?? 'unknown',
      key!,
    );
  }
  @Post('me/security/recent-auth')
  @UseGuards(AccessTokenGuard)
  async confirmRecentAuth(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parse(recentAuthSchema, body);
    await this.abuse.enforce(
      'recent-auth',
      request.ip ?? 'unknown',
      request.actor!.userId,
    );
    return this.auth.confirmRecentAuth(
      request.actor!,
      input.password,
      request.requestId ?? 'unknown',
    );
  }
  private withCookie(result: AuthResult, response: Response) {
    const { refreshToken, ...publicResult } = result;
    const instruction: RefreshCookieInstruction = {
      name: this.config.refreshCookieName,
      value: refreshToken,
      options: this.cookieOptions(),
    };
    response.cookie(instruction.name, instruction.value, instruction.options);
    return publicResult;
  }
  private clearCookie(response: Response) {
    response.clearCookie(this.config.refreshCookieName, this.cookieOptions());
  }
  private cookieOptions() {
    return {
      httpOnly: true as const,
      secure: this.config.cookieSecure,
      sameSite: 'lax' as const,
      path: '/api/v1/auth',
      domain: this.config.cookieDomain,
      maxAge: this.config.refreshTokenTtlSeconds * 1000,
    };
  }
  private requireIdempotencyKey(value: string | undefined) {
    if (!value || value.length > 128)
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'A valid Idempotency-Key header is required.',
      });
  }
}
function parse<T>(
  schema: {
    safeParse(value: unknown): {
      success: boolean;
      data?: T;
      error?: { flatten(): { fieldErrors: Record<string, string[]> } };
    };
  },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed.',
      fieldErrors: result.error!.flatten().fieldErrors,
    });
  return result.data!;
}
function readCookie(request: Request, name: string) {
  const item = request.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!item) return undefined;
  try {
    return decodeURIComponent(item.slice(name.length + 1));
  } catch {
    throw new BadRequestException({
      code: 'REFRESH_TOKEN_INVALID',
      message: 'Your session is no longer valid.',
    });
  }
}
function sessionContext(request: Request) {
  return { userAgent: request.header('user-agent') ?? null };
}
