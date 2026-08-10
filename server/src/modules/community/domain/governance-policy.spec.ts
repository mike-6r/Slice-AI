import { allocateLargestRemainder, feeMinor, governancePolicy, tallyVote } from './governance-policy';

const policy = { weightedVotingEnabled: true, votingPeriodMs: 1, quorumBps: 2_000, approvalBps: 5_000, distributionFeeBps: 0, version: 'test' };

describe('Document 015 governance policy', () => {
  it('fails a tie and requires the configured quorum', () => {
    expect(tallyVote(100n, 10n, 10n, policy)).toMatchObject({ quorumMet: true, approved: false });
    expect(tallyVote(100n, 10n, 0n, policy)).toMatchObject({ quorumMet: false, approved: false });
  });
  it('uses exact GBP fee and largest-remainder allocation', () => {
    expect(feeMinor(101n, 100)).toBe(2n);
    const lines = allocateLargestRemainder(10n, [{ id: 'b', units: 1n }, { id: 'a', units: 2n }]);
    expect(lines.reduce((sum, line) => sum + line.amountMinor, 0n)).toBe(10n);
    expect(lines.find((line) => line.id === 'a')?.amountMinor).toBe(7n);
  });
  it('conserves awkward and very large integer proceeds with stable remainder ordering', () => {
    for (const [amount, units] of [
      [1n, [1n, 1n, 1n]],
      [7n, [1n, 1n, 1n]],
      [9_223_372_036_854_775n, [3n, 5n, 7n]],
    ] as const) {
      const allocation = allocateLargestRemainder(amount, units.map((unit, index) => ({ id: `owner-${index}`, units: unit })));
      expect(allocation.reduce((sum, line) => sum + line.amountMinor, 0n)).toBe(amount);
      expect(allocation.map((line) => line.remainderRank)).toEqual([1, 2, 3]);
    }
  });
  it('keeps beneficial-owner voting fail-closed unless the approved policy switch is explicit', () => {
    const original = process.env.GOVERNANCE_WEIGHTED_VOTING_ENABLED;
    delete process.env.GOVERNANCE_WEIGHTED_VOTING_ENABLED;
    expect(governancePolicy().weightedVotingEnabled).toBe(false);
    process.env.GOVERNANCE_WEIGHTED_VOTING_ENABLED = 'true';
    expect(governancePolicy().weightedVotingEnabled).toBe(true);
    if (original === undefined) delete process.env.GOVERNANCE_WEIGHTED_VOTING_ENABLED;
    else process.env.GOVERNANCE_WEIGHTED_VOTING_ENABLED = original;
  });
});
