# ADR-0010: HeroUI v3 behind a kit module

Status: accepted · Date: 2026-09-03

## Context

The console was hand-assembled screen by screen: native selects and date inputs, inconsistent
control heights, tables without a design, and labels in two languages on one page. Spec 14 planned
shadcn/ui + Radix in `packages/ui`, which never materialised beyond eight ad-hoc components. The
product owner asked for a strict component system so every screen reads as one product, and
accepted the component library's own theme with the brand's accent.

## Decision

`@heroui/react` 3.x (React Aria Components styled with Tailwind v4) is the component system of
`apps/web`. It is used only through the kit in `apps/web/src/components/ui`:

- The kit exposes a small, plain-props API (`Button`, `Field`, `Select` that accepts `<option>`
  children, `DateInput`, `Card`, `Chip`, `Alert`, `EmptyState`, `DataTable`, `Stat`, `Facts`,
  `PageHeader`, `FormRow`, …). Props are strings, booleans and elements so server components can
  render every piece; the client boundary lives inside HeroUI.
- Tables are server-rendered markup carrying HeroUI's BEM table classes: the same look as
  HeroUI's `Table` with no client JavaScript and no collection constraints.
- Pages never import `@heroui/react` or React Aria directly (ESLint `no-restricted-imports`).
- The theme is HeroUI's default. The brand contributes `--accent` (a teal readable on white),
  the display and body typefaces, and the logo. The sidebar and operator console sit in HeroUI's
  dark scope.
- The guest booking engine keeps native controls for the search form's numbers and checkboxes but
  uses the kit's date picker, buttons and cards.
- Playwright drives HeroUI selects and date fields through `apps/web/e2e/ui.ts`
  (`pickOption`, `fillDate`), which retry once so a click before hydration is not lost.

## Consequences

- Client JavaScript per console page rose from about 145 kB to about 277 kB compressed
  (`scratchpad/jsweight` measurement on the local production build): React Aria's engine and its
  bundled translations, shared across pages and cached after the first load. Server rendering,
  time to first byte and the 400-row calendar grid (custom, virtualised) are unchanged. Reducing
  it further needs `@react-aria/optimize-locales-plugin`, which supports webpack but not the
  Turbopack build the app uses; revisit when Turbopack gains a hook.
- `packages/ui` from spec 04 §4.10 is superseded by the kit inside the app; spec 14 §14.4 records
  the stack change.
- HeroUI v3 is young. The kit is the one place to absorb API changes, and a component the catalog
  lacks is composed from React Aria Components inside the kit.
