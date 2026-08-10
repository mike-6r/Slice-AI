import { ServiceUnavailableException } from '@nestjs/common';
import type { AppConfig } from '../../../config/app-config';
import type { PhoneVerificationDelivery } from './phone-verification.service';
import { TwilioSmsPhoneDelivery } from './twilio-sms-phone-delivery';

describe('TwilioSmsPhoneDelivery', () => {
  const config = {
    twilioAccountSid: 'ACtest',
    twilioAuthToken: 'test-token',
    twilioFromNumber: '+447700900000',
    phoneVerificationTtlSeconds: 420,
  } as AppConfig;

  it('sends Slice-owned OTPs to the requested E.164 destination', async () => {
    const create = jest.fn().mockResolvedValue({ sid: 'SMtest' });
    const delivery = new TwilioSmsPhoneDelivery(config);
    jest
      .spyOn(delivery as never, 'createClient')
      .mockReturnValue({ messages: { create } } as never);

    await delivery.deliver({
      userId: 'user_123',
      phoneE164: '+447700900123',
      code: '123456',
    });

    expect(create).toHaveBeenCalledWith({
      to: '+447700900123',
      from: '+447700900000',
      body: 'Your Slice verification code is 123456. It expires in 7 minutes.',
    });
    const authorityBoundary: PhoneVerificationDelivery = delivery;
    expect(authorityBoundary.managesVerification).toBeUndefined();
    expect(authorityBoundary.verify).toBeUndefined();
  });

  it('maps Twilio transport errors to a safe delivery-unavailable response', async () => {
    const delivery = new TwilioSmsPhoneDelivery(config);
    jest.spyOn(delivery as never, 'createClient').mockReturnValue({
      messages: {
        create: jest.fn().mockRejectedValue(new Error('raw Twilio response')),
      },
    } as never);

    await expect(
      delivery.deliver({
        userId: 'user_123',
        phoneE164: '+447700900123',
        code: '123456',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('fails closed when the configured Twilio sender is absent', async () => {
    const delivery = new TwilioSmsPhoneDelivery({
      ...config,
      twilioFromNumber: undefined,
    });
    await expect(
      delivery.deliver({
        userId: 'user_123',
        phoneE164: '+447700900123',
        code: '123456',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
