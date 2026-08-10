import { ServiceUnavailableException } from '@nestjs/common';
import type { AppConfig } from '../../../config/app-config';
import { ResendEmailDelivery } from './resend-email-delivery';

describe('ResendEmailDelivery', () => {
  const config = {
    resendApiKey: 're_test_provider_key',
    resendFromEmail: 'verify@slice.test',
    resendFromName: 'Slice',
    appPublicUrl: 'https://app.slice.test',
  } as AppConfig;

  it('maps a verification delivery to the trusted public callback URL', async () => {
    const send = jest.fn().mockResolvedValue({ data: { id: 'email_123' } });
    const delivery = new ResendEmailDelivery(config);
    jest
      .spyOn(delivery as never, 'createClient')
      .mockReturnValue({ emails: { send } } as never);

    await delivery.deliver({
      userId: 'user_123',
      email: 'collector@example.test',
      token: 'verification-token',
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Slice <verify@slice.test>',
        to: ['collector@example.test'],
        subject: 'Verify your Slice email',
        text: expect.stringContaining(
          'https://app.slice.test/verify-email?token=verification-token',
        ),
      }),
    );
  });

  it('keeps a development recipient override transport-only and maps provider failures safely', async () => {
    const send = jest.fn().mockResolvedValue({ error: { message: 'rejected' } });
    const delivery = new ResendEmailDelivery({
      ...config,
      resendTestRecipientOverride: 'safe-test@resend.dev',
    });
    jest
      .spyOn(delivery as never, 'createClient')
      .mockReturnValue({ emails: { send } } as never);

    await expect(
      delivery.deliver({
        userId: 'user_123',
        email: 'collector@example.test',
        token: 'verification-token',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['safe-test@resend.dev'] }),
    );
  });
});
