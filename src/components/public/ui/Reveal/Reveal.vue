<script setup lang="ts">
import AnimatedContent from '../AnimatedContent/AnimatedContent.vue'
import { useReducedMotion } from '@/composables/useReducedMotion'

/**
 * The one approved way to reveal below-fold content on public pages.
 *
 * `AnimatedContent` (GSAP ScrollTrigger) with the values this product uses,
 * hardcoded: a 24px rise over 0.6s, firing once at 20% visibility. Hardcoded
 * on purpose - the component kills every ScrollTrigger on the page when any
 * prop changes, so a reactive prop here is a page-wide footgun. There are no
 * props to change.
 *
 * Reduced motion renders the slot with no wrapper at all: same content, same
 * order, nothing moving, no ScrollTrigger created for an audience that asked
 * for none.
 *
 * Never in the hero (which has its own stagger + LCP system) and never behind
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
