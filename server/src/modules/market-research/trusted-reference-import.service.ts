import { Injectable, Optional } from '@nestjs/common';
import { MarketProviderRegistry } from '../market/market-provider.registry';

export type ReferenceImportStatus =
  | 'MATCH_FOUND'
  | 'PARTIAL_MATCH'
  | 'COULD_NOT_IDENTIFY'
  | 'UNSUPPORTED'
  | 'PROVIDER_UNAVAILABLE';

type ImportedIdentity = Record<string, string>;

type CustomerReference = {
  provider: string;
  externalReferenceId: string | null;
  normalizedUrl: string;
  originalTitle: string | null;
  importedAt: string;
  matchQuality: 'MATCH_FOUND' | 'PARTIAL_MATCH';
  extractedIdentity: ImportedIdentity;
};

type ReferenceImport = {
  status: ReferenceImportStatus;
  message: string;
  provider: string | null;
  identity: ImportedIdentity;
  customerReference: CustomerReference | null;
};

const trustedHosts = new Map<string, 'PRICECHARTING' | 'EBAY'>([
  ['pricecharting.com', 'PRICECHARTING'],
  ['www.pricecharting.com', 'PRICECHARTING'],
  ['m.pricecharting.com', 'PRICECHARTING'],
  ['ebay.com', 'EBAY'],
  ['www.ebay.com', 'EBAY'],
  ['ebay.co.uk', 'EBAY'],
  ['www.ebay.co.uk', 'EBAY'],
]);

const priceChartingCards: Record<string, ImportedIdentity> = {
  'pokemon-base-set/charizard-1st-edition-4': {
    categorySlug: 'pokemon-tcg',
    name: 'Charizard',
    manufacturer: 'The Pokémon Company',
    year: '1999',
    set: 'Pokemon Base Set',
    cardNumber: '4',
    playerOrCharacter: 'Charizard',
    edition: '1st Edition',
    variant: 'Holo',
  },
  'pokemon-evolving-skies/umbreon-vmax-215': {
    categorySlug: 'pokemon-tcg',
    name: 'Umbreon VMAX',
    manufacturer: 'The Pokémon Company',
    year: '2021',
    set: 'Evolving Skies',
    cardNumber: '215/203',
    playerOrCharacter: 'Umbreon',
    variant: 'Alternate Art',
  },
  'pokemon-obsidian-flames/charizard-ex-223': {
    categorySlug: 'pokemon-tcg',
    name: 'Charizard ex',
    manufacturer: 'The Pokémon Company',
    year: '2023',
    set: 'Obsidian Flames',
    cardNumber: '223/197',
    playerOrCharacter: 'Charizard',
    variant: 'Special Illustration Rare',
  },
  'pokemon-scarlet-&-violet-promo/pikachu-with-grey-felt-hat-85': {
    categorySlug: 'pokemon-tcg',
    name: 'Pikachu with Grey Felt Hat',
    manufacturer: 'The Pokémon Company',
    year: '2023',
    set: 'Pokémon x Van Gogh Museum Promo',
    cardNumber: '085',
    playerOrCharacter: 'Pikachu',
    variant: 'Grey Felt Hat',
  },
  'hockey-2023-upper-deck/connor-bedard-451': {
    categorySlug: 'sports-cards',
    name: 'Connor Bedard Young Guns',
    manufacturer: 'Upper Deck',
    year: '2023-24',
    set: 'Upper Deck Series 2',
    cardNumber: '451',
    playerOrCharacter: 'Connor Bedard',
    variant: 'Young Guns',
  },
  'pokemon-evolving-skies/rayquaza-vmax-218': {
    categorySlug: 'pokemon-tcg',
    name: 'Rayquaza VMAX',
    manufacturer: 'The Pokémon Company',
    year: '2021',
    set: 'Evolving Skies',
    cardNumber: '218/203',
    playerOrCharacter: 'Rayquaza',
    variant: 'Alternate Art',
  },
};
const priceChartingProductIds: Record<string, string> = {
  'pokemon-base-set/charizard-1st-edition-4': '715593',
};

/**
 * URL-only, provider-specific import. It deliberately never fetches a user
 * supplied URL: no redirects, provider payloads, or arbitrary hosts enter the
 * Slice network. A licensed/API-backed eBay adapter can replace the explicit
 * unavailable response when credentials are configured.
 */
@Injectable()
export class TrustedReferenceImportService {
  constructor(@Optional() private readonly providers?: MarketProviderRegistry) {}

  identify(rawUrl: string): ReferenceImport {
    const parsed = parseTrustedUrl(rawUrl);
    if (!parsed) {
      return {
        status: 'UNSUPPORTED',
        message:
          "This source isn't supported yet. You can still enter the card manually.",
        provider: null,
        identity: {},
        customerReference: null,
      };
    }
    if (parsed.provider === 'EBAY') {
      return {
        status: 'PROVIDER_UNAVAILABLE',
        message:
          "We couldn't access that source right now. Try again or enter the card manually.",
        provider: 'eBay',
        identity: {},
        customerReference: null,
      };
    }

    const key = decodeURIComponent(
      parsed.pathname.slice('/game/'.length).replace(/\/+$/, ''),
    ).toLowerCase();
    const providerProductId =
      parsed.searchParams.get('id')?.match(/^\d+$/)?.[0] ?? priceChartingProductIds[key] ?? key;
    const identity = priceChartingCards[key];
    if (!identity) {
      const partial = partialIdentity(key);
      return {
        status: partial ? 'PARTIAL_MATCH' : 'COULD_NOT_IDENTIFY',
        message: partial
          ? 'We found some details. Please confirm the remaining information.'
          : "We couldn't reliably identify this collectible from the link.",
        provider: 'PriceCharting',
        identity: partial ?? {},
        customerReference: partial
          ? {
              provider: 'PriceCharting',
              externalReferenceId: providerProductId,
              normalizedUrl: parsed.toString(),
              originalTitle: null,
              importedAt: new Date().toISOString(),
              matchQuality: 'PARTIAL_MATCH',
              extractedIdentity: partial,
            }
          : null,
      };
    }
    const normalizedUrl = parsed.toString();
    const originalTitle = `${identity.year} ${identity.set} ${identity.name} #${identity.cardNumber}`;
    return {
      status: 'MATCH_FOUND',
      message: 'PriceCharting found this exact product. Check the details, then continue.',
      provider: 'PriceCharting',
      identity,
      customerReference: {
        provider: 'PriceCharting',
        externalReferenceId: providerProductId,
        normalizedUrl,
        originalTitle,
        importedAt: new Date().toISOString(),
        matchQuality: 'MATCH_FOUND',
        extractedIdentity: identity,
      },
    };
  }

  async identifyLive(rawUrl: string): Promise<ReferenceImport> {
    const imported = this.identify(rawUrl);
    if (
      imported.provider !== 'PriceCharting' ||
      !imported.customerReference ||
      !/^\d+$/.test(imported.customerReference.externalReferenceId ?? '')
    )
      return imported;
    const provider = this.providers?.get('PRICECHARTING');
    if (!provider?.getProduct || !(await provider.health()).configured)
      return imported;
    try {
      const product = await provider.getProduct(
        imported.customerReference.externalReferenceId!,
      );
      const identity = {
        ...imported.identity,
        ...(product.title ? { name: product.title } : {}),
        ...(product.set ? { set: product.set } : {}),
        ...(product.year ? { year: String(product.year) } : {}),
        ...(product.upc ? { upc: product.upc } : {}),
      };
      return {
        ...imported,
        status: 'MATCH_FOUND',
        message: 'PriceCharting confirmed this product.',
        identity,
        customerReference: {
          ...imported.customerReference,
          originalTitle: product.title || imported.customerReference.originalTitle,
          extractedIdentity: identity,
        },
      };
    } catch {
      return {
        ...imported,
        status: 'PROVIDER_UNAVAILABLE',
        message: 'PriceCharting is temporarily unavailable. You can enter the card manually.',
      };
    }
  }
}

function partialIdentity(key: string): ImportedIdentity | undefined {
  const [setSlug, cardSlug] = key.split('/');
  if (!setSlug || !cardSlug) return undefined;
  const title = cardSlug
    .replace(/-\d+(?:-\d+)?$/, '')
    .split('-')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
  if (!title) return undefined;
  return {
    name: title,
    set: setSlug
      .split('-')
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(' '),
    ...(cardSlug.match(/-(\d+(?:-\d+)?)$/)?.[1]
      ? { cardNumber: cardSlug.match(/-(\d+(?:-\d+)?)$/)![1] }
      : {}),
  };
}

function parseTrustedUrl(
  rawUrl: string,
): (URL & { provider: 'PRICECHARTING' | 'EBAY' }) | undefined {
  try {
    const parsed = new URL(rawUrl.trim());
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      !trustedHosts.has(parsed.hostname.toLowerCase())
    )
      return undefined;
    const provider = trustedHosts.get(parsed.hostname.toLowerCase())!;
    if (provider === 'PRICECHARTING' && !parsed.pathname.startsWith('/game/'))
      return undefined;
    if (provider === 'PRICECHARTING') {
      parsed.hostname = 'www.pricecharting.com';
      parsed.hash = '';
      const id = parsed.searchParams.get('id')?.match(/^\d+$/)?.[0];
      parsed.search = id ? `?id=${id}` : '';
    }
    return Object.assign(parsed, { provider });
  } catch {
    return undefined;
  }
}
