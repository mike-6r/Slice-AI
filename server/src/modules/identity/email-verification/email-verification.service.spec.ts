import { ServiceUnavailableException } from '@nestjs/common';
import type { AppConfig } from '../../../config/app-config';
import {
  EmailVerificationService,
  LocalTestEmailDelivery,
  generateVerificationToken,
  hashVerificationToken,
} from './email-verification.service';

describe('email verification token primitives', () => {
  it('generates high-entropy opaque tokens and persists only their digest', () => {
    const first = generateVerificationToken();
    const second = generateVerificationToken();
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(hashVerificationToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashVerificationToken(first)).not.toContain(first);
  });

  it('keeps the local-test proof inside the adapter seam', async () => {
    const delivery = new LocalTestEmailDelivery();
    await delivery.deliver({
      userId: 'user-a',
      email: 'a@example.test',
      token: 'proof',
    });
    expect(delivery.tokenForTest('user-a')).toBe('proof');
  });

  it('fails closed when a production delivery provider is not configured', async () => {
    const service = new EmailVerificationService(
      { user: {}, withTransaction: jest.fn() } as never,
      {
        environment: 'production',
        emailDeliveryMode: 'local_test',
      } as unknown as AppConfig,
      { enforce: jest.fn() } as never,
      { deliver: jest.fn() },
    );
    await expect(
      service.send(
        { userId: 'user-a', sessionId: 'session-a' } as never,
        '127.0.0.1',
        'request-a',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
