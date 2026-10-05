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

/** Full-width select, for a filter bar. */
export const selectClass =
  'w-full rounded-md border border-hairline-strong bg-canvas px-3 py-2 text-sm text-ink transition-colors focus:border-brand-500 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white/[0.03]'

/** Select sitting inside a table cell, at the row's density. */
export const cellSelectClass =
  'rounded-md border border-hairline-strong bg-canvas py-1.5 ps-2.5 pe-2 text-xs font-medium transition-colors focus:border-brand-500 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white/[0.03]'

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
