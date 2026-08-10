import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  plugins: [
    tanstackStart({
      server: { entry: "server" },
      router: { routeFileIgnorePattern: "\\.test\\." },
    }),
    react(),
    tailwindcss(),
  ],
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
}));
