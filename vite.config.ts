import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import { resolveDeploymentConfiguration } from "./src/config/deployment.ts";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const appEnvironment = env.VITE_APP_ENV ?? env.APP_ENV ?? "development";
  const deployment = resolveDeploymentConfiguration({
    channel: env.VITE_DEPLOYMENT_CHANNEL,
    basePath: env.VITE_PUBLIC_BASE_PATH,
  });
  if (deployment.channel === "preview") {
    const apiBase = env.VITE_API_BASE_URL?.trim();
    if (!apiBase) {
      throw new Error("Preview builds require VITE_API_BASE_URL to point at /preview.");
    }
    let parsedApiBase: URL;
    try {
      parsedApiBase = new URL(apiBase);
    } catch {
      throw new Error("Preview builds require a valid VITE_API_BASE_URL.");
    }
    if (
      !["http:", "https:"].includes(parsedApiBase.protocol) ||
      parsedApiBase.pathname.replace(/\/$/, "") !== deployment.basePath ||
      parsedApiBase.search ||
      parsedApiBase.hash
    ) {
      throw new Error("Preview VITE_API_BASE_URL must be a clean URL mounted at /preview.");
    }
  }
  return {
    base: deployment.viteBasePath,
    plugins: [
      tanstackStart({
        server: { entry: "server" },
        router: { routeFileIgnorePattern: "\\.test\\." },
      }),
      react(),
      tailwindcss(),
    ],
    define: {
      "import.meta.env.VITE_APP_ENV": JSON.stringify(appEnvironment),
      "import.meta.env.VITE_DEPLOYMENT_CHANNEL": JSON.stringify(deployment.channel),
    },
    resolve: {
      tsconfigPaths: true,
      alias:
        mode === "production"
          ? {
              "@/auth/qa-harness": path.resolve(
                import.meta.dirname,
                "src/auth/qa-harness.disabled.ts",
              ),
              "@/auth/qa-session-hooks": path.resolve(
                import.meta.dirname,
                "src/auth/qa-session-hooks.disabled.ts",
              ),
              "@/auth/QaHarnessBoundary": path.resolve(
                import.meta.dirname,
                "src/auth/QaHarnessBoundary.disabled.tsx",
              ),
            }
          : undefined,
    },
    test: {
      // Backend specs run through server/package.json; root Vitest is frontend-only.
      exclude: ["server/**", "apps/**", "node_modules/**", "dist/**"],
    },
  };
});
