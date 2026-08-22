import { ServiceUnavailableException } from '@nestjs/common';
import type { AppConfig } from '../../../config/app-config';
import { TwilioVerifyPhoneDelivery } from './twilio-verify-phone-delivery';

describe('TwilioVerifyPhoneDelivery', () => {
  const config = {
    twilioAccountSid: 'ACtest',
    twilioApiKey: 'SKtest',
    twilioApiSecret: 'test-secret',
    twilioVerifyServiceSid: 'VAverify',
  } as AppConfig;

  const client = (verificationStatus: string, checkStatus: string) => {
    const createVerification = jest
      .fn()
      .mockResolvedValue({ status: verificationStatus });
    const createCheck = jest.fn().mockResolvedValue({ status: checkStatus });
    const services = jest.fn(() => ({
      verifications: { create: createVerification },
      verificationChecks: { create: createCheck },
    }));
    return {
      value: { verify: { v2: { services } } },
      services,
      createVerification,
      createCheck,
    };
  };

  it('uses Twilio Verify v2 for SMS delivery and verification checks', async () => {
    const twilio = client('pending', 'approved');
    const delivery = new TwilioVerifyPhoneDelivery(config);
    jest
      .spyOn(delivery as never, 'createClient')
      .mockReturnValue(twilio.value as never);

    await delivery.deliver({
      userId: 'user_123',
      phoneE164: '+447700900123',
      purpose: 'PHONE',
    });
    await expect(
      delivery.verify({ userId: 'user_123', phoneE164: '+447700900123', code: '123456', purpose: 'PHONE' }),
    ).resolves.toBe(true);

    expect(twilio.services).toHaveBeenCalledWith('VAverify');
    expect(twilio.createVerification).toHaveBeenCalledWith({
      to: '+447700900123',
      channel: 'sms',
    });
    expect(twilio.createCheck).toHaveBeenCalledWith({
      to: '+447700900123',
      code: '123456',
    });
  });

  it('does not treat a pending or failed Verify response as phone approval', async () => {
    const twilio = client('pending', 'pending');
    const delivery = new TwilioVerifyPhoneDelivery(config);
    jest
      .spyOn(delivery as never, 'createClient')
      .mockReturnValue(twilio.value as never);

    await expect(
      delivery.verify({ userId: 'user_123', phoneE164: '+447700900123', code: '000000', purpose: 'PHONE' }),
    ).resolves.toBe(false);

    const failedStart = client('canceled', 'approved');
    jest
      .spyOn(delivery as never, 'createClient')
      .mockReturnValue(failedStart.value as never);
    await expect(
      delivery.deliver({
        userId: 'user_123',
        phoneE164: '+447700900123',
        purpose: 'PHONE',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('maps invalid Twilio client configuration to the safe delivery error', async () => {
    const delivery = new TwilioVerifyPhoneDelivery({
      ...config,
      twilioAccountSid: 'SK-not-an-account-sid',
    });
    await expect(
      delivery.deliver({
        userId: 'user_123',
        phoneE164: '+447700900123',
        purpose: 'PHONE',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
