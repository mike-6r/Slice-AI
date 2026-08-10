import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { ProviderCircuitState, ProviderFailureKind } from '../domain/provider.types';

type Circuit = { state: ProviderCircuitState; failures: number; openedAt: number | null; probeActive: boolean };
/** In-process, bounded development authority; production must replace this with durable operational state. */
@Injectable()
export class ProviderResilienceService {
  private readonly circuits = new Map<string, Circuit>();
  private readonly threshold = 3;
  private readonly cooldownMs = 30_000;
  /** A bounded retry policy for callers that elect to retry transient provider failures. */
  readonly maxImmediateAttempts = 3;
  beforeOutbound(provider: string) {
    const circuit = this.current(provider);
    if (circuit.state === 'OPEN' && Date.now() - (circuit.openedAt ?? 0) >= this.cooldownMs) circuit.state = 'HALF_OPEN';
    if (circuit.state === 'OPEN' || (circuit.state === 'HALF_OPEN' && circuit.probeActive)) throw new ServiceUnavailableException({ code: 'PROVIDER_CIRCUIT_OPEN', message: 'Provider operation is temporarily unavailable.' });
    if (circuit.state === 'HALF_OPEN') circuit.probeActive = true;
  }
  success(provider: string) { this.circuits.set(provider, { state: 'CLOSED', failures: 0, openedAt: null, probeActive: false }); }
  failure(provider: string, kind: ProviderFailureKind) {
    const circuit = this.current(provider); circuit.probeActive = false;
    // Configuration/authentication, validation, and explicit provider rejections are
    // not transient transport failures.  They must fail closed without retry pressure.
    if (kind === 'AUTHENTICATION' || kind === 'VALIDATION' || kind === 'REJECTED') return;
    circuit.failures += 1;
    if (circuit.state === 'HALF_OPEN' || circuit.failures >= this.threshold) { circuit.state = 'OPEN'; circuit.openedAt = Date.now(); }
  }
  state(provider: string) { const current = this.current(provider); return current.state; }
  retryDelayMs(attempt: number, random: () => number = Math.random) {
    const baseDelayMs = Math.min(10_000, 100 * 2 ** Math.max(0, attempt - 1));
    const jitterCeilingMs = Math.min(1_000, baseDelayMs);
    return baseDelayMs + Math.floor(Math.max(0, Math.min(0.999_999, random())) * jitterCeilingMs);
  }
  private current(provider: string) { let value = this.circuits.get(provider); if (!value) { value = { state: 'CLOSED', failures: 0, openedAt: null, probeActive: false }; this.circuits.set(provider, value); } return value; }
}
