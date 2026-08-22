import {
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { AppConfig } from '../../../config/app-config';
import {
  LocalTestPhoneDelivery,
  normalizePhone,
  PhoneVerificationService,
} from './phone-verification.service';

describe('phone verification primitives', () => {
  it('normalizes a valid international number to E.164', () => {
    expect(normalizePhone('+44 7911 123456')).toBe('+447911123456');
  });
  it('rejects impossible phone numbers', () => {
    expect(() => normalizePhone('not-a-phone')).toThrow(ConflictException);
  });
  it('keeps test OTP generation inside the isolated local adapter', async () => {
    const delivery = new LocalTestPhoneDelivery();
    await delivery.deliver({ userId: 'user', phoneE164: '+12025550107', purpose: 'PHONE' });
    expect(delivery.codeForTest('user', '+12025550107')).toMatch(/^\d{6}$/);
  });
  it('fails closed when a production delivery adapter is not configured', async () => {
    const service = new PhoneVerificationService(
      {} as never,
      {
        environment: 'production',
        phoneVerificationEnabled: true,
        phoneDeliveryMode: 'local_test',
      } as unknown as AppConfig,
      { enforce: jest.fn().mockResolvedValue(undefined) } as never,
      new LocalTestPhoneDelivery(),
    );
    await expect(
      service.send(
        { userId: 'user', sessionId: 'session' } as never,
        '+12025550107',
        '198.51.100.1',
        'request',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('changes Slice phone state only after an approved managed-provider check', async () => {
    const verify = jest.fn().mockResolvedValue(false);
    const db = {
      phoneVerificationChallenge: {
        findFirst: jest.fn().mockResolvedValue({ id: 'challenge', phoneE164: '+447911123456' }),
      },
      withTransaction: jest.fn().mockRejectedValue(new UnauthorizedException()),
    };
    const service = new PhoneVerificationService(
      db as never,
      {
        environment: 'test',
        phoneVerificationEnabled: true,
        phoneDeliveryMode: 'twilio_verify',
        phoneVerificationMaxAttempts: 5,
      } as unknown as AppConfig,
      { enforce: jest.fn().mockResolvedValue(undefined) } as never,
      {
        managesVerification: true,
        deliver: jest.fn(),
        verify,
      },
    );
    await expect(
      service.confirm(
        { userId: 'user_123', sessionId: 'session_123' } as never,
        '000000',
        '198.51.100.1',
        'request_123',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verify).toHaveBeenCalledWith({
      userId: 'user_123',
      phoneE164: '+447911123456',
      code: '000000',
      purpose: 'PHONE',
    });
    expect(db.withTransaction).toHaveBeenCalledTimes(1);
  });

});
