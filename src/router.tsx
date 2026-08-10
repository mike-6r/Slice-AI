import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";

import { installQaHarness } from "@/auth/qa-harness";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  installQaHarness();
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
