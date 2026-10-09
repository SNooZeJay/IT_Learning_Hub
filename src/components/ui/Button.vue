<template>
  <button
    :type="type"
    :class="[
      // rounded-md, not rounded-lg. Notion gives buttons 8px and cards 12px.
      // The previous scale could not express that, because every radius resolved
      // to 4px, so buttons and cards looked identical. Now that both values
      // exist, this component is the one place the distinction is enforced.
      'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors',
      sizeClasses[size],
      variantClasses[variant],
      // The focus ring lives in main.css as a floor for every control in the app.
      // This repeats it on the component that most deserves it, because a filled
      // purple button is the one surface where the user-agent default is least
      // likely to read as focus.
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
      className,
      disabled ? disabledClasses[variant] : '',
    ]"
    :disabled="disabled"
    :aria-busy="loading || undefined"
    @click="onClick"
  >
    <span v-if="startIcon" class="flex items-center" aria-hidden="true">
      <component :is="startIcon" />
    </span>
    <slot></slot>
    <span v-if="endIcon" class="flex items-center" aria-hidden="true">
      <component :is="endIcon" />
    </span>
  </button>
</template>

<script setup lang="ts">
type ButtonType = 'button' | 'submit' | 'reset'

interface ButtonProps {
  size?: 'sm' | 'md'
  variant?: 'primary' | 'outline'
  /**
   * Defaults to `button`, not the HTML default of `submit`.
   *
   * A `<button>` with no type attribute inside a `<form>` submits that form. This
   * component is used inside forms for things that are emphatically not the
   * submit — "Try again" on an error state, "Show all notifications" inside a
   * list — and each of those would have submitted the form behind it.
   */
  type?: ButtonType
  startIcon?: object
  endIcon?: object
  onClick?: () => void
  className?: string
  disabled?: boolean
  /** Announced as a pending state, and available to callers that render their own spinner. */
  loading?: boolean
}

const props = withDefaults(defineProps<ButtonProps>(), {
  size: 'md',
  variant: 'primary',
  type: 'button',
  className: '',
  disabled: false,
  loading: false,
})

/**
 * `sm` is the page-header density: 36px tall, matching `quietButtonClass` and the
 * Refresh control it sits beside. `md` is DESIGN.md's `button-primary` padding —
 * 12px vertical, 16px horizontal — so a full-width sign-in button and a table's
 * Unpublish button are two deliberate steps apart rather than two unrelated numbers.
 */
const sizeClasses = {
  sm: 'px-3.5 py-2 text-sm',
  md: 'px-4 py-3 text-sm',
}

const variantClasses = {
  primary: 'bg-brand-500 text-white shadow-theme-xs hover:bg-brand-600 dark:text-white',
  outline:
    'border border-hairline-strong bg-canvas text-ink ring-0 hover:bg-surface dark:bg-white/[0.03] dark:text-gray-100 dark:hover:bg-white/[0.08]',
}

/**
 * What a disabled button looks like.
 *
 * It used to be `cursor-not-allowed opacity-50` laid over the filled variant, which is
 * the reflex answer and it does not survive being measured: halving the opacity of a
 * saturated fill under a white label leaves the label at 1.88:1 against what is left. On
 * `/profile` that was "Save changes" — a learner looking at the one control on the
 * screen that tells them their edit has not been saved, rendered in a label too faint to
 * read. Every other control in the app already used `disabled:opacity-60`, which is the
 * same mistake at a milder dose.
 *
 * `bg-surface` with `text-slate` instead: the pair the codebase already uses for the
 * quiet state everywhere else (`TONE.quiet` in `controlClasses.ts`). The button loses its
 * fill and its shadow and its label stays readable, so "unavailable" is still legible
 * rather than merely faded. Both tokens are `var()`s that flip with the theme, so one
 * declaration covers light and dark and cannot drift between them.
 *
 * Nothing carries the meaning by opacity alone, which also means this survives
 * `forced-colors` mode, where a half-transparent fill collapses to nothing.
 *
 * These are `disabled:` variants, which Tailwind orders after plain utilities — so this
 * holds even when a caller passes its own `bg-*` through `className`, which the previous
 * `disabled:bg-brand-300` did not. `disabled:hover:` is included because CSS still
 * matches `:hover` on a disabled button, and a control that brightens when the pointer
 * lands on it is telling the reader it will do something.
 *
 * Kept to one short line on purpose. Tailwind's scanner is what turns this string into
 * CSS, and a longer version of it — carrying `dark:` arbitrary-value tokens — was
 * silently not scanned at all, producing a build where none of these rules existed and
 * the button fell back to white-on-white.
 */
const disabledClasses = {
  primary:
    'cursor-not-allowed disabled:border-hairline disabled:bg-surface disabled:text-slate disabled:shadow-none disabled:hover:bg-surface',
  outline: 'cursor-not-allowed',
}

const onClick = () => {
  if (!props.disabled && !props.loading && props.onClick) {
    props.onClick()
  }
}
</script>
