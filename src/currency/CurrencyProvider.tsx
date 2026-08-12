import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useSession } from "@/auth/use-session";
import type { CurrencyRates, SupportedCurrency } from "@/data/repositories";
import { useAppServices } from "@/providers/AppServicesProvider";
import { queryKeys } from "@/queries/keys";
import {
  asSupportedCurrency,
  formatAuthoritativeMoney,
  formatDisplayMoney,
} from "./currency-presentation";
import { setCurrencyPresentation } from "./currency-store";

const storageKey = "slice.display-currency";
type CurrencyContextValue = {
  currency: SupportedCurrency;
  rates: CurrencyRates | null;
  ratesAvailable: boolean;
  setCurrency: (currency: SupportedCurrency) => void;
  formatMoney: (
    valueInMinorUnits: number | string | bigint,
    sourceCurrency?: SupportedCurrency,
    options?: Intl.NumberFormatOptions,
  ) => string;
  formatAuthoritativeGbp: (valueInMinorUnits: number | string | bigint) => string;
};

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: "GBP",
  rates: null,
  ratesAvailable: false,
  setCurrency: () => undefined,
  formatMoney: (amount, source = "GBP", options = {}) =>
    formatDisplayMoney(amount, source, "GBP", null, options),
  formatAuthoritativeGbp: (amount) => formatAuthoritativeMoney(amount, "GBP", "GBP", null),
});

function browserCurrency() {
  if (typeof window === "undefined") return "GBP" as const;
  return asSupportedCurrency(window.localStorage.getItem(storageKey)) ?? "GBP";
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useSession();
  const { repositories } = useAppServices();
  const queryClient = useQueryClient();
  const [currency, setCurrencyState] = useState<SupportedCurrency>(browserCurrency);
  const preferences = useQuery({
    queryKey: queryKeys.account.preferences,
    queryFn: repositories.account.getPreferences,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
  const rates = useQuery({
    queryKey: ["currency", "rates"],
    queryFn: () => repositories.currency?.getRates() ?? Promise.resolve(null),
    staleTime: 6 * 60 * 60 * 1000,
    retry: 1,
  });
  const persist = useMutation({
    mutationFn: repositories.account.updatePreferences,
    onSuccess: (next) => {
      queryClient.setQueryData(queryKeys.account.preferences, next);
      queryClient.setQueryData(queryKeys.user.current, (current: unknown) => {
        if (!current || typeof current !== "object") return current;
        const user = current as { profile?: Record<string, unknown> };
        return user.profile
          ? { ...user, profile: { ...user.profile, preferredCurrency: next.preferredCurrency } }
          : user;
      });
    },
    onError: () => {
      const saved = preferences.data?.preferredCurrency ?? browserCurrency();
      setCurrencyState(saved);
      if (typeof window !== "undefined") window.localStorage.setItem(storageKey, saved);
    },
  });

  useEffect(() => {
    if (isAuthenticated && preferences.data?.preferredCurrency) {
      setCurrencyState(preferences.data.preferredCurrency);
      window.localStorage.setItem(storageKey, preferences.data.preferredCurrency);
      return;
    }
    if (!isAuthenticated) setCurrencyState(browserCurrency());
  }, [isAuthenticated, preferences.data?.preferredCurrency]);

  const setCurrency = useCallback(
    (next: SupportedCurrency) => {
      setCurrencyState(next);
      if (typeof window !== "undefined") window.localStorage.setItem(storageKey, next);
      if (isAuthenticated) persist.mutate({ preferredCurrency: next });
    },
    [isAuthenticated, persist],
  );
  const value = useMemo<CurrencyContextValue>(
    () => ({
      currency,
      rates: rates.data ?? null,
      ratesAvailable: Boolean(rates.data),
      setCurrency,
      formatMoney: (amount, source = "GBP", options = {}) =>
        formatDisplayMoney(amount, source, currency, rates.data, options),
      formatAuthoritativeGbp: (amount) =>
        formatAuthoritativeMoney(amount, "GBP", currency, rates.data),
    }),
    [currency, rates.data, setCurrency],
  );
  setCurrencyPresentation(currency, rates.data ?? null);
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
