export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Slice recovery</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      body { display: grid; min-height: 100svh; place-items: center; margin: 0; overflow: hidden; padding: clamp(1rem, 4vw, 3rem); background: radial-gradient(circle at 50% 115%, rgba(20, 189, 149, .15), transparent 36rem), radial-gradient(circle at 8% 6%, rgba(34, 104, 124, .18), transparent 30rem), #05090b; color: #ecf8f6; }
      body::before { position: fixed; inset: 0; z-index: -1; opacity: .35; background-image: linear-gradient(rgba(143,188,183,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(143,188,183,.07) 1px, transparent 1px); background-size: 3.5rem 3.5rem; content: ""; mask-image: linear-gradient(to bottom, #000, transparent 80%); }
      main { display: grid; grid-template-columns: minmax(13rem, .7fr) minmax(0, 1.3fr); width: min(100%, 62rem); overflow: hidden; border: 1px solid rgba(139,194,185,.22); border-radius: 1.4rem; background: linear-gradient(135deg, rgba(13,27,30,.98), rgba(5,13,16,.99)); box-shadow: 0 2.5rem 8rem rgba(0,0,0,.48), inset 0 1px rgba(225,255,249,.045); }
      .signal { position: relative; display: grid; min-height: 20rem; place-items: center; overflow: hidden; border-right: 1px solid rgba(139,194,185,.13); background: linear-gradient(145deg, rgba(21,75,75,.3), rgba(5,17,21,.92) 66%); }
      .signal::before { position: absolute; width: 14.25rem; height: 14.25rem; border: 1px solid rgba(102,236,199,.2); border-top-color: rgba(115,255,214,.68); border-right-color: rgba(115,255,214,.42); border-radius: 50%; content: ""; transform: rotate(-24deg); }
      .beacon { display: grid; z-index: 1; width: 5.5rem; height: 5.5rem; place-items: center; border: 1px solid rgba(103,242,205,.62); border-radius: 1.25rem; background: linear-gradient(135deg, rgba(58,244,194,.26), rgba(24,90,84,.44)); box-shadow: 0 0 0 .6rem rgba(48,226,183,.05), 0 1rem 3rem rgba(0,0,0,.34); color: #8ff8d9; font-size: 1.8rem; font-weight: 700; transform: rotate(45deg); }
      .beacon span { transform: rotate(-45deg); }
      .coordinate { position: absolute; bottom: 2rem; left: 2rem; color: rgba(140,215,201,.66); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .6rem; font-weight: 700; letter-spacing: .13em; }
      .content { padding: clamp(2rem, 6vw, 5.25rem); }
      .eyebrow { display: flex; align-items: center; gap: .58rem; margin: 0 0 1rem; color: #60e2bf; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .64rem; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; }
      .eyebrow::before { width: 1.8rem; height: 1px; background: currentColor; content: ""; }
      h1 { max-width: 10ch; margin: 0; color: #f2fbf9; font-size: clamp(2.35rem, 5vw, 4.5rem); letter-spacing: -.065em; line-height: .95; }
      p { max-width: 34rem; margin: 1.4rem 0 0; color: #9eb8b4; font-size: .94rem; line-height: 1.68; }
      .actions { display: flex; flex-wrap: wrap; gap: .7rem; margin-top: 2rem; }
      a { display: inline-flex; min-height: 2.85rem; align-items: center; justify-content: center; padding: .7rem 1rem; border: 1px solid rgba(150,197,190,.24); border-radius: .58rem; color: #d5e8e4; font-size: .76rem; font-weight: 750; text-decoration: none; transition: transform .16s ease, border-color .16s ease, background .16s ease; }
      a:first-child { border-color: #61dfbd; background: linear-gradient(135deg, #76e8c7, #38c9a9); box-shadow: 0 .65rem 1.8rem rgba(28,193,155,.18); color: #05211c; }
      a:hover { border-color: rgba(111,231,198,.54); background: rgba(91,221,185,.1); transform: translateY(-2px); }
      a:first-child:hover { background: linear-gradient(135deg, #88efd1, #41d3b2); }
      .note { color: #617d78; font-size: .68rem; }
      @media (max-width: 640px) { body { align-items: start; padding: .75rem; } main { grid-template-columns: 1fr; margin-top: .5rem; border-radius: 1rem; } .signal { min-height: 12.5rem; border-right: 0; border-bottom: 1px solid rgba(139,194,185,.13); } .coordinate { bottom: 1.1rem; left: 1.25rem; } .content { padding: 2rem 1.35rem 1.65rem; } h1 { font-size: clamp(2.45rem, 12vw, 3.6rem); } .actions a { width: 100%; } }
    </style>
  </head>
  <body>
    <main>
      <div class="signal" aria-hidden="true">
        <div class="beacon"><span>!</span></div>
        <span class="coordinate">RECOVERY / 01</span>
      </div>
      <div class="content">
        <div class="eyebrow">Slice system recovery</div>
        <h1>A small detour, not a dead end.</h1>
        <p>This view could not load. Retry safely, or return to Slice and continue from a fresh page.</p>
      <div class="actions">
          <a href="">Retry this view</a>
          <a href="/">Return to Slice</a>
        </div>
        <p class="note">Your account state is not changed by this recovery screen.</p>
      </div>
    </main>
  </body>
</html>`;
}
