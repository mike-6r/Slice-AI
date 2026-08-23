# Slice Education + Grading Evidence + Scrollbar QA

Date: 2026-08-23  
Route: `/asset/:slug`  
Staging: https://staging.slicecollectable.com

## Scope

Focused UI-only pass for the New to Slice education strip, public Slice Grade evidence dialog, and native browser scrollbar theme. No backend, asset, ownership, trading, valuation, wallet, ledger, Stripe, Twilio, Resend, or offering state was changed.

## New to Slice

- Preserved the approved heading and copy.
- Four equal desktop steps now have semantic Lucide icons, secondary `01`–`04` numbering, aligned title/body content, dark raised surfaces, and restrained progression connectors.
- Responsive layout is four columns on desktop, two columns at tablet width, and one column on mobile.
- The info control remains a real native `details` popover and was verified open with its explanatory text.
- `Learn how Slice works` is a live link to `/how-it-works`.

## Grading evidence

The existing public-safe `sliceGrade` projection remains the only data source. The button now opens a centered Slice dialog instead of expanding the page. It displays the persisted overall estimate, qualitative label, component scores, analysed date, public-safe evidence images, and the existing non-official-grade disclaimer.

The dialog has:

- `role="dialog"`, `aria-modal`, labelled title, and description;
- close X, explicit Close button, Escape, and backdrop close behavior;
- focus placed on the close control when opened;
- Tab/Shift+Tab focus trapping;
- focus restoration to `View grading evidence` after close;
- body scroll locking while open and a themed internal native scrollbar;
- an honest no-evidence state without exposing private submission media, raw provider payloads, prompts, keys, staff notes, or debug JSON.

No separate evidence request is needed: the asset-detail API already returns signed public-safe visualization URLs. No Ximilar or other provider call was made by opening or interacting with the dialog.

## Scrollbars

Native CSS scrollbars are themed with dark charcoal tracks, visible muted teal thumbs, teal hover, emerald active state, 10px Chromium scrollbar dimensions, and Firefox `scrollbar-color`/`scrollbar-width`. No JavaScript wheel interception, custom scrollbar dependency, hidden native scrolling, or smooth-scroll behavior was added. The dialog uses the same native theme.

## Browser QA

| Viewport | Education layout | Modal | Horizontal overflow | Result |
|---|---|---|---|---|
| 1920×1080 | 4 columns | centered | none | PASS |
| 1440×900 | 4 columns | centered | none | PASS |
| 768×1024 | 2 columns | responsive | none | PASS |
| 390×844 | 1 column | 90vw sheet with internal scroll | none | PASS |

Evidence screenshots:

- [1920×1080](C:/Users/Aarons/Documents/Codex/2026-08-05/files-mentioned-by-the-user-you/work/slice-project/docs/qa/screenshots/education-final-1920.png)
- [1440×900](C:/Users/Aarons/Documents/Codex/2026-08-05/files-mentioned-by-the-user-you/work/slice-project/docs/qa/screenshots/education-final-1440.png)
- [768×1024](C:/Users/Aarons/Documents/Codex/2026-08-05/files-mentioned-by-the-user-you/work/slice-project/docs/qa/screenshots/education-final-768.png)
- [390×844](C:/Users/Aarons/Documents/Codex/2026-08-05/files-mentioned-by-the-user-you/work/slice-project/docs/qa/screenshots/education-final-390.png)
- [Open grading evidence modal](C:/Users/Aarons/Documents/Codex/2026-08-05/files-mentioned-by-the-user-you/work/slice-project/docs/qa/screenshots/education-modal-final-1440.png)

Live browser checks:

- Four steps, icons, numbering, valid link, and info popover: PASS.
- Modal opened with four public-safe images and the advisory disclaimer: PASS.
- Focus trap, Escape, close button, and focus restoration: PASS.
- Browser console errors/warnings: none.
- State mutations: 0.

## Tests

- Frontend tests: PASS — 39 files, 139 tests.
- Frontend typecheck: PASS.
- Client and SSR build: PASS.
- Targeted ESLint for `src/routes/asset.$id.tsx`: PASS.
- Full repository lint: baseline FAIL — 4,886 existing Prettier diagnostics across unrelated files; this task’s changed route passed targeted lint.
- Backend tests/typecheck: not required — no backend code changed.

## Deployment

Commit: `edfd04dba3dfcf4983d824115e4e53e6282fd479`  
VPS release: `/opt/slice/releases/20260823-edfd04dba3dfcf4983d824115e4e53e6282fd479`  
`/opt/slice/current`: points to the release above  
`/opt/slice/app`: points to the release above  
Health: PASS  
Ready: PASS  
API service: active  
Web service: active  
Public root: HTTP 200

## Final status

GO for this focused education, grading-evidence modal, and native scrollbar pass. The full lint baseline remains separately blocked by pre-existing repository-wide formatting diagnostics.
