import { formatOwnershipPercent } from '../../ownership/domain/ownership-percent';

export type PublicOwnershipBreakdownCategory = {
  key:
    | 'COLLECTOR_RETAINED'
    | 'INVESTOR_OWNED'
    | 'OFFERING_INVENTORY'
    | 'PLATFORM_INVENTORY'
    | 'ESCROWED_SUPPLY'
    | 'EXTERNAL_SUPPLY'
    | 'UNALLOCATED_ISSUED';
  label: string;
  units: string;
  tone: 'retained' | 'owned' | 'available' | 'inventory' | 'unallocated';
};

export type PublicOwnershipPosition = {
  settledUnits: bigint;
  account: {
    type: 'USER' | 'TREASURY' | 'INITIAL_OFFERING' | 'ESCROW' | 'EXTERNAL';
    userId: string | null;
  };
};

export function buildPublicOwnershipBreakdown(input: {
  issuedUnits: bigint;
  listedUnits: bigint;
  positions: PublicOwnershipPosition[];
  originatingCollectorUserId?: string;
}) {
  const settledBy = (
    predicate: (position: PublicOwnershipPosition) => boolean,
  ) =>
    input.positions.reduce(
      (sum, position) =>
        predicate(position) ? sum + position.settledUnits : sum,
      0n,
    );
  const collectorRetained = input.originatingCollectorUserId
    ? settledBy(
        (position) =>
          position.account.type === 'USER' &&
          position.account.userId === input.originatingCollectorUserId,
      )
    : 0n;
  const investorOwned = settledBy(
    (position) =>
      position.account.type === 'USER' &&
      position.account.userId !== input.originatingCollectorUserId,
  );
  const offeringInventory = settledBy(
    (position) => position.account.type === 'INITIAL_OFFERING',
  );
  const platformInventory = settledBy(
    (position) => position.account.type === 'TREASURY',
  );
  const escrowedSupply = settledBy(
    (position) => position.account.type === 'ESCROW',
  );
  const externalSupply = settledBy(
    (position) => position.account.type === 'EXTERNAL',
  );
  const categories: PublicOwnershipBreakdownCategory[] = [
    ...(collectorRetained > 0n
      ? [
          {
            key: 'COLLECTOR_RETAINED' as const,
            label: 'Collector retained',
            units: collectorRetained.toString(),
            tone: 'retained' as const,
          },
        ]
      : []),
    ...(investorOwned > 0n
      ? [
          {
            key: 'INVESTOR_OWNED' as const,
            label: 'Investor owned',
            units: investorOwned.toString(),
            tone: 'owned' as const,
          },
        ]
      : []),
    ...(offeringInventory > 0n
      ? [
          {
            key: 'OFFERING_INVENTORY' as const,
            label: 'Available offering inventory',
            units: offeringInventory.toString(),
            tone: 'available' as const,
          },
        ]
      : []),
    ...(platformInventory > 0n
      ? [
          {
            key: 'PLATFORM_INVENTORY' as const,
            label: 'Platform inventory',
            units: platformInventory.toString(),
            tone: 'inventory' as const,
          },
        ]
      : []),
    ...(escrowedSupply > 0n
      ? [
          {
            key: 'ESCROWED_SUPPLY' as const,
            label: 'Escrowed supply',
            units: escrowedSupply.toString(),
            tone: 'inventory' as const,
          },
        ]
      : []),
    ...(externalSupply > 0n
      ? [
          {
            key: 'EXTERNAL_SUPPLY' as const,
            label: 'External supply',
            units: externalSupply.toString(),
            tone: 'inventory' as const,
          },
        ]
      : []),
  ];
  const categorizedUnits = categories.reduce(
    (sum, category) => sum + BigInt(category.units),
    0n,
  );
  const unallocated =
    input.issuedUnits > categorizedUnits
      ? input.issuedUnits - categorizedUnits
      : 0n;
  if (unallocated > 0n) {
    categories.push({
      key: 'UNALLOCATED_ISSUED',
      label: 'Unallocated issued units',
      units: unallocated.toString(),
      tone: 'unallocated',
    });
  }
  const reconciledUnits = categories.reduce(
    (sum, category) => sum + BigInt(category.units),
    0n,
  );
  return {
    semantics: 'SETTLED_OWNERSHIP' as const,
    categories,
    reconciles: reconciledUnits === input.issuedUnits,
    issuedUnits: input.issuedUnits.toString(),
    categorizedUnits: reconciledUnits.toString(),
    listedAvailability: {
      units: input.listedUnits.toString(),
      percentage:
        input.issuedUnits > 0n
          ? formatOwnershipPercent(input.listedUnits, input.issuedUnits)
          : 'Not yet available',
      relationship:
        offeringInventory > 0n
          ? ('SEPARATE_INVENTORY' as const)
          : ('SUBSET_OF_OWNERSHIP_BUCKET' as const),
    },
  };
}
