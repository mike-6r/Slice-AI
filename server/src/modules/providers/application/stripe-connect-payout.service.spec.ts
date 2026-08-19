import { ForbiddenException } from '@nestjs/common';
import { mapConnectAccountStatus, StripeConnectPayoutService } from './stripe-connect-payout.service';

describe('StripeConnectPayoutService', () => {
  const account = (requirements: Record<string, unknown>, capabilities: Record<string, unknown>, detailsSubmitted = true, payoutsEnabled = false) => ({ details_submitted: detailsSubmitted, payouts_enabled: payoutsEnabled, requirements, capabilities }) as never;

  it('does not treat onboarding completion alone as payout readiness', () => {
    expect(mapConnectAccountStatus(account({ currently_due: [], past_due: [], pending_verification: [], errors: [], disabled_reason: null }, { transfers: 'active' }))).toBe('RESTRICTED');
    expect(mapConnectAccountStatus(account({ currently_due: [], past_due: [], pending_verification: [], errors: [], disabled_reason: null }, { transfers: 'active' }, true, true))).toBe('READY');
  });

  it('maps safe Stripe requirement states', () => {
    expect(mapConnectAccountStatus(account({ currently_due: ['individual.verification.document'], past_due: [], pending_verification: [], errors: [], disabled_reason: null }, { transfers: 'pending' }, false))).toBe('ACTION_REQUIRED');
    expect(mapConnectAccountStatus(account({ currently_due: [], past_due: [], pending_verification: ['individual.verification'], errors: [], disabled_reason: null }, { transfers: 'pending' }))).toBe('UNDER_REVIEW');
    expect(mapConnectAccountStatus(account({ currently_due: [], past_due: ['individual.verification'], pending_verification: [], errors: [], disabled_reason: 'requirements.past_due' }, { transfers: 'inactive' }))).toBe('DISABLED');
  });

  it('requires the collector role before exposing payout setup', async () => {
    const service = new StripeConnectPayoutService({} as never, {} as never, {} as never, {} as never);
    await expect(service.status({ roles: ['USER'], userId: 'u-1' } as never)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
