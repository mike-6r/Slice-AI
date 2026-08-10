export const PUBLIC_NAV = [
  { label: "Home", to: "/" },
  { label: "Markets", to: "/marketplace" },
  { label: "Collectors", to: "/collectors" },
  { label: "Vault Live", to: "/vault-live" },
] as const;

export const PRIVATE_NAV = [
  { label: "Governance", to: "/governance" },
  { label: "Portfolio", to: "/portfolio" },
  { label: "Wallet", to: "/wallet" },
  { label: "Orders", to: "/orders" },
] as const;

export const primaryNavigationFor = (isAuthenticated: boolean) =>
  isAuthenticated ? [...PUBLIC_NAV, ...PRIVATE_NAV] : PUBLIC_NAV;

/** Replace this one local asset reference when the approved Slice mark is supplied. */
export const SLICE_LOGO_ASSET = "/favicon.png";
