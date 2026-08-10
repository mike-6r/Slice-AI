# Slice contributor rules

- Preserve strict TypeScript and inspect the existing architecture before changing it.
- Reuse design-system primitives and the shared AppShell; do not create a separate visual language per route.
- Use `src/domain` types and repository boundaries. Never hardcode large page-level datasets in route files.
- Keep backend behavior out of presentation components. Mock adapters must be clearly labelled and must not pretend to make network requests.
- Do not invent legal, regulatory, insurance, custody, security, payment, or provider claims.
- Do not present mock data, AI output, KYC status, or simulated trading as live or factual.
- Model monetary values in integer minor units at service/domain boundaries. Do not use floating point math for financial settlement.
- Preserve keyboard access, focus visibility, semantic structure, contrast, reduced-motion support, and responsive information hierarchy.
- Run `bun run typecheck`, `bun run lint`, and `bun run build` for material changes. Document important architectural changes in the README.
