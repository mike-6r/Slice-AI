export type GovernancePolicy = Readonly<{
  weightedVotingEnabled: boolean;
  votingPeriodMs: number;
  quorumBps: number;
  approvalBps: number;
  distributionFeeBps: number;
  version: string;
}>;

const MAX_BPS = 10_000;

function integerEnv(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  return value;
}

function booleanEnv(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${name} must be true or false.`);
}

/** User-authorized SD-015 defaults. Legal approval stays fail-closed by default. */
export function governancePolicy(): GovernancePolicy {
  return {
    weightedVotingEnabled: booleanEnv('GOVERNANCE_WEIGHTED_VOTING_ENABLED', false),
    votingPeriodMs: integerEnv('GOVERNANCE_VOTING_PERIOD_DAYS', 7, 1, 90) * 86_400_000,
    quorumBps: integerEnv('GOVERNANCE_QUORUM_BPS', 2_000, 1, MAX_BPS),
    approvalBps: integerEnv('GOVERNANCE_APPROVAL_BPS', 5_000, 1, MAX_BPS),
    distributionFeeBps: integerEnv('DISTRIBUTION_FEE_BPS', 0, 0, 1_000),
    version: process.env.GOVERNANCE_POLICY_VERSION ?? 'SD015_INITIAL_V1',
  };
}

export function feeMinor(grossMinor: bigint, bps: number) {
  return (grossMinor * BigInt(bps) + 9_999n) / 10_000n;
}

export function tallyVote(
  eligibleUnits: bigint,
  approveUnits: bigint,
  rejectUnits: bigint,
  policy: GovernancePolicy,
) {
  const castUnits = approveUnits + rejectUnits;
  const quorumMet = castUnits * 10_000n >= eligibleUnits * BigInt(policy.quorumBps);
  // Strictly greater than the configured threshold, so a tie rejects at 50%.
  const approved =
    quorumMet &&
    castUnits > 0n &&
    approveUnits * 10_000n > castUnits * BigInt(policy.approvalBps);
  return { castUnits, quorumMet, approved };
}

export type EntitlementInput = Readonly<{ id: string; units: bigint }>;

export function allocateLargestRemainder(
  netMinor: bigint,
  eligible: readonly EntitlementInput[],
) {
  const totalUnits = eligible.reduce((sum, item) => sum + item.units, 0n);
  if (netMinor < 0n || totalUnits <= 0n) throw new Error('Invalid distribution allocation.');
  const parts = eligible.map((item) => ({
    ...item,
    amountMinor: (netMinor * item.units) / totalUnits,
    remainder: (netMinor * item.units) % totalUnits,
  }));
  let remainder = netMinor - parts.reduce((sum, item) => sum + item.amountMinor, 0n);
  const ranked = [...parts].sort((a, b) => {
    if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
  const bonus = new Set<string>();
  for (const item of ranked) {
    if (remainder === 0n) break;
    bonus.add(item.id);
    remainder -= 1n;
  }
  return parts
    .map((item) => ({ id: item.id, amountMinor: item.amountMinor + (bonus.has(item.id) ? 1n : 0n), remainderRank: ranked.findIndex((rank) => rank.id === item.id) + 1 }))
    .sort((a, b) => a.remainderRank - b.remainderRank);
}
