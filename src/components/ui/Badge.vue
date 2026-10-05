<template>
  <span :class="[statusPillClass, 'gap-1', sizeClass, colorStyles]">
    <span v-if="startIcon" class="inline-flex items-center" aria-hidden="true">
      <component :is="startIcon" />
    </span>
    <slot></slot>
    <span v-if="endIcon" class="inline-flex items-center" aria-hidden="true">
      <component :is="endIcon" />
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { statusPillClass } from '@/components/ui/controlClasses'

type BadgeVariant = 'light' | 'solid'
type BadgeSize = 'sm' | 'md'
type BadgeColor = 'primary' | 'success' | 'error' | 'warning' | 'info' | 'light' | 'dark'

interface BadgeProps {
  variant?: BadgeVariant
  size?: BadgeSize
  color?: BadgeColor
  startIcon?: object
  endIcon?: object
}

const props = withDefaults(defineProps<BadgeProps>(), {
  variant: 'light',
  color: 'primary',
  size: 'md',
})

const sizeClass = computed(() => (props.size === 'sm' ? 'text-theme-xs' : 'text-sm'))

/**
 * `light` is the status treatment and `solid` is the emphasis one. Both are pills,
 * which DESIGN.md allows for status badges, so the shape comes from `statusPillClass`
 * rather than being restated here.
 *
 * The colours are the same four tones the tables use, plus the two neutral chips the
 * course page needs (a free-price chip, a level chip).
 */
const light: Record<BadgeColor, string> = {
  primary: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400',
  info: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400',
  success: 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400',
  error: 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
  warning: 'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400',
  light: 'bg-surface text-slate',
  dark: 'bg-charcoal text-white dark:bg-white/10 dark:text-white',
}

const solid: Record<BadgeColor, string> = {
  primary: 'bg-brand-500 text-white',
  info: 'bg-brand-500 text-white',
  success: 'bg-success-500 text-white',
  error: 'bg-error-500 text-white',
  warning: 'bg-warning-500 text-white',
  light: 'bg-charcoal text-white',
  dark: 'bg-ink text-white dark:bg-white/10 dark:text-white',
}

const colorStyles = computed(() =>
  props.variant === 'solid' ? solid[props.color] : light[props.color],
)
</script>
