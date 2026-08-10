import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../database/prisma.service';
import type { Actor } from './auth.service';

export type SignupConsentInput = {
  termsAccepted: true;
  privacyAccepted: true;
  termsVersion: string;
  privacyVersion: string;
};

@Injectable()
export class SignupConsentService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly db: PrismaService,
  ) {}

  assertValid(input: SignupConsentInput | undefined) {
    if (!this.config.signupConsent.required) return;
    if (
      !input ||
      input.termsAccepted !== true ||
      input.privacyAccepted !== true ||
      input.termsVersion !== this.config.signupConsent.termsVersion ||
      input.privacyVersion !== this.config.signupConsent.privacyVersion
    ) {
      throw new BadRequestException({
        code: 'REQUIRED_CONSENT_MISSING',
        message: 'Current Terms and Privacy Policy acceptance is required.',
      });
    }
  }

  async projection(actor: Actor) {
    const accepted = await this.db.consentAcceptance.findMany({
      where: { userId: actor.userId },
      select: { consentType: true, policyVersion: true, acceptedAt: true },
      orderBy: [{ acceptedAt: 'desc' }, { id: 'desc' }],
    });
    const latest = new Map<string, (typeof accepted)[number]>();
    for (const entry of accepted) {
      if (!latest.has(entry.consentType)) latest.set(entry.consentType, entry);
    }
    const terms = latest.get('TERMS_OF_SERVICE');
    const privacy = latest.get('PRIVACY_POLICY');
    const required = this.config.signupConsent;
    return {
      required: {
        termsVersion: required.termsVersion ?? null,
        privacyVersion: required.privacyVersion ?? null,
      },
      accepted: {
        terms: terms
          ? { version: terms.policyVersion, acceptedAt: terms.acceptedAt.toISOString() }
          : null,
        privacy: privacy
          ? { version: privacy.policyVersion, acceptedAt: privacy.acceptedAt.toISOString() }
          : null,
      },
      currentConsentSatisfied:
        !required.required ||
        (terms?.policyVersion === required.termsVersion &&
          privacy?.policyVersion === required.privacyVersion),
    };
  }
}
