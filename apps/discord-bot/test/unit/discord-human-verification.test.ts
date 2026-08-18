import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { DiscordHumanVerification } from '../../src/discord-human-verification.js';

const renderer = async () => Buffer.from('visual-puzzle');
const positionFor = (secret: string) => String(createHash('sha256').update(secret).digest()[0]! % 9 + 1);

describe('Discord human verification', () => {
  it('creates a visual puzzle and accepts only its one-time selection for the original member', async () => {
    const values = ['nonce', 'answer-secret']; const service = new DiscordHumanVerification(() => 1000, () => values.shift()!, renderer);
    const challenge = await service.begin('guild', 'member');
    expect(challenge).toMatchObject({ ok: true, nonce: 'nonce', image: Buffer.from('visual-puzzle') });
    if (!challenge.ok) throw new Error('Expected visual challenge');
    const selection = positionFor('answer-secret');
    expect(service.complete(challenge.nonce, 'other-guild', 'member', selection)).toEqual({ ok: false, reason: 'EXPIRED' });
    expect(service.complete(challenge.nonce, 'guild', 'member', selection)).toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('allows three selections and then expires the puzzle', async () => {
    const values = ['nonce', 'answer-secret']; const service = new DiscordHumanVerification(() => 1000, () => values.shift()!, renderer);
    const challenge = await service.begin('guild', 'member'); if (!challenge.ok) throw new Error('Expected visual challenge');
    expect(service.complete(challenge.nonce, 'guild', 'member', '0')).toEqual({ ok: false, reason: 'INCORRECT' });
    expect(service.complete(challenge.nonce, 'guild', 'member', '0')).toEqual({ ok: false, reason: 'INCORRECT' });
    expect(service.complete(challenge.nonce, 'guild', 'member', '0')).toEqual({ ok: false, reason: 'INCORRECT' });
    expect(service.complete(challenge.nonce, 'guild', 'member', positionFor('answer-secret'))).toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('rate limits repeated puzzle starts and binds the answer to a single challenge', async () => {
    const values = ['nonce-1', 'secret-1', 'nonce-2', 'secret-2', 'nonce-3', 'secret-3']; const service = new DiscordHumanVerification(() => 1000, () => values.shift()!, renderer);
    const first = await service.begin('guild', 'member'); const second = await service.begin('guild', 'member'); const third = await service.begin('guild', 'member'); const limited = await service.begin('guild', 'member');
    expect(first.ok && second.ok && third.ok).toBe(true);
    expect(limited).toEqual({ ok: false, retryAfterSeconds: 900 });
    if (!third.ok) throw new Error('Expected visual challenge');
    expect(service.complete(third.nonce, 'guild', 'member', positionFor('secret-3'))).toEqual({ ok: true });
  });
});
