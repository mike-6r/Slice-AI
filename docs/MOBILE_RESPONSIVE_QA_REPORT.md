# Mobile and responsive QA report

Date: 2026-08-10  
Scope: frontend API mode only. No mock-mode switch, backend change, test-user creation, or data mutation was performed.

## Browser evidence

The local application was inspected in the real in-app browser at its active 1280px viewport. The browser viewport capability was also explicitly requested for 375, 390, 430, 768, 820, 1024, and 1280px. On this host, the capability acknowledged each request but the browser continued to report `window.innerWidth === 1280`; it therefore cannot be represented as a genuine mobile-device render result. This is recorded plainly rather than treating a desktop render as mobile proof.

At the actual 1280px browser viewport:

| Surface | Routes | Checks | Result |
| --- | --- | ---: | --- |
| Public | `/`, `/marketplace`, `/collectors`, `/vault-live`, `/login`, `/signup`, asset detail fallback, collector detail fallback | 56 route/width audit attempts | No document-level horizontal overflow and no broken images |
| Authenticated/workspace guards | `/dashboard`, `/portfolio`, `/wallet`, `/orders`, `/governance`, account routes, `/list`, `/staff`, `/collector-workspace`, `/operations` | 126 route/width audit attempts | No document-level horizontal overflow and no broken images |

The protected routes correctly presented their safe unauthenticated state in this browser session; no existing user account, password, session, or database record was accessed for this QA pass.

## Confirmed fixes included in this responsive pass

### Homepage featured asset

- Root cause: the static showcase’s outer card was shorter than its display and market-panel contents, letting the panel overflow its approved composition.
- Fix: constrained the showcase geometry and aligned the desktop two-panel layout, with the base grid naturally stacking below the `768px` breakpoint.
- Browser result at 1280px: the featured module is 680px wide by 232px high; its display window is 232px square and contained, with no horizontal page overflow.

### Signup

- Root cause: the decorative collectible composition could expand into the marketing copy/form area at intermediate desktop widths.
- Fix: constrained the signup shell to a two-column `minmax` grid, clamped the hero title and image dimensions, and uses a single-column layout below its responsive breakpoint.
- Browser result at 1280px: the hero and form have separate measured bounds with no overlap; the form remains 384px wide and the collectible is contained inside the marketing column.

## Shared responsive implementation audit

The frontend has 26 explicit relevant responsive breakpoints across the main stylesheet. The following implementation paths were inspected:

| Area | Responsive behaviour verified in source |
| --- | --- |
| Global navigation | Desktop navigation changes to an accessible hamburger, search trigger, and compact account actions below `xl`; interactive icon wrappers are 36–40px. |
| Global containers/footer | Shared shells use responsive gutters; footer navigation is grid-based rather than a fixed-width row. |
| Account center | Sidebar becomes a static multi-column navigation at `1160px`, then progressively two and one column; account grids reduce from multi-column to one column. |
| Portfolio | KPIs reduce at `1100px` and `720px`; the holdings table intentionally becomes semantic card rows at `720px`, preserving data rather than widening the page. |
| Wallet | KPI and operational grids reduce at `1240px`, `1024px`, `768px`, and `520px`; movement tables retain their internal wrapper. |
| Orders/governance/staff/collector workspace | Route styles use responsive grids and internal table wrappers rather than forcing page-width tables. |
| List an asset | The left stepper and preview cease being fixed sidebars at tablet widths; the form and actions reduce to a one-column flow on small screens. |
| Forms and dialogs | Inputs use available width; compact action rows and stacked account/security lists prevent vertical word fragmentation. |

## Follow-up required for device-proof completion

The responsive CSS paths are present and no real-browser desktop regression, page overflow, or broken image was found. A host-browser viewport override must function before a truthful 375/390/430/768/820/1024 screenshot sweep can be attached. The current in-app browser capability did not apply its documented size override, so that mobile visual certification is **not claimed** by this report.

## Quality gates

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed with 8 existing Fast Refresh warnings and no errors |
| `npm test` | 30 suites / 93 tests passed |
| `npm run build` | Passed (client and SSR builds) |
