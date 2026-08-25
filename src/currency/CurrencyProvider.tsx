import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
const cookieKey = "slice_display_currency";
type CurrencyContextValue = {
  currency: SupportedCurrency;
  rates: CurrencyRates | null;
  ratesAvailable: boolean;
  setCurrency: (currency: SupportedCurrency) => void;
  preferenceError: string | null;
  formatMoney: (
    valueInMinorUnits: number | string | bigint,
    sourceCurrency?: SupportedCurrency,
    options?: Intl.NumberFormatOptions,
  ) => string;
  formatSourceMoney: (
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
  preferenceError: null,
  formatMoney: (amount, source = "GBP", options = {}) =>
    formatDisplayMoney(amount, source, "GBP", null, options),
  formatSourceMoney: (amount, source = "GBP", options = {}) =>
    formatDisplayMoney(amount, source, source, null, options),
  formatAuthoritativeGbp: (amount) => formatAuthoritativeMoney(amount, "GBP", "GBP", null),
});

function browserCurrency() {
  if (typeof window === "undefined") return "GBP" as const;
  const cookieValue = document.cookie
    .split(";")
    .map((item) => {
      const [key, value] = item.trim().split("=", 2);
      return key === cookieKey ? value : null;
    })
    .find((value): value is string => Boolean(value));
  return (
    asSupportedCurrency(cookieValue) ??
    asSupportedCurrency(window.localStorage.getItem(storageKey)) ??
    "GBP"
  );
}

function persistBrowserCurrency(currency: SupportedCurrency) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, currency);
  document.cookie = `${cookieKey}=${currency}; Max-Age=31536000; Path=/; SameSite=Lax`;
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useSession();
  const { repositories } = useAppServices();
  const queryClient = useQueryClient();
  // SSR and the first browser render must agree. Local storage is applied in
  // the effect below after hydration, rather than while React is hydrating the
  // footer's currency selector.
  const [currency, setCurrencyState] = useState<SupportedCurrency>("GBP");
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const persistedCurrency = useRef<SupportedCurrency>("GBP");
  const pendingCurrency = useRef<SupportedCurrency | null>(null);
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
  const persist = useMutation({ mutationFn: repositories.account.updatePreferences });

  useEffect(() => {
    if (isAuthenticated && preferences.data?.preferredCurrency) {
      const saved = preferences.data.preferredCurrency;
      persistedCurrency.current = saved;
      if (!pendingCurrency.current) setCurrencyState(saved);
      persistBrowserCurrency(saved);
      return;
    }
    if (!isAuthenticated) {
      const saved = browserCurrency();
      persistedCurrency.current = saved;
      pendingCurrency.current = null;
      setCurrencyState(saved);
    }
  }, [isAuthenticated, preferences.data?.preferredCurrency]);

  const setCurrency = useCallback(
    (next: SupportedCurrency) => {
      if (next === currency || next === pendingCurrency.current) return;
      setCurrencyState(next);
      setPreferenceError(null);
      persistBrowserCurrency(next);
      if (!isAuthenticated) {
        persistedCurrency.current = next;
        return;
      }
      if (next === persistedCurrency.current && !pendingCurrency.current) return;

      pendingCurrency.current = next;
      persist.mutate(
        { preferredCurrency: next },
        {
          onSuccess: (saved) => {
            if (pendingCurrency.current !== next) return;
            persistedCurrency.current = saved.preferredCurrency;
            queryClient.setQueryData(queryKeys.account.preferences, saved);
            queryClient.setQueryData(queryKeys.user.current, (current: unknown) => {
              if (!current || typeof current !== "object") return current;
              const user = current as { profile?: Record<string, unknown> };
              return user.profile
                ? {
                    ...user,
                    profile: { ...user.profile, preferredCurrency: saved.preferredCurrency },
                  }
                : user;
            });
            pendingCurrency.current = null;
            setCurrencyState(saved.preferredCurrency);
            persistBrowserCurrency(saved.preferredCurrency);
          },
          onError: () => {
            if (pendingCurrency.current !== next) return;
            pendingCurrency.current = null;
            setCurrencyState(persistedCurrency.current);
            persistBrowserCurrency(persistedCurrency.current);
            setPreferenceError("Unable to save your display currency. Please try again.");
          },
        },
      );
    },
    [currency, isAuthenticated, persist, queryClient],
  );
  const value = useMemo<CurrencyContextValue>(
    () => ({
      currency,
      rates: rates.data ?? null,
      ratesAvailable: Boolean(rates.data),
      setCurrency,
      preferenceError,
      formatMoney: (amount, source = "GBP", options = {}) =>
        formatDisplayMoney(amount, source, currency, rates.data, options),
      formatSourceMoney: (amount, source = "GBP", options = {}) =>
        formatDisplayMoney(amount, source, source, rates.data, options),
      formatAuthoritativeGbp: (amount) =>
        formatAuthoritativeMoney(amount, "GBP", currency, rates.data),
    }),
    [currency, preferenceError, rates.data, setCurrency],
  );
  setCurrencyPresentation(currency, rates.data ?? null);
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
