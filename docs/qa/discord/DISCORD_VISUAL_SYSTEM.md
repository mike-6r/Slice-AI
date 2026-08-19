# Slice Discord Visual System

Slice Discord uses a restrained product surface that matches Slice: near-black Discord chrome, cool charcoal surfaces, a mint public accent, and slate staff accent. It avoids decorative gradients, rainbow role colors, emoji-heavy copy, and finance hype.

## Core language

- Public/info: `#3CCFB4` mint
- Success: `#5DBE8A` muted green
- Warning: `#C89C54` muted amber
- Error: `#C76A6A` controlled red
- Staff: `#6F8FA6` cool slate
- Footer: `Slice • Collectibles, shared differently.`

The shared `SliceEmbed` builder provides the footer, palette, and compact eyebrow/title/description anatomy. Eyebrows are concise section labels; descriptions remain short and structured only when structure helps.

## Components

- Primary buttons begin an important user flow.
- Success is reserved for a confirmed positive action, including verification.
- Secondary buttons navigate or explain.
- Danger is used only for destructive confirmation.
- Link buttons open Slice or another approved external destination.
- Selects are used for path choices such as support categories and notification preferences; labels must describe the next action.

Permanent panels are setup-managed, persisted, and edited in place. They use no automatic timestamp and no unnecessary image. The standard wide banner ratio, when an approved branded image is added later, is 1600 × 500 with a mobile-safe center crop.

`🎛️・roles` is the canonical notification-preference panel. It uses a single multi-select with the stable `slice:roles:notifications` route; the setup repository persists both its managed channel resource and canonical panel message ID. It is not a role-management surface: only eight Discord-side notification preferences are eligible.

## Accessibility and mobile

Labels never depend on color or emoji alone. Permanent panels keep the answer to “what is this, what matters, what can I do?” visible without horizontal scanning. Essential information is not placed in wide tables or dense multi-column fields.

## Copy and status

Copy is calm, factual, and plain-English. Discord is a companion surface: it does not create financial truth, promises of returns, trades, ownership, or account authority. Data status wording is `LIVE`, `DELAYED`, `TEST`, or `UNAVAILABLE` only when it is authoritative.
