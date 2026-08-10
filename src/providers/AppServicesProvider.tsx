import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { AppRepositories } from "@/data/repositories";
import { createHttpRepositories } from "@/repositories/http-repositories";
import { createAppServices, type AppServices } from "@/services";

// API mode is the safe default in every environment. Mock data is available
// only when a developer explicitly opts in with VITE_DATA_SOURCE=mock.
const source = import.meta.env.VITE_DATA_SOURCE ?? "api";
if (source !== "api" && source !== "mock") {
  throw new Error("VITE_DATA_SOURCE must be either 'api' or 'mock'.");
}
/**
 * Production defaults to the HTTP repositories. The mock module is dynamically loaded only when
 * a developer explicitly selects `VITE_DATA_SOURCE=mock`; API mode never imports or falls back to
 * its simulated market, portfolio, or order data.
 */
const defaultRepositories: AppRepositories =
  source === "mock"
    ? (await import("@/mocks/repositories")).mockRepositories
    : createHttpRepositories();
const defaultServices = createAppServices(defaultRepositories);
const AppServicesContext = createContext<AppServices>(defaultServices);

export function AppServicesProvider({
  children,
  repositories = defaultRepositories,
}: {
  children: ReactNode;
  repositories?: AppRepositories;
}) {
  const services = useMemo(() => createAppServices(repositories), [repositories]);
  return <AppServicesContext.Provider value={services}>{children}</AppServicesContext.Provider>;
}

export function useAppServices() {
  return useContext(AppServicesContext);
}
