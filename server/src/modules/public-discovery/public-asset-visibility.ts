import type { Prisma } from '@prisma/client';
import { publicBetaAssetWhere } from '../../config/beta-policy';

/**
 * The single public catalogue gate shared by Markets and Collectors.
 *
 * An active Pre-Sale is public catalogue inventory even while its underlying
 * asset is still in the draft intake state. Normal catalogue inventory must
 * still be explicitly published. Neither path bypasses the beta boundary or
 * an operational freeze.
 */
export function publicDiscoverableAssetWhere(
  isBeta: boolean | undefined,
): Prisma.AssetWhereInput {
  return {
    ...publicBetaAssetWhere(isBeta),
    AND: [
      {
        OR: [
          { preSale: { is: { status: 'ACTIVE' } } },
          { status: 'PUBLISHED' },
        ],
      },
      {
        OR: [
          { operationalControl: { is: { status: 'ACTIVE' } } },
          { operationalControl: { is: null } },
        ],
      },
    ],
  };
}

export function publicPreSaleAssetWhere(
  isBeta: boolean | undefined,
): Prisma.AssetWhereInput {
  return {
    ...publicBetaAssetWhere(isBeta),
    preSale: { is: { status: 'ACTIVE' } },
    OR: [
      { operationalControl: { is: { status: 'ACTIVE' } } },
      { operationalControl: { is: null } },
    ],
  };
}
