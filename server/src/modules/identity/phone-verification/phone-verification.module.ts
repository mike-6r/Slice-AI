import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { AuthModule } from '../auth/auth.module';
import { PhoneVerificationController } from './phone-verification.controller';
import {
  LocalTestPhoneDelivery,
  PHONE_VERIFICATION_DELIVERY,
  PhoneVerificationService,
} from './phone-verification.service';
import { TwilioVerifyPhoneDelivery } from './twilio-verify-phone-delivery';
import { TwilioSmsPhoneDelivery } from './twilio-sms-phone-delivery';

@Module({
  imports: [AuthModule],
  controllers: [PhoneVerificationController],
  providers: [
    PhoneVerificationService,
    LocalTestPhoneDelivery,
    TwilioSmsPhoneDelivery,
    TwilioVerifyPhoneDelivery,
    {
      provide: PHONE_VERIFICATION_DELIVERY,
      inject: [
        APP_CONFIG,
        LocalTestPhoneDelivery,
        TwilioSmsPhoneDelivery,
        TwilioVerifyPhoneDelivery,
      ],
      useFactory: (
        config: AppConfig,
        local: LocalTestPhoneDelivery,
        twilioSms: TwilioSmsPhoneDelivery,
        twilioVerify: TwilioVerifyPhoneDelivery,
      ) => {
        if (config.phoneDeliveryMode === 'local_test') return local;
        if (config.phoneDeliveryMode === 'twilio_sms') return twilioSms;
        return twilioVerify;
      },
    },
  ],
  exports: [PhoneVerificationService, LocalTestPhoneDelivery],
})
export class PhoneVerificationModule {}
