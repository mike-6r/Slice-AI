import type { Prisma } from '@prisma/client';
import { publicBetaAssetWhere } from '../../config/beta-policy';

/**
 * The single public catalogue gate shared by Markets and Collectors.
 *
 * An active Pre-Sale is public catalogue inventory even when its final
 * publication record is still blocked. Normal catalogue inventory must still
 * be explicitly published. Neither path bypasses the catalogue status, beta
 * boundary, or an operational freeze.
 */
export function publicDiscoverableAssetWhere(
  isBeta: boolean | undefined,
): Prisma.AssetWhereInput {
  return {
    status: 'PUBLISHED',
    ...publicBetaAssetWhere(isBeta),
    AND: [
      {
        OR: [
          { preSale: { is: { status: 'ACTIVE' } } },
          { publication: { is: { status: 'PUBLISHED' } } },
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
    status: 'PUBLISHED',
    ...publicBetaAssetWhere(isBeta),
    preSale: { is: { status: 'ACTIVE' } },
    OR: [
      { operationalControl: { is: { status: 'ACTIVE' } } },
      { operationalControl: { is: null } },
    ],
  };
}
