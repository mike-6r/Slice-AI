import { forwardRef, Module } from '@nestjs/common';
import { IdentityPersistenceModule } from '../persistence/identity-persistence.module';
import { AccessTokenGuard } from './access-token.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthTokenService } from '../security/auth-token.service';
import { AuthAbuseService } from './auth-abuse.service';
import { IdempotencyCoordinator } from './idempotency-coordinator';
import { LogoutAllAccessTokenGuard } from './logout-all-access-token.guard';
import { RestrictedSafeAccessTokenGuard } from './restricted-safe-access-token.guard';
import { Argon2idPasswordHasher } from '../security/argon2id-password-hasher';
import { PASSWORD_HASHER } from '../ports/security.ports';
import { RecentAuthService } from '../access/recent-auth.service';
import { TwoFactorController } from '../two-factor/two-factor.controller';
import { TwoFactorCryptoService } from '../two-factor/two-factor-crypto.service';
import { TwoFactorService } from '../two-factor/two-factor.service';
import { SessionManagementService } from './session-management.service';
import { AccountPreferencesService } from './account-preferences.service';
import { CustomerActivityService } from './customer-activity.service';
import { AccountLifecycleService } from './account-lifecycle.service';
import { CaptchaModule } from '../captcha/captcha.module';
import { SignupConsentService } from './signup-consent.service';
import { PhoneVerificationModule } from '../phone-verification/phone-verification.module';
import { EmailDeliveryModule } from '../email-delivery/email-delivery.module';
import { EmailVerificationModule } from '../email-verification/email-verification.module';
@Module({
  imports: [
    IdentityPersistenceModule,
    CaptchaModule,
    forwardRef(() => PhoneVerificationModule),
    EmailDeliveryModule,
    forwardRef(() => EmailVerificationModule),
  ],
  controllers: [AuthController, TwoFactorController],
  providers: [
    AuthService,
    AuthTokenService,
    { provide: PASSWORD_HASHER, useClass: Argon2idPasswordHasher },
    AccessTokenGuard,
    AuthAbuseService,
    IdempotencyCoordinator,
    LogoutAllAccessTokenGuard,
    RestrictedSafeAccessTokenGuard,
    RecentAuthService,
    TwoFactorCryptoService,
    TwoFactorService,
    SessionManagementService,
    AccountPreferencesService,
    CustomerActivityService,
    AccountLifecycleService,
    SignupConsentService,
  ],
  exports: [
    AuthService,
    AccessTokenGuard,
    IdempotencyCoordinator,
    AuthAbuseService,
    RecentAuthService,
    PASSWORD_HASHER,
    TwoFactorService,
  ],
})
export class AuthModule {}
