import { appPath, isPreviewEnvironment } from "@/config/environment";

export const PUBLIC_NAV = [
  { label: "Home", to: "/" },
  { label: "Markets", to: "/marketplace" },
  { label: "Collectors", to: "/collectors" },
] as const;

export const PRIVATE_NAV = [
  { label: "Portfolio", to: "/portfolio" },
  { label: "Wallet", to: "/wallet" },
] as const;

export const PREVIEW_NAV = [{ label: "Drops", to: "/drops" }] as const;

export const primaryNavigationFor = (isAuthenticated: boolean, preview = isPreviewEnvironment) => [
  ...PUBLIC_NAV,
  ...(preview ? PREVIEW_NAV : []),
  ...(isAuthenticated ? PRIVATE_NAV : []),
];

/** Replace this one local asset reference when the approved Slice mark is supplied. */
export const SLICE_LOGO_ASSET = appPath("/favicon.png");
