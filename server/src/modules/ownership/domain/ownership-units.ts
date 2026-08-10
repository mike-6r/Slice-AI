import { UnprocessableEntityException } from '@nestjs/common';

export const MAX_OWNERSHIP_UNITS = 1_000_000n;

/** Parses the deliberately narrow integer ownership-unit wire contract. */
export function parseOwnershipUnits(value: string): bigint {
  if (!/^[1-9][0-9]*$/.test(value)) throw invalidUnits();
  const units = BigInt(value);
  if (units > MAX_OWNERSHIP_UNITS) throw invalidUnits();
  return units;
}

export function invalidUnits(): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: 'INVALID_UNIT_QUANTITY',
    message: 'Ownership units must be a whole positive integer within range.',
  });
}
