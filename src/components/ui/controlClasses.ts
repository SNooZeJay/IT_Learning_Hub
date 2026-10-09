/**
 * One definition of each control's classes.
 *
 * These strings used to be written out again in every view that had a search box,
 * a select, a Refresh button or a status pill — twenty-odd near-identical literals
 * that had drifted apart. Four of them disagreed about something visible: the search
 * input was `rounded` (4px) while the select sitting next to it on the same row was
 * `rounded-md` (8px), so the two controls in one filter bar had different corners.
 * Another four were still on the old TailAdmin greys (`border-gray-300`,
 * `text-gray-900`, `placeholder:text-gray-400`) while the rest of the app had moved
 * to the Notion ramp, and `text-gray-500` secondary copy measured 4.17:1 on the app
 * surface, below the 4.5:1 AA asks of 14px text.
 *
 * DESIGN.md fixes the geometry this encodes: inputs and buttons are 8px
 * (`rounded.md`), cards are 12px (`rounded.lg`), and pills are reserved for status
 * badges. `main.css` fixes the palette: `hairline-strong` for a control border,
 * `canvas` for the surface, `slate` as the lightest step safe for small text, and
 * `muted`/`stone` for decoration only.
 *
 * A view that needs to differ composes rather than forks:
 * `[textInputClass, 'py-1.5 text-xs']` keeps the border, radius, colours and focus
 * ring and changes only the density.
 */

/**
 * Field label. `charcoal` rather than `gray-700`: it is the same warm step, named
 * the way the rest of the app names it.
 */
export const fieldLabelClass = 'mb-1.5 block text-sm font-medium text-charcoal dark:text-gray-300'

/**
 * The label above a control in a filter bar.
 *
 * One step down from `fieldLabelClass` at 12px, because a filter bar holds three or
 * four of these side by side and 14px labels on every one of them out-shout the
 * results they filter.
 */
export const filterLabelClass = 'mb-1 block text-xs font-medium text-slate'

/**
 * Text input and textarea.
 *
 * `placeholder:text-slate`, not `placeholder:text-muted`. `muted` is #a4a097, which
 * is 2.6:1 on white — main.css's own note rules it out of body-sized copy, and a
 * placeholder is body-sized copy. `slate` is 6.8:1 and still obviously not the value.
 */
export const textInputClass =
  'w-full rounded-md border border-hairline-strong bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-slate transition-colors focus:border-brand-500 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white/[0.03]'

/**
 * The same field, with room for a leading search glyph.
 *
 * 44px of inset rather than the 40px the search box used to reserve, because the
 * icon sits at `start-3` (12px) and a 16px glyph ends at 28px; 36px was clearing it
 * by 8px, which reads as the text being pushed off-centre rather than as padding.
 */
export const searchInputClass = `${textInputClass} ps-9 pe-3`

/**
 * Textarea.
 *
 * The same field as `textInputClass` with looser leading, for the places a paragraph of
 * text is expected: a lesson's summary, an assignment's instructions, a quiz question.
 * Body leading is 1.55 (see `main.css`), and a textarea inherits `normal` from the UA
 * stylesheet rather than it, so without this a multi-line field set tight while the
 * prose above and below it sat loose.
 *
 * It is a composition rather than a fourth literal because a textarea that drifts from
 * the inputs beside it is the same defect as a search box that drifts from the select
 * beside it - which is what `searchInputClass` exists to end.
 */
export const textareaClass = `${textInputClass} leading-relaxed`

/**
 * Full-width select, for a filter bar.
 *
 * `appearance-none` plus an inline SVG chevron. A native select paints its own arrow in
 * the platform's style, which made it the one control on the page that ignored the
 * design system - and on a dark surface it read as a foreign widget dropped into the
 * middle of the form. Removing the native arrow and drawing one as a background image
 * puts it back under the app's own control language, and it follows light and dark
 * because the two themes name a different stroke.
 *
 * The chevron is a background-image rather than a sibling element on purpose: every one
 * of these selects is a bare `<select>` carrying a class, and asking twenty-eight call
 * sites to wrap each one would be twenty-eight edits to make one decision.
 *
 * `ps-3 pe-9` rather than `pl-3 pr-9`, so the reserved space for the chevron is on the
 * end side in RTL too - the arrow belongs to the trailing edge, which is the start edge
 * when the document is mirrored.
 *
 * The open list itself is painted by the operating system and cannot be styled from CSS.
 * That part is not ours to change; what this controls is the closed control, which is
 * what is on screen the rest of the time.
 */
export const selectClass = [
  'select-chevron',
  'w-full appearance-none rounded-md border border-hairline-strong bg-canvas',
  'py-2 ps-3 pe-9 text-sm text-ink transition-colors',
  'focus:border-brand-500 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20',
  'disabled:cursor-not-allowed disabled:opacity-60',
  'dark:bg-white/[0.03]',
].join(' ')

/**
 * Select inside a form field, where the control sits in a labelled column rather than
 * a filter bar.
 *
 * Six curriculum forms - lesson, module, material, assignment, and both quiz forms -
 * each wrote their own copy of this control, all six identical to each other and all
 * six still on the old TailAdmin greys (`border-gray-300`, `bg-white`, `text-gray-900`,
 * `dark:border-gray-700`) that the rest of the app moved off months ago. So a select in
 * a quiz question looked measurably different from a select in a filter bar on the same
 * screen, and none of them had a chevron, because a native one was all they had.
 *
 * This exists to end that. One definition, on the current ramp, with the same chevron as
 * `selectClass`; the six call sites now name it instead of restating it.
 */
export const formSelectClass = [
  'select-chevron',
  'mt-1.5 w-full appearance-none rounded-lg border border-hairline-strong bg-canvas',
  'py-2.5 ps-3.5 pe-9 text-sm text-ink transition-colors',
  'focus:border-brand-500 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20',
  'disabled:cursor-not-allowed disabled:opacity-60',
  'dark:bg-white/[0.03]',
].join(' ')

/*
  The same two controls, on the public pages' palette.

  Sign-in and registration are public surfaces now, so they render on the
  landing page's warm cream and speak the `lp-` tokens rather than the app-wide
  `ink` / `hairline` / `canvas` ones. These are declared here rather than
  written into each view because that is this file's whole job, and two views
  restating the same string is the problem its header describes.

  Additive only: `fieldLabelClass` and `textInputClass` are unchanged, because
  every dashboard and filter bar in the product uses them and the auth pages do
  not get to repaint the app.

  `focus:border-lp-accent` replaces the old `focus:ring-2 focus:ring-brand-500/20`.
  That ring was a 2px purple wash, which on a cream card is close to invisible;
  a border colour change plus the 2px `focus-visible` outline `main.css` already
  declares for every interactive element gives two clear signals instead of none.
*/
export const lpFieldLabelClass = 'mb-2 block text-sm font-medium text-lp-ink'

/**
 * The landing-page input, used by the auth forms and the course pages.
 *
 * The border and background carry `transition-[border-color,background-color,box-shadow]`
 * rather than the shorthand `transition-colors`, so the focus ring's shadow fades in
 * with the border instead of appearing instantly against a still background - the
 * input's only transition, and the only one an auth form needs.
 *
 * The focus ring is written `rgba(31,107,70,0.12)`, NOT `rgb(31_107_70/0.12)`. Tailwind
 * reads `/` inside an arbitrary value as the start of an opacity MODIFIER, so the
 * slash syntax silently resolves the whole shadow to `rgba(0,0,0,0) 0 0 0 0` - no
 * error, no ring, and the input's only focus affordance beyond its border colour gone.
 * Measured: the computed `box-shadow` was a transparent zero-length shadow.
 *
 * The ring is here in addition to the 2px `focus-visible` outline `main.css` declares
 * for every interactive element, and they are not redundant: the outline is the
 * project's accessibility signal, this one is the accent tint that ties the field to
 * the palette.
 *
 * Deliberately NOT given an entrance animation. A field that flies in is a field
 * someone is trying to type into; the form card arriving is enough.
 */
export const lpTextInputClass =
  'w-full rounded-xl border border-lp-line-strong bg-lp-canvas px-4 py-3 text-sm text-lp-ink placeholder:text-lp-slate transition-[border-color,background-color,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-lp-accent focus:shadow-[0_0_0_3px_rgba(31,107,70,0.12)] motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60'

/**
 * Select sitting inside a table cell, at the row's density.
 *
 * Same treatment as `selectClass` - the native arrow is removed and a smaller chevron
 * drawn in its place - but sized for a 32px row rather than a form field, and it keeps
 * `pe-2` rather than `pe-9` because there is no room for nine units of inset in a cell.
 */
export const cellSelectClass = [
  'select-chevron select-chevron-sm',
  'appearance-none rounded-md border border-hairline-strong bg-canvas',
  'py-1.5 ps-2.5 pe-7 text-xs font-medium transition-colors',
  'focus:border-brand-500 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20',
  'disabled:cursor-not-allowed disabled:opacity-60',
  'dark:bg-white/[0.03]',
].join(' ')

/**
 * The quiet secondary button — the Refresh control every page header carries.
 *
 * Not a pill and not a ghost: a bordered 8px rectangle, which is `button-tertiary`
 * in DESIGN.md's terms.
 */
export const quietButtonClass =
  'inline-flex items-center gap-2 rounded-md border border-hairline-strong bg-canvas px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white/[0.03]'

/** Row-level action: Unpublish, Suspend, Delete. Denser than the header button. */
export const rowActionClass =
  'inline-flex items-center gap-1.5 rounded-md border border-hairline-strong bg-canvas px-2.5 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white/[0.03]'

/**
 * A status pill's shape, without a colour.
 *
 * Pills are one of the three places DESIGN.md allows them (status badges, pill
 * tabs, avatars), so a badge is a full pill and nothing else in the app is.
 *
 * Always paired with the word it stands for — a pill that says "Published" or
 * "Suspended", never a coloured dot on its own. `TONE` supplies the colour.
 */
export const statusPillClass =
  'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium'

/**
 * Status pill colours.
 *
 * Nine near-identical `Record<Status, string>` maps used to live in six admin and
 * instructor views. They agreed where the statuses overlapped and had no way to
 * disagree later, because there was nothing to disagree with. The four tones below
 * are the complete vocabulary: good, in-flight, stopped, and quiet.
 *
 * Every tone carries a dark pair. `text-slate` needs none: like `bg-surface` it is a
 * `var()` that flips with the theme.
 */
export const TONE = {
  /** Published, active, paid, processed. */
  good: 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400',
  /** Draft, invited, pending, received. */
  info: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400',
  /** Suspended, failed, revoked. */
  stop: 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
  /** Archived, refunded, cancelled, ignored. Carries no semantic colour. */
  quiet: 'bg-surface text-slate',
} as const

export type Tone = keyof typeof TONE
