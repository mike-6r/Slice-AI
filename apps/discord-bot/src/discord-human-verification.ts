import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';

type Challenge = { guildId: string; userId: string; answer: string; expiresAt: number; attempts: number };
type ChallengeStart = { ok: true; nonce: string; image: Buffer } | { ok: false; retryAfterSeconds: number };
export type HumanVerificationResult = { ok: true } | { ok: false; reason: 'EXPIRED' | 'INCORRECT' };
const CHALLENGE_LIFETIME_MS = 4 * 60_000;
const START_WINDOW_MS = 15 * 60_000;
const MAX_STARTS_PER_WINDOW = 3;
const SHAPES = ['circle', 'square', 'triangle', 'diamond'] as const;
type Shape = (typeof SHAPES)[number];

/**
 * Discord-only, font-free visual proof-of-humanity. The member must identify
 * the one grid tile matching the reference symbol; the answer remains only in
 * process memory and is never placed in an embed, attachment name, or custom ID.
 */
export class DiscordHumanVerification {
  private readonly challenges = new Map<string, Challenge>();
  private readonly starts = new Map<string, number[]>();
  constructor(private readonly now: () => number = () => Date.now(), private readonly random: () => string = () => randomUUID(), private readonly render: (target: Shape, position: number, nonce: string, secret: string) => Promise<Buffer> = renderVisualPuzzle) {}

  async begin(guildId: string, userId: string): Promise<ChallengeStart> {
    this.removeExpired();
    const key = `${guildId}:${userId}`;
    const history = (this.starts.get(key) ?? []).filter((startedAt) => startedAt > this.now() - START_WINDOW_MS);
    if (history.length >= MAX_STARTS_PER_WINDOW) return { ok: false, retryAfterSeconds: Math.ceil((history[0]! + START_WINDOW_MS - this.now()) / 1000) };
    for (const [nonce, challenge] of this.challenges) if (challenge.guildId === guildId && challenge.userId === userId) this.challenges.delete(nonce);
    const nonce = this.random();
    const secret = this.random();
    const bytes = createHash('sha256').update(secret).digest();
    const position = bytes[0]! % 9 + 1;
    const target = SHAPES[bytes[1]! % SHAPES.length]!;
    this.challenges.set(nonce, { guildId, userId, answer: String(position), expiresAt: this.now() + CHALLENGE_LIFETIME_MS, attempts: 0 });
    this.starts.set(key, [...history, this.now()]);
    return { ok: true, nonce, image: await this.render(target, position, nonce, secret) };
  }

  complete(nonce: string, guildId: string, userId: string, answer: string): HumanVerificationResult {
    const challenge = this.challenges.get(nonce);
    if (!challenge || challenge.guildId !== guildId || challenge.userId !== userId || challenge.expiresAt <= this.now()) {
      this.challenges.delete(nonce);
      return { ok: false, reason: 'EXPIRED' };
    }
    if (answer !== challenge.answer) {
      challenge.attempts++;
      if (challenge.attempts >= 3) this.challenges.delete(nonce);
      return { ok: false, reason: 'INCORRECT' };
    }
    this.challenges.delete(nonce);
    return { ok: true };
  }

  private removeExpired(): void {
    for (const [nonce, challenge] of this.challenges) if (challenge.expiresAt <= this.now()) this.challenges.delete(nonce);
    for (const [key, history] of this.starts) {
      const current = history.filter((startedAt) => startedAt > this.now() - START_WINDOW_MS);
      if (current.length) this.starts.set(key, current); else this.starts.delete(key);
    }
  }
}

async function renderVisualPuzzle(target: Shape, position: number, nonce: string, secret: string): Promise<Buffer> {
  const values = seededValues(`${nonce}:${secret}`, 32);
  const tile = (shape: Shape, x: number, y: number, highlighted = false) => `<rect x="${x}" y="${y}" width="150" height="82" rx="12" fill="#111c25" stroke="${highlighted ? '#22d3a5' : '#365166'}" stroke-width="2"/>${shapeSvg(shape, x + 75, y + 41, highlighted ? '#22d3a5' : '#d9e7f0')}`;
  const reference = `<rect x="34" y="28" width="128" height="104" rx="16" fill="#0b1620" stroke="#22d3a5" stroke-width="2"/>${shapeSvg(target, 98, 80, '#22d3a5')}`;
  const grid = Array.from({ length: 9 }, (_, index) => {
    const positionNumber = index + 1;
    const otherShapes = SHAPES.filter((shape) => shape !== target);
    const shape = positionNumber === position ? target : otherShapes[Math.floor(values[index]! * otherShapes.length)]!;
    const x = 194 + (index % 3) * 170;
    const y = 28 + Math.floor(index / 3) * 92;
    return tile(shape, x, y, positionNumber === position);
  }).join('');
  const noise = Array.from({ length: 12 }, (_, index) => `<path d="M ${Math.round(values[index + 12]! * 700)} ${Math.round(values[index + 18]! * 300)} L ${Math.round(values[index + 19]! * 700)} ${Math.round(values[index + 2]! * 300)}" stroke="#22d3a5" stroke-opacity=".14" stroke-width="2"/>`).join('');
  const svg = `<svg width="720" height="320" viewBox="0 0 720 320" xmlns="http://www.w3.org/2000/svg"><rect width="720" height="320" rx="20" fill="#071015"/>${noise}${reference}${grid}<path d="M 176 40 L 184 40 M 176 80 L 184 80 M 176 120 L 184 120" stroke="#718096" stroke-width="2"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function shapeSvg(shape: Shape, x: number, y: number, color: string): string {
  if (shape === 'circle') return `<circle cx="${x}" cy="${y}" r="23" fill="none" stroke="${color}" stroke-width="7"/>`;
  if (shape === 'square') return `<rect x="${x - 23}" y="${y - 23}" width="46" height="46" rx="5" fill="none" stroke="${color}" stroke-width="7"/>`;
  if (shape === 'triangle') return `<path d="M ${x} ${y - 27} L ${x + 27} ${y + 22} L ${x - 27} ${y + 22} Z" fill="none" stroke="${color}" stroke-width="7" stroke-linejoin="round"/>`;
  return `<path d="M ${x} ${y - 29} L ${x + 29} ${y} L ${x} ${y + 29} L ${x - 29} ${y} Z" fill="none" stroke="${color}" stroke-width="7" stroke-linejoin="round"/>`;
}

function seededValues(seed: string, count: number): number[] {
  const digest = createHash('sha512').update(seed).digest();
  return Array.from({ length: count }, (_, index) => digest[index % digest.length]! / 255);
}
