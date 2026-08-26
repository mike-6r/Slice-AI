# Package and version policy

Slice has three valid, independently installed Node package roots: frontend
root, `server`, and `apps/discord-bot`. Each owns its lockfile. Use Node.js 22
LTS and `npm ci` in every root; do not use a root install to satisfy a nested
package.

| Rule | Policy |
| --- | --- |
| Install order | Root, server, and Discord can be installed independently; CI installs each from its own lockfile. |
| Lockfiles | Change only the lockfile belonging to the package whose manifest changed. |
| Shared tooling | Keep TypeScript, ESLint, Prettier, Vitest, and Zod drift deliberate and documented. Align during a dedicated dependency wave when compatibility or maintenance warrants it. |
| Prisma | The backend and Discord generated clients must both generate and validate successfully from `server/prisma/schema.prisma`. |
| Prisma seam | Backend and Discord use `^6.19.3`. Generate the backend default client and Discord generator independently from the shared schema. |
| Upgrades | Run clean installs, typechecks, tests, builds, and Prisma validation for every affected root. Do not combine upgrades with feature/refactor work. |

No workspace/monorepo conversion or unreviewed framework upgrade is authorised by this policy. Dependency removals require an import/configuration audit and independent-root validation.
