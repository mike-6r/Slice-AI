import { InternalServerErrorException } from '@nestjs/common';

export type OpenLot = Readonly<{
  id: string;
  acquiredAt: Date;
  acquiredUnits: bigint;
  remainingUnits: bigint;
  totalCostMinor: bigint;
  allocatedCostMinor: bigint;
}>;

export type FifoAllocation = Readonly<{
  lotId: string;
  units: bigint;
  allocatedCostMinor: bigint;
}>;

/** Allocates cost deterministically by acquiredAt, then opaque lot ID. */
export function allocateFifoLots(
  lots: readonly OpenLot[],
  requestedUnits: bigint,
): FifoAllocation[] {
  if (requestedUnits <= 0n)
    throw lotUnderflow('Disposal units must be positive.');
  let remaining = requestedUnits;
  const allocations: FifoAllocation[] = [];
  for (const lot of [...lots].sort(compareLots)) {
    if (remaining === 0n) break;
    if (lot.remainingUnits <= 0n) continue;
    const units =
      lot.remainingUnits < remaining ? lot.remainingUnits : remaining;
    const remainingCost = lot.totalCostMinor - lot.allocatedCostMinor;
    if (remainingCost < 0n)
      throw lotUnderflow('Lot cost basis is inconsistent.');
    const allocatedCostMinor =
      units === lot.remainingUnits
        ? remainingCost
        : (remainingCost * units) / lot.remainingUnits;
    allocations.push({ lotId: lot.id, units, allocatedCostMinor });
    remaining -= units;
  }
  if (remaining !== 0n) throw lotUnderflow('Lots do not contain enough units.');
  return allocations;
}

function compareLots(left: OpenLot, right: OpenLot) {
  const time = left.acquiredAt.getTime() - right.acquiredAt.getTime();
  return time || left.id.localeCompare(right.id);
}

function lotUnderflow(message: string): never {
  throw new InternalServerErrorException({ code: 'LOT_UNDERFLOW', message });
}
