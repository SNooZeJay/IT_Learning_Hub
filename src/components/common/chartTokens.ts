/**
 * Colours and options shared by every ApexCharts instance in the app.
 *
 * They live here rather than in a component because a `.vue` file's `<script setup>`
 * block cannot export anything - every top-level binding in one is private to that
 * component. The first version of this put the brand colour in `TrendChart.vue` and
 * imported it from the analytics pages, which fails to resolve.
 *
 * It is its own module for a second reason: there are three dashboards and two
 * analytics screens, and TailAdmin had hardcoded `#5645d4` into each of them
 * separately. Six independent copies of a colour is how the app ended up with purple
 * charts on a green page - five call sites fixed, the sixth still wrong, and nothing
 * to point at the fact that they were ever supposed to agree.
 */

/**
 * The chart series colour: `brand-500` resolved.
 *
 * Apex needs a literal colour rather than a CSS custom property, because it paints to
 * a canvas. `brand-500` is the same step the primary button and the focus ring use,
 * so a chart and a button are the same green on the same page.
 *
 * It was `#5645d4` - TailAdmin purple - which was the only purple object left in an
 * interface that had otherwise moved to the green brand ramp.
 */
export const BRAND_500 = '#1f6b46'

/**
 * Success, warning, error, then the neutral steps for the long tails of a
 * categorical series.
 *
 * Ordered so the meaningful tones come first: a categorical palette used by a donut
 * reads by position, and the two charts that share this list start on the same colour.
 */
export const CATEGORICAL_PALETTE = [
  BRAND_500,
  '#1aae39',
  '#dd5b00',
  '#e03131',
  '#787671',
  '#a4a097',
]

/** The one font stack, matching `--font-sans` in `main.css`. */
export const CHART_FONT =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
