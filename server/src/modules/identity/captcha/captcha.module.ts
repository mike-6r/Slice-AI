import { Module } from '@nestjs/common';
import { CAPTCHA_VERIFIER, ConfiguredCaptchaVerifier } from './captcha-verifier';

@Module({
  providers: [
    ConfiguredCaptchaVerifier,
    { provide: CAPTCHA_VERIFIER, useExisting: ConfiguredCaptchaVerifier },
  ],
  exports: [CAPTCHA_VERIFIER, ConfiguredCaptchaVerifier],
})
export class CaptchaModule {}
