import {
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import type { AppConfig } from '../../../config/app-config';
import {
  generateOtp,
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
  it('generates opaque six digit OTPs', () => {
    const code = generateOtp();
    expect(code).toMatch(/^\d{6}$/);
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
    const db = { withTransaction: jest.fn() };
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
        '+447911123456',
        '000000',
        '198.51.100.1',
        'request_123',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verify).toHaveBeenCalledWith({
      phoneE164: '+447911123456',
      code: '000000',
    });
    expect(db.withTransaction).not.toHaveBeenCalled();
  });

  it('does not treat successful transport-only SMS delivery as phone approval', async () => {
    const now = new Date();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      user: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ accountStatus: 'ACTIVE', phoneE164: null }),
        update: jest.fn(),
      },
      phoneVerificationChallenge: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'challenge_123',
          expiresAt: new Date(now.getTime() + 60_000),
          attemptCount: 0,
          codeHash: await argon2.hash('123456'),
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    const delivery = { deliver: jest.fn().mockResolvedValue(undefined) };
    const db = {
      withTransaction: jest.fn((work: (transaction: typeof tx) => unknown) =>
        work(tx),
      ),
    };
    const service = new PhoneVerificationService(
      db as never,
      {
        environment: 'test',
        phoneVerificationEnabled: true,
        phoneDeliveryMode: 'twilio_sms',
        phoneVerificationMaxAttempts: 5,
      } as unknown as AppConfig,
      { enforce: jest.fn().mockResolvedValue(undefined) } as never,
      delivery,
    );

    await delivery.deliver({
      userId: 'user_123',
      phoneE164: '+447911123456',
      code: '123456',
    });
    await expect(
      service.confirm(
        { userId: 'user_123', sessionId: 'session_123' } as never,
        '+447911123456',
        '000000',
        '198.51.100.1',
        'request_123',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(delivery.deliver).toHaveBeenCalledTimes(1);
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.phoneVerificationChallenge.update).toHaveBeenCalledTimes(1);
  });
});
