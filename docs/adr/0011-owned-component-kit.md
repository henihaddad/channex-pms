# ADR-0011: An owned component kit on design tokens, no component library

Status: accepted · Date: 2026-11-07 · Supersedes ADR-0010

## Context

ADR-0010 put HeroUI v3 behind the kit in `apps/web/src/components/ui` and accepted the library's
default theme with the brand's accent. Two months in, the product owner judged the console generic
and asked for a redesign. The redesign was done first as a design canvas (46 boards, November 2026):
a dark rail of ten destinations, a header with a command palette, dense tables, pill buttons,
Bricolage Grotesque titles, and custom surfaces that no library ships: the strip calendar with
hover popover and right-click menu, the inbox with drafted replies, the automation timeline, the
import diff.

Measuring the codebase before deciding: 112 of 131 screen files import the kit; 3 files import
HeroUI; the theme file declared HeroUI's defaults "untouched". The look was decided by the library,
not by us, and matching the canvas meant overriding most of it anyway. The research in
`docs/research/2026-11-social-listening.md` adds a reason: hosts call Hospitable's app "slow as
dirt" and want speed over features, and the kit's client bundle had grown by about 130 kB for the
library's engine and translations (ADR-0010, consequences).

## Decision

The kit owns every control. No component library sits underneath it.

- `globals.css` declares the design tokens as CSS variables mapped into Tailwind v4's `@theme`:
  ground, surface, border, foreground, muted, one accent, and three state colours each with a soft
  pair, plus radii, shadows and the two typefaces. The dark scope (`.dark`, `[data-theme="dark"]`)
  redefines the same tokens for the rail and the operator console.
- Controls are native elements with the kit's classes: `<button>`, `<input>`, `<select>` (accepts
  `<option>` children, submits with the form), `<input type="checkbox">`, `<input type="date">`.
  No client JavaScript is needed to render a form, so server components render every piece and a
  page's first paint does not wait for hydration.
- Tables, cards, chips, alerts, empty states, stats and page headers are the kit's own markup.
- Interactive pieces that need focus management or portals (the command palette, popovers, menus,
  dialogs) are built in their own client files inside the kit, on small headless primitives
  (`cmdk`, `@radix-ui/*`) that carry no theme. Pages never import those packages directly (ESLint
  `no-restricted-imports`), the same rule as before.
- The e2e helpers `pickOption` and `fillDate` keep their signatures and drive the native controls.

## Consequences

- `@heroui/react`, `react-aria`, `react-aria-components`, `@react-aria/*` and
  `@internationalized/date` leave `apps/web`. `clsx` and `tailwind-merge` arrive for `cn`.
- The date field loses segmented typing and gains the browser's own picker, which reads the user's
  locale and works on phones without a library.
- The select loses type-ahead search in long lists. Lists longer than about thirty entries (a
  portfolio's properties, a guest list) get a searchable combobox in the kit when they appear.
- Every visual decision is now in the repo and reviewable: a contributor changes a token or a
  class, not a library override. This is the right shape for a fair-code product.
- Spec 14 §14.4 records the stack change; spec 04 §4.10's `packages/ui` line points at the kit.
