import { redact } from './redaction';

describe('redact', () => {
  it('redacts sensitive keys recursively and keeps non-sensitive values', () => {
    expect(
      redact({
        authorization: 'Bearer private',
        nested: {
          PasswordHash: 'private',
          cards: [{ cardNumber: '4242', label: 'visible' }],
        },
        publicValue: 'safe',
      }),
    ).toEqual({
      authorization: '[REDACTED]',
      nested: {
        PasswordHash: '[REDACTED]',
        cards: '[REDACTED]',
      },
      publicValue: 'safe',
    });
  });
});
