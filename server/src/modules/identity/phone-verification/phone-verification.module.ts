import { forwardRef, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { AuthModule } from '../auth/auth.module';
import { PhoneVerificationController } from './phone-verification.controller';
import {
  LocalTestPhoneDelivery,
  PHONE_VERIFICATION_DELIVERY,
  PhoneVerificationService,
} from './phone-verification.service';
import { TwilioVerifyPhoneDelivery } from './twilio-verify-phone-delivery';
import { EmailDeliveryModule } from '../email-delivery/email-delivery.module';

@Module({
  imports: [forwardRef(() => AuthModule), EmailDeliveryModule],
  controllers: [PhoneVerificationController],
  providers: [
    PhoneVerificationService,
    LocalTestPhoneDelivery,
    TwilioVerifyPhoneDelivery,
    {
      provide: PHONE_VERIFICATION_DELIVERY,
      inject: [APP_CONFIG, LocalTestPhoneDelivery, TwilioVerifyPhoneDelivery],
      useFactory: (
        config: AppConfig,
        local: LocalTestPhoneDelivery,
        twilioVerify: TwilioVerifyPhoneDelivery,
      ) => {
        if (config.phoneDeliveryMode === 'local_test') return local;
        return twilioVerify;
      },
    },
  ],
  exports: [PhoneVerificationService, LocalTestPhoneDelivery, PHONE_VERIFICATION_DELIVERY],
})
export class PhoneVerificationModule {}
