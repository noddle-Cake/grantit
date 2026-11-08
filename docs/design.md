# Design guidelines

Grantit follows Apple's [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines)
(HIG), applied to a web app. The visual language is a HubSpot-style CRM base with Luma-inspired accents
(navy rail, orange primary actions, gradient covers, date tiles). The rules below decide how that language
behaves. Each rule names the HIG page it comes from and where the app implements or checks it.

**Before merging UI work:** `npm run check` and `npm run build` pass, the screen works with the keyboard
alone, and it looks right in both light and dark appearance. Check at a narrow width (320 CSS pixels),
with touch targets, and at 200% browser zoom. The DOM tests cover behavior; they do not replace browser QA.

## Color and contrast

*HIG: [Color](https://developer.apple.com/design/human-interface-guidelines/color),
[Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)*

- **Use tokens, never raw colors.** All colors are tokens in `web/src/index.css` (`bg-surface`,
  `text-slate-2`, `bg-accent`…). Hard-coded hex values in components are limited to the always-dark rail,
  toasts and logo.
- **Text contrast is at least 4.5:1** against its background, in light, dark and Increase Contrast modes.
  `web/scripts/check-contrast.mjs` reads the tokens and fails `npm run check` (and CI) if a registered pair
  drops below that. Its coverage includes text on status fills, not just page and card backgrounds. Add
  new pairs to its list when you introduce them; this is a token check, not an automatic scan of rendered UI.
- **Form-control boundaries reach 3:1.** Use `border-control-line` for fields and selects, reserving the
  softer `line` tokens for decorative dividers. The checker tests boundaries against all three surfaces.
  This web-specific rule comes from [WCAG non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
- **Text on a colored background uses a token made for it.** White labels on orange use `--color-accent`.
  `--color-brand` (#ff7a59) is decorative only (covers, the active-nav bar, dots, icons beside text), because
  white or orange text on it can't reach 4.5:1.
- **One meaning per color.** Orange marks primary actions and things that are due soon. Blue (`link`) marks
  links and information. Green, amber and red mean good, approaching a limit, and over or failed, everywhere.
- **Never use color alone.** Status uses `StatusPill` (icon + label) or `Pill` with a dot and text. Meters
  always sit next to the numbers they show. Flags carry a text label.

## Dark Mode and Increase Contrast

*HIG: [Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)*

- **Follow the system appearance by default.** Settings > Appearance offers System, Light and Dark, stored
  in this browser only. The choice resolves to `<html data-theme="light|dark">` before first paint (an inline
  script in `index.html`), and `:root[data-theme='dark']` swaps the token values. `color-scheme` follows
  `data-theme` so native controls and scrollbars match.
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

- **The most important content goes first.** Page header with the main action, then the task content.
  Summary stats belong only where they help someone decide what to do next.
- **Group related things** in cards and sections, and use progressive disclosure (collapsible record
  sections, "See all" links) instead of showing everything at once.
- **Layouts adapt to width, not device.** Grids collapse to one column, the rail becomes a drawer below
  `lg`, and wide tables scroll horizontally inside their card rather than the page.
- **Allow controls to wrap.** Card headers, segmented controls and drawer footers wrap; grant dates stack
  on narrow screens. Modals fit the dynamic viewport and scroll internally so the last action is reachable.

## Controls and targets

*HIG: [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons),
[Accessibility › Mobility](https://developer.apple.com/design/human-interface-guidelines/accessibility#Mobility)*

- **Buttons are at least 32px tall; icon buttons are at least 28px.** On coarse pointers, buttons, fields,
  navigation links and checkbox labels have at least 44px targets. The shared rule in `index.css` includes
  plain HTML controls, close buttons and cover pickers; `Button` also has `pointer-coarse:h-11`.
- **One primary button per view**, for the most likely action. Others are secondary or tertiary. Size never
  signals preference; style does.
- **Every button has a press state** (`active:brightness-95`) and a visible keyboard focus ring
  (`:focus-visible` in `index.css`; white on the rail).
- **Icon-only controls have an `aria-label`**, including the collapsed rail's links.

## Keyboard and assistive technology

*HIG: [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility),
[Keyboards](https://developer.apple.com/design/human-interface-guidelines/keyboards)*

- **Every action works without a pointer.** A clickable table row also offers a real review button. CSV
  import has a focusable file-chooser button alongside drag and drop. Editing actions stay visible on touch.
- **Name every field and describe its hints.** `Field` connects the visible label with `htmlFor` and gives
  hints their own `aria-describedby`. Search, filter, grant and configuration controls also have names;
  placeholders alone are insufficient.
- **Expose selected and expanded states.** Filters and segmented controls use `aria-pressed`;
  disclosures use `aria-expanded`. Closed navigation is hidden, not merely translated offscreen.
- **Tabs have one Tab stop.** Left/Right wrap; Home/End select an edge. Every tab names an existing panel,
  and each panel names its tab. See the [web tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/).
- **Search keeps typing focus in its input.** Up/Down choose results, Enter opens one and Escape dismisses
  results. `aria-activedescendant` exposes the highlighted option; a live region announces matches or an
  empty result. See the [web combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/).
- **Make repeated navigation skippable.** A skip link targets `main`. Changing pages moves focus to main
  content. The user switcher closes on Escape or when focus leaves and restores its trigger on selection.

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
- **Prefer Undo to "are you sure?"** Deleting a fact shows an Undo toast that stays until it is used or
  explicitly dismissed. Recovery actions must not expire while someone is reaching them. Resetting all
  browser data requires a separate confirmation that explains what will be lost and initially focuses Cancel.
- **When an action can't run, say why**, e.g. a disabled Save while required fields are empty, or the
  "missing information" chips on drafts.
- **Show something right away:** pages render an announced loading skeleton while their code loads, and
  drafting announces its progress. CSV import errors use an alert region.

## Modality

*HIG: [Modality](https://developer.apple.com/design/human-interface-guidelines/modality)*

- **Use a drawer or modal for a short, focused task** (edit a fact, allocate a transaction, create a grant,
  import). Navigation stays in the rail on wide screens; its temporary narrow-screen drawer uses modality
  to keep keyboard and screen-reader navigation within the open rail, without nesting another flow.
- **Every modal names its task:** a `Drawer` title, or a `Modal` `label`. It has `role="dialog"` and
  `aria-modal`.
- **Always provide an obvious way out:** close button, Escape, or clicking the backdrop.
- **Use native modality.** `Dialog` in `Overlays.tsx` opens an HTML `<dialog>` with `showModal()`, making
  the background inert and containing document focus. Initial focus prefers an enabled field (including
  checking parent fieldsets); closing restores the opener, or main content if the opener is gone or hidden.
  Escape, the close control and a click that starts and ends on the backdrop dismiss the task. Dragging
  from task content onto the backdrop does not discard it.
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

## Find & apply scope

This workspace focuses on discovering funding and preparing applications:

- **Opportunities** shows recommendations, funding ranges, deadlines, funder requirements, the listing's
  source and focus areas. Fit reads as "3 of 4 focus areas" (what the match measures), not a percentage.
  Supporting facts sit behind “Why this matches.” The application pipeline lives on Applications.
- **Applications** shows the next step, who takes it ("Your turn" or "Waiting on <name>"), the owner, and
  how many answers are ready (written, within limit, supported and approved), with separate views for work
  in progress, submitted applications and declined applications, and a Mine filter. Rows sort by the
  soonest application deadline regardless of stage. Continue opens the first question with the problem
  (`#q-<id>`, which the application tab scrolls to and focuses). Rows wrap on narrow screens.
- **Knowledge base** opens with **Needed now** (`shared/src/needs.ts`): what applications in progress and
  recommended opportunities are waiting on, soonest deadline first. Gaps are computed live from each
  unapproved question's prompt, so they clear as soon as a covering fact is approved. Each item offers the
  action that clears it: Approve, Submit for approval, Add fact (topic filled in), or who it's waiting on.
  Below it are fact search, category and approval filters, editing and approval. The list opens on Needs
  approval when the viewer can approve a waiting fact, listing what they can approve first, then by impact.
  Each fact shows its impact (`shared/src/fact-impact.ts`): "Unblocks 1 application · Strengthens 2 matches
  · Used in 3 answers". When two or more listed facts can be approved, checkboxes and "Approve N facts"
  approve them together, with Undo restoring each fact's previous status. Finance and organization facts not
  updated in 12 months show "Over a year old". Placeholder writing-style and document-upload panels are
  omitted until functional.
- **Badges and to-dos point at action.** The Applications nav badge counts in-progress applications due
  within 14 days that aren't ready (`shared/src/applications.ts`); Opportunities has no badge. Home's
  to-dos use the same next step as the Applications list.
- **Application records** show requested funding, owner, application deadlines, questions and application
  setup. Award dates, fiscal years, shared-cost allocation, approved budgets and spending appear for funded
  stages. Changing a record to Awarded reveals that workspace's controls; saved award data is retained.
- **New prospects** need a name, funder and requested amount, with an optional application deadline.
  Award setup is confirmed after funding is awarded.

Refinement uses the existing tokens and controls, informed by
[Better UI](https://www.ui-skills.com/skills/jakubkrehel/better-ui). Workflow tests cover discovery,
status filtering, prospect creation, saving application details without changing award data, and revealing
finance controls after award. Browser visual checks for this refinement remain outstanding because the
browser access host was unavailable; the earlier checks below describe the earlier HIG pass only.

## Audit record: November 7, 2026

The initial HIG pass shipped in [PR #92](https://github.com/noddle-Cake/grantit/pull/92). A follow-up found
functional gaps beyond that pass's visual and token changes:

| Gap | Implementation |
| --- | --- |
| Search selection, CSV browsing and transaction review required a mouse | Keyboard combobox, file-chooser button, review buttons |
| Tabs and segmented controls lacked keyboard selection and announced state | Arrow/Home/End navigation, one Tab stop, panel associations, named groups |
| Offscreen navigation remained reachable; mobile navigation lacked dismissal and focus handling | Hidden desktop rail below `lg`; native modal mobile rail with close control and breakpoint cleanup |
| Custom dialog focus handling could choose hidden or disabled controls; background was still available to assistive technology | Native dialog modality, eligible initial fields, focus restoration, internal scrolling |
| Hints became part of field names; several controls had no names | Explicit labels, descriptions and names throughout forms and filters |
| Warning text and field borders were not covered by contrast checks | Secondary text adjusted; 51 text pairs at 4.5:1 and 3 control-boundary pairs at 3:1, in four appearances |
| Undo expired after eight seconds; reset immediately overwrote all browser data | Persistent Undo with explicit dismissal; separate reset confirmation |
| White configuration backgrounds and invisible save buttons remained in dark mode and the tab order | Surface tokens and conditional save actions; responsive headers, forms and footers |

Regression tests run in `npm run check -w web` using Testing Library and JSDOM. They cover keyboard
selection, dialog lifecycle and initial focus, labels and hints, search, mobile navigation, transaction
review, reset confirmation, persistent Undo and grant validation. JSDOM stubs the native dialog API;
background inertness, browser focus handling and visual layout require browser checks.

Browser checks for this follow-up used Chrome: Opportunities in light and emulated dark appearance;
the grant modal and mobile navigation at 320px with touch emulation; reset confirmation in narrow light
appearance; and Settings and keyboard search at 200% zoom. Native modal background exclusion and
Escape returning to the opener were verified through Chrome's accessibility tree. These checks do not
constitute a complete VoiceOver or cross-browser certification.
