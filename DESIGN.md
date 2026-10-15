---
name: PLUG / CSSBuy Calculator
description: Existing compact operational interface for costs, inventory, and advertising.
colors:
  bg: "#fafaf9"
  bg-elevated: "#ffffff"
  bg-subtle: "#f4f4f3"
  bg-muted: "#e7e5e4"
  fg: "#0c0a09"
  fg-muted: "#57534e"
  fg-subtle: "#78716c"
  border: "#e7e5e4"
  border-strong: "#d6d3d1"
  border-focus: "#0c0a09"
  accent: "#047857"
  accent-hover: "#065f46"
  accent-soft: "#ecfdf5"
  accent-border: "#a7f3d0"
  danger: "#b91c1c"
  danger-soft: "#fef2f2"
  warning: "#b45309"
  warning-soft: "#fffbeb"
  info: "#1d4ed8"
  info-soft: "#eff6ff"
typography:
  headline:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif'
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif'
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif'
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif'
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: "1rem"
    letterSpacing: "0.025em"
rounded:
  sm: "0.375rem"
  default: "0.5rem"
  lg: "0.75rem"
  xl: "1rem"
  full: "9999px"
spacing:
  space-1: "0.25rem"
  space-2: "0.5rem"
  space-3: "0.75rem"
  space-4: "1rem"
  space-5: "1.5rem"
  space-6: "2rem"
  space-8: "3rem"
components:
  button-primary:
    backgroundColor: "{colors.fg}"
    textColor: "{colors.bg}"
    rounded: "{rounded.default}"
    height: "2.25rem"
    padding: "0 0.875rem"
  button-secondary:
    backgroundColor: "{colors.bg-subtle}"
    textColor: "{colors.fg}"
    rounded: "{rounded.default}"
    height: "2.25rem"
    padding: "0 0.875rem"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.bg-elevated}"
    rounded: "{rounded.default}"
  button-ghost:
    textColor: "{colors.fg-muted}"
    rounded: "{rounded.default}"
  button-outline:
    textColor: "{colors.fg}"
    rounded: "{rounded.default}"
  input:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.fg}"
    rounded: "{rounded.default}"
    height: "2.25rem"
    padding: "0 0.75rem"
  card:
    backgroundColor: "{colors.bg-elevated}"
    rounded: "{rounded.lg}"
    padding: "1.25rem"
  badge:
    backgroundColor: "{colors.bg-muted}"
    textColor: "{colors.fg}"
    rounded: "{rounded.full}"
    padding: "0.125rem 0.625rem"
---

# Design System: PLUG / CSSBuy Calculator

## Overview

This is a code-derived record of the incumbent interface, not a new visual identity. Warm neutral surfaces, compact controls, restrained emerald accents, and dense numeric tables support the owner's daily operational work. No creative metaphor or brand adjectives have been independently approved.

**Key Characteristics:**
- Compact system typography and small uppercase field labels.
- Bordered, softly rounded surfaces with low elevation.
- Shared desktop navigation and fixed mobile navigation.
- Light and dark themes driven by the existing CSS custom properties.

Sources: `src/styles/tokens.css`, `src/app/globals.css`, `src/components/ui/{Button,Card,Input,Badge}.tsx`, `src/components/Navbar.tsx`, and `src/app/publicidad/page.tsx`. PRODUCT.md requires retaining the interface. Frontmatter colors describe the light theme; `.dark` in tokens.css remains authoritative for theme substitutions. Component previews use those live variables.

## Colors

### Primary
Emerald (`accent`) identifies active mobile navigation and positive semantic states. Soft emerald and its border support accent cards. Primary buttons instead use foreground on page background.

### Neutral
Warm paper (`bg`), white elevated surfaces, and subtle/muted layers separate page, cards, table headers, and active desktop links. Near-black foreground carries headings and primary controls; muted and subtle foregrounds distinguish supporting text. Borders remain understated.

Danger, warning, and information colors are semantic pairs with soft backgrounds. Error text on `/publicidad` uses danger. Success aliases the emerald palette in tokens.css.

## Typography

System sans is used throughout. The global body uses the body role above; `/publicidad` supporting copy and tables use Tailwind's small text (0.875rem / 1.25rem). Page and section headings use headline and title roles. Labels are uppercase. Numeric tables use tabular figures.

**The Utility Scale Rule.** The custom `--text-*` and `--space-*` scales coexist with Tailwind defaults; they are not interchangeable. For example, the page heading's `text-3xl` resolves to the headline role above, while `--text-3xl` is a different, unused value here. Card `p-5` is 1.25rem, not `--space-5`.

## Layout

The shared shell and `/publicidad` main content are centered at a maximum width of 80rem. Horizontal padding grows from 1rem to 1.5rem at 640px. The main page has 2rem top padding, 2rem section gaps, and 6rem bottom padding for mobile navigation. The locked card is capped at 32rem.

Date fields and the update action wrap naturally. Expense inputs form one column, two at 640px, and four at 1024px. Tables scroll horizontally inside bordered containers; cells use 1rem padding and monetary values stay on one line. Do not compress these tables into unreadable narrow columns.

## Elevation & Depth

Borders and tonal layers do most of the work. Default cards have the small Tailwind `shadow-xs`; elevated cards use `shadow-md`. Primary buttons and the brand tile use Tailwind `shadow-sm`. These utility shadows are distinct from the custom `--shadow-*` declarations. The sticky header and fixed mobile navigation use translucent elevated backgrounds with medium backdrop blur. Token shadow and motion values are recorded in the sidecar; preserve their distinction from utility values.

## Shapes

Medium buttons and inputs share the default radius; small and large buttons use their corresponding radii. Standard cards use the large radius, elevated cards the extra-large radius. Badges are pills. Table wrappers use Tailwind's rounded-lg (0.5rem), which differs from the custom large radius.

## Components

Buttons expose primary, secondary (default), danger, ghost, and outline variants. Sizes are 2rem, 2.25rem, and 2.75rem high. Filled actions lower opacity on hover and scale to 0.98 when pressed; secondary surfaces darken. Loading disables interaction and replaces the icon with a spinner. Disabled controls use half opacity.

Cards expose default, subtle, elevated, and accent treatments, with none/small/medium/large padding (0 / 0.75 / 1.25 / 1.5rem). Inputs use a thin border, elevated background, and border-color focus change; error state uses danger and replaces hint copy. Prefixes/suffixes reserve internal space. Global keyboard focus uses a two-pixel outline with a two-pixel offset, but Input explicitly removes the outline and changes its border.

Desktop navigation appears at 768px and highlights the current link with a muted fill and semibold text. Below that breakpoint, four equal bottom tabs use emerald for the active destination. Header height changes from 3.5rem to 4rem at 640px; the brand subtitle is hidden below that breakpoint. Theme preference persists in local storage.

`/publicidad` inherits these primitives: a private-access card, interval and expense inputs, then independent Meta-report and inventory-limit sections. Loading, empty, and error messages remain local to each section. Keep headings, explanatory copy, and table captions explicit about each section's meaning; report attribution and inventory planning estimates remain separate.

## Do's and Don'ts

### Do:
- Do reuse existing UI primitives and theme variables.
- Do retain compact labels, tabular figures, and horizontal table scrolling.
- Do reserve bottom space for the fixed mobile navigation.
- Do preserve explicit error, loading, and empty states.

### Don't:
- Don't substitute custom type or spacing tokens for similarly named Tailwind utilities without checking values.
- Don't use emerald as a replacement for the incumbent dark primary button.
- Don't imply inventory-based planning limits are attributed campaign results or net business profit.
