import { forwardRef, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { AuthModule } from '../auth/auth.module';
import { EmailDeliveryModule } from '../email-delivery/email-delivery.module';
import { EmailVerificationController } from './email-verification.controller';
import {
  EMAIL_VERIFICATION_DELIVERY,
  EmailVerificationService,
  LocalTestEmailDelivery,
} from './email-verification.service';
import { ResendEmailDelivery } from './resend-email-delivery';
import { PasswordResetService } from './password-reset.service';

@Module({
  imports: [forwardRef(() => AuthModule), EmailDeliveryModule],
  controllers: [EmailVerificationController],
  providers: [
    EmailVerificationService,
    PasswordResetService,
    LocalTestEmailDelivery,
    ResendEmailDelivery,
    {
      provide: EMAIL_VERIFICATION_DELIVERY,
      inject: [APP_CONFIG, LocalTestEmailDelivery, ResendEmailDelivery],
      useFactory: (
        config: AppConfig,
        local: LocalTestEmailDelivery,
        resend: ResendEmailDelivery,
      ) => (config.emailDeliveryMode === 'local_test' ? local : resend),
    },
  ],
  exports: [EmailVerificationService, PasswordResetService, LocalTestEmailDelivery],
})
export class EmailVerificationModule {}
