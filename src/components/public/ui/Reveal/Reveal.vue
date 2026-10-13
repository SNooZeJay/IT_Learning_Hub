<script setup lang="ts">
import AnimatedContent from '../AnimatedContent/AnimatedContent.vue'
import { useReducedMotion } from '@/composables/useReducedMotion'

/**
 * The one approved way to reveal below-fold content on public pages.
 *
 * `AnimatedContent` (GSAP ScrollTrigger) with the values this product uses,
 * hardcoded: a 24px rise over 0.6s on desktop, fade-only on small screens,
 * firing once at 20% visibility. Hardcoded on purpose - one approved reveal
 * means every section arrives the same way, and there are no props to drift.
 * Each instance owns its animations in a per-instance gsap context that is
 * reverted on unmount, so no instance can cancel another's reveal.
 *
 * Reduced motion renders the slot with no wrapper at all: same content, same
 * order, nothing moving, no ScrollTrigger created for an audience that asked
 * for none.
 *
 * Never in the hero (which has its own stagger + static LCP) and never behind
 * sign-in (vue-bits stays on public pages - see landing-motion.spec.ts).
 */
const { motionOK } = useReducedMotion()
</script>

<template>
  <AnimatedContent v-if="motionOK" :distance="24" :duration="0.6" :threshold="0.2">
    <slot />
  </AnimatedContent>
  <slot v-else />
</template>
