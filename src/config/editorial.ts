/**
 * Editorial placement only. API mode resolves this ID through the public asset API;
 * no catalogue or market values are embedded in the client.
 */
export const editorial = {
  featuredAssetId: import.meta.env.VITE_FEATURED_ASSET_ID?.trim() || null,
} as const;
