import type { AppConfig } from '../../../config/app-config';
import { TransactionalEmailService } from './transactional-email.service';

const config = {
  emailEnabled: true,
  emailDeliveryMode: 'local_test',
  environment: 'test',
  appPublicUrl: 'https://staging.slice.test',
  emailVerificationTtlSeconds: 3600,
  passwordResetTtlSeconds: 900,
  resendFromEmail: 'no-reply@slicecollectable.com',
  resendFromName: 'Slice',
} as unknown as AppConfig;

function database() {
  return {
    transactionalEmailDelivery: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    user: { findUnique: jest.fn() },
  };
}

describe('TransactionalEmailService', () => {
  it('records a delivery and passes the deterministic key to the provider', async () => {
    const db = database();
    const provider = { send: jest.fn().mockResolvedValue({ providerMessageId: 're_123' }) };
    const service = new TransactionalEmailService(db as never, config, provider);

    await service.send({
      userId: 'user-1',
      to: 'collector@example.test',
      type: 'PASSWORD_RESET',
      subject: 'Reset your Slice password',
      html: '<p>reset</p>',
      text: 'reset',
      idempotencyKey: 'password-reset:token-hash',
    });

    expect(db.transactionalEmailDelivery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idempotencyKey: 'password-reset:token-hash' },
        create: expect.objectContaining({ status: 'PENDING', provider: 'local_test' }),
      }),
    );
    expect(provider.send).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'password-reset:token-hash' }),
    );
    expect(db.transactionalEmailDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SENT', providerMessageId: 're_123' }),
      }),
    );
  });

  it('does not call the provider again for a recorded sent delivery', async () => {
    const db = database();
    db.transactionalEmailDelivery.findUnique.mockResolvedValue({
      status: 'SENT',
      providerMessageId: 're_existing',
    });
    const provider = { send: jest.fn() };
    const service = new TransactionalEmailService(db as never, config, provider);

    await expect(
      service.send({
        to: 'collector@example.test',
        type: 'EMAIL_VERIFICATION',
        subject: 'Verify',
        html: '<p>verify</p>',
        text: 'verify',
        idempotencyKey: 'verification:token-hash',
      }),
    ).resolves.toEqual({ providerMessageId: 're_existing' });
    expect(provider.send).not.toHaveBeenCalled();
  });
});
