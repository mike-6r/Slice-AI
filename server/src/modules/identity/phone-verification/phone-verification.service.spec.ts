import {
  BadRequestException,
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

  it('normalizes national US, GB, and AU input with the selected country', () => {
    expect(normalizePhone('202 555 0103', 'us')).toBe('+12025550103');
    expect(normalizePhone('07911 123456', 'GB')).toBe('+447911123456');
    expect(normalizePhone('0412 345 678', 'AU')).toBe('+61412345678');
  });

  it('accepts canonical E.164 input without a country selector', () => {
    expect(normalizePhone('+12025550103')).toBe('+12025550103');
    expect(normalizePhone('+447911123456', 'AU')).toBe('+447911123456');
  });

  it('rejects impossible phone numbers with a 400-safe error', () => {
    expect(() => normalizePhone('not-a-phone')).toThrow(BadRequestException);
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

  it('returns a stable 400 response for an unqualified local number', () => {
    let error: unknown;
    try {
      normalizePhone('020 7946 0958');
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getStatus()).toBe(400);
    expect((error as BadRequestException).getResponse()).toEqual({
      code: 'PHONE_INVALID',
      message:
        'Enter a valid phone number. Use +country code for an international number.',
    });
  });
});
