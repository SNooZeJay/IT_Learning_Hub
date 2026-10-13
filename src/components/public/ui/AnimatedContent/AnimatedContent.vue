<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef } from 'vue'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

interface AnimatedContentProps {
  distance?: number
  direction?: 'vertical' | 'horizontal'
  reverse?: boolean
  duration?: number
  ease?: string | ((progress: number) => number)
  initialOpacity?: number
  animateOpacity?: boolean
  scale?: number
  threshold?: number
  delay?: number
  className?: string
}

const props = withDefaults(defineProps<AnimatedContentProps>(), {
  distance: 100,
  direction: 'vertical',
  reverse: false,
  duration: 0.8,
  ease: 'power3.out',
  initialOpacity: 0,
  animateOpacity: true,
  scale: 1,
  threshold: 0.1,
  delay: 0,
  className: '',
})

const emit = defineEmits<{
  complete: []
}>()

const containerRef = useTemplateRef<HTMLDivElement>('containerRef')

/**
 * One context per instance, reverted on unmount.
 *
 * This used to kill every ScrollTrigger on the page - `getAll().forEach(kill)`
 * - whenever any prop changed or any instance unmounted, so one card
 * re-rendering cancelled every other reveal mid-flight. Everything created
 * here now lives in this instance's context (plus the matchMedia below it),
 * and unmount reverts only what this instance owns. The prop watcher is gone
 * with it: `Reveal` hardcodes its values, and a reactive prop on a reveal is
 * the footgun, not a feature.
 */
let ctx: gsap.Context | null = null
let mm: gsap.MatchMedia | null = null

onMounted(() => {
  const el = containerRef.value
  if (!el) return

  const axis = props.direction === 'horizontal' ? 'x' : 'y'
  const offset = props.reverse ? -props.distance : props.distance
  const startPct = (1 - props.threshold) * 100

  const trigger = {
    trigger: el,
    start: `top ${startPct}%`,
    toggleActions: 'play none none none',
    once: true,
  } as const

  const enter = (from: number) => {
    gsap.set(el, {
      [axis]: from,
      scale: props.scale,
      opacity: props.animateOpacity ? props.initialOpacity : 1,
    })
    return gsap.to(el, {
      [axis]: 0,
      scale: 1,
      opacity: 1,
      duration: props.duration,
      ease: props.ease,
      delay: props.delay,
      onComplete: () => emit('complete'),
      scrollTrigger: trigger,
    })
  }

  ctx = gsap.context(() => {
    mm = gsap.matchMedia()
    // Small screens get the fade with no travel: a 24px rise on a 360px
    // viewport is proportionally three times the desktop motion, and the fade
    // is the part that carries meaning. Transform/opacity only, either way.
    mm.add('(max-width: 767px)', () => enter(0))
    mm.add('(min-width: 768px)', () => enter(offset))
  }, el)
})

onUnmounted(() => {
  // matchMedia first: it owns the tweens created when a breakpoint matched
  // after mount, which the context callback never saw run.
  mm?.revert()
  mm = null
  ctx?.revert()
  ctx = null
})
</script>

<template>
  <div ref="containerRef" :class="`animated-content ${props.className}`">
    <slot />
  </div>
</template>

<style scoped>
/* GSAP will handle all transforms and opacity */
</style>
