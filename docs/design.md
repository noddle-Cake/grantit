# Design guidelines

Grantit follows Apple's [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines)
(HIG), applied to a web app. The visual language is a HubSpot-style CRM base with Luma-inspired accents
(navy rail, orange primary actions, gradient covers, date tiles). The rules below decide how that language
behaves. Each rule names the HIG page it comes from and where the app implements or checks it.

**Before merging UI work:** `npm run check` passes (it includes the contrast check), the screen works with
the keyboard alone, and it looks right in both light and dark appearance.

## Color and contrast

*HIG: [Color](https://developer.apple.com/design/human-interface-guidelines/color),
[Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)*

- **Use tokens, never raw colors.** All colors are tokens in `web/src/index.css` (`bg-surface`,
  `text-slate-2`, `bg-accent`…). Hard-coded hex values in components are limited to the always-dark rail,
  toasts and logo.
- **Text contrast is at least 4.5:1** against its background, in light, dark and Increase Contrast modes.
  `web/scripts/check-contrast.mjs` reads the tokens and fails `npm run check` (and CI) if any pair the UI
  uses drops below that. Add new pairs to its list when you introduce them.
- **Text on a colored background uses a token made for it.** White labels on orange use `--color-accent`.
  `--color-brand` (#ff7a59) is decorative only (covers, the active-nav bar, dots, icons beside text), because
  white or orange text on it can't reach 4.5:1.
- **One meaning per color.** Orange marks primary actions and things that are due soon. Blue (`link`) marks
  links and information. Green, amber and red mean good, approaching a limit, and over or failed, everywhere.
- **Never use color alone.** Status uses `StatusPill` (icon + label) or `Pill` with a dot and text. Meters
  always sit next to the numbers they show. Flags carry a text label.

## Dark Mode and Increase Contrast

*HIG: [Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)*

- **Follow the system appearance**, with no in-app light/dark switch. `prefers-color-scheme: dark` swaps the
  token values, and `<meta name="color-scheme">` lets native controls and scrollbars follow.
- **Dark values aren't inversions.** Backgrounds get dimmer, and text and status colors get brighter. Each
  pair is checked separately.
- **`prefers-contrast: more`** promotes tertiary text to secondary and darkens borders.
- **Cards and panels use `bg-surface`**, not `bg-white`. Translucent white (`bg-white/10`) is only for hover
  states on the dark rail.

## Typography

*HIG: [Typography](https://developer.apple.com/design/human-interface-guidelines/typography)*

- **One typeface, Lexend Deca, at weights 400–700.** No light weights.
- **Sizes are in `rem`**, so text follows the browser's text-size setting and stays usable at 200% zoom. The
  body is `0.875rem` (14px).
- **Nothing smaller than 11px** (`text-[0.6875rem]`), and that size only for labels like chips and date tiles.
- **Hierarchy comes from size, weight and the three text tokens:** `slate` (primary), `slate-2`
  (secondary), `slate-3` (metadata).

## Layout

*HIG: [Layout](https://developer.apple.com/design/human-interface-guidelines/layout)*

- **The most important content goes first.** Page header with the main action, then summary stats, then
  detail.
- **Group related things** in cards and sections, and use progressive disclosure (collapsible record
  sections, "See all" links) instead of showing everything at once.
- **Layouts adapt to width, not device.** Grids collapse to one column, the rail becomes a drawer below
  `lg`, and wide tables scroll horizontally inside their card rather than the page.

## Controls and targets

*HIG: [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons),
[Accessibility › Mobility](https://developer.apple.com/design/human-interface-guidelines/accessibility#Mobility)*

- **Buttons are at least 32px tall, and 44px on touch screens** (`pointer-coarse:h-11` in `Button`). Icon
  buttons are at least 28px.
- **One primary button per view**, for the most likely action. Others are secondary or tertiary. Size never
  signals preference; style does.
- **Every button has a press state** (`active:brightness-95`) and a visible keyboard focus ring
  (`:focus-visible` in `index.css`; white on the rail).
- **Icon-only controls have an `aria-label`**, including the collapsed rail's links.

## Motion

*HIG: [Motion](https://developer.apple.com/design/human-interface-guidelines/motion)*

- **Motion explains something:** a drawer slides in from the side it lives on, a modal or toast pops in,
  a skeleton shimmers while loading. Keep it under 200ms and don't animate frequent interactions.
- **`prefers-reduced-motion: reduce`** cuts animations and transitions to effectively zero. Nothing depends
  on motion to make sense.

## Feedback and loading

*HIG: [Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback),
[Loading](https://developer.apple.com/design/human-interface-guidelines/loading)*

- **Show status where it applies:** flags on the transaction, readiness on the application row, approval
  state on the fact.
- **Confirm completed actions with a toast.** Toasts sit in a polite live region, so screen readers announce
  them.
- **Prefer Undo to "are you sure?"** Deleting a fact shows an Undo toast instead of a warning. Warn only
  before data loss people wouldn't expect.
- **When an action can't run, say why**, e.g. a disabled Save while required fields are empty, or the
  "missing information" chips on drafts.
- **Show something right away:** pages render a skeleton while their code loads, and drafting shows its
  progress.

## Modality

*HIG: [Modality](https://developer.apple.com/design/human-interface-guidelines/modality)*

- **Use a drawer or modal only for a short, focused task** (edit a fact, allocate a transaction, create a
  grant, import), never for navigation.
- **Every modal names its task:** a `Drawer` title, or a `Modal` `label`. It has `role="dialog"` and
  `aria-modal`.
- **Always provide an obvious way out:** close button, Escape, or clicking the backdrop.
- **Keyboard focus moves into the modal, stays there, and returns to the opener on close** (`useDialog`
  in `Overlays.tsx`).
- **Never stack modals.**

## Writing

*HIG: [Writing](https://developer.apple.com/design/human-interface-guidelines/writing)*

- **Buttons and links start with a verb:** "Add to pipeline", "Generate draft", "Dismiss", "Review in
  Spending →".
- **Use sentence case** everywhere except proper names and acronyms.
- **Use plain, specific words** with no jargon: "Over budget", not "Variance exceeded". Use possessives
  sparingly ("Pipeline", not "My pipeline").
- **Empty states say what to do next,** for example "Add a prospect from Opportunities to start one."
- **Error and blocked states say why and what fixes it.**
