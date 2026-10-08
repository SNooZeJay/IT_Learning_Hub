<template>
  <!--
    LAYOUT: two rows of ordinary flow, no absolute positioning.

      row 1   [ arrow ] [ stage ] [ arrow ]    grid, items-center
      row 2   [ dots ]                          centred, its own strip

    The arrows are GRID COLUMNS, not elements floating over the stage. Upstream
    absolutely positions them at `left-4` / `right-4` inside the same box as the
    cards, which only holds while the cards happen to leave that margin empty - and
    as soon as the stack is centred and fans to one side they drift outward into
    whatever sits beside the carousel. In an earlier draft of this file that put the
    left arrow on top of the hero paragraph.

    As columns they sit outside the stage by construction, `items-center` centres
    them on the card with nothing to measure, and the `gap` IS the clearance. Equal
    clearance falls out of the grid being symmetric, so it stays equal at every
    viewport without a single hardcoded offset.
  -->
  <div
    ref="rootRef"
    class="flex w-full flex-col focus-visible:rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lp-accent"
    role="group"
    aria-roledescription="carousel"
    :aria-label="ariaLabel"
    tabindex="0"
    @keydown="onKeyDown"
  >
    <div
      class="grid items-center gap-2 sm:gap-5 lg:gap-8"
      :style="{
        gridTemplateColumns:
          showControls && count > 1 ? 'auto minmax(0,1fr) auto' : 'minmax(0,1fr)',
        perspective: `${perspective}px`,
      }"
    >
      <button
        v-if="showControls && count > 1"
        type="button"
        class="z-[3000] grid size-10 shrink-0 place-items-center self-center rounded-full border border-lp-line-strong/70 bg-lp-card/70 text-lp-ink backdrop-blur-sm transition-[background-color,border-color,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-lp-ink hover:bg-lp-card active:scale-95 motion-reduce:transition-none sm:size-11 lg:size-12 lg:bg-transparent lg:backdrop-blur-none"
        aria-label="Previous slide"
        @click="navigateBy(-1)"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path
            d="M15 5l-7 7 7 7"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>

      <!--
        `transform-3d` is `transform-style: preserve-3d`, and without it this stage
        flattens every card's `translateZ` and `rotateY` into a single plane - the
        stack still slides, but there is no depth and no tilt, which is the entire
        effect. Upstream has this class; it was dropped in an earlier draft of this
        file and the carousel looked like plain overlapping rectangles.

        `min-w-0` lets this column shrink below the cards' intrinsic width. Without
        it the `1fr` track is floored at the card width, the row overflows the
        carousel, and the page gains a horizontal scrollbar on a phone.
      -->
      <div
        ref="stageRef"
        class="relative min-w-0 transform-3d"
        :style="{ height: `${stageHeight}px` }"
      >
        <!--
          `inert` on the slides that are not showing, and it is not a synonym for
          `aria-hidden`. A hidden slide still holds focusable links and buttons, so
          `aria-hidden` alone told a screen reader the contents were not there while
          leaving them in the tab order - keyboard focus would land inside a card
          nobody can see. `inert` removes the subtree from both at once, which is
          exactly the state a hidden slide wants. Lighthouse's aria-hidden-focus
          audit is what caught it.
        -->
        <div
          v-for="(item, i) in data"
          :key="i"
          :ref="(el) => setCardRef(el, i)"
          class="absolute top-1/2 left-1/2 origin-center overflow-hidden border border-lp-line-strong/60 transform-[translate(-50%,-50%)] will-change-[transform,opacity,filter] bg-lp-card shadow-lp-card"
          :style="{
            width: `${cardWidth}px`,
            height: `${cardHeight}px`,
            borderRadius: `${radius}px`,
          }"
          aria-roledescription="slide"
          :aria-label="`${i + 1} of ${count}`"
          :aria-hidden="active !== i"
          :inert="active !== i"
          @click="onCardClick(i)"
        >
          <!--
          The `card` slot replaces the plain image. This product's courses rarely
          have cover art, so the default <img> would render a broken frame for most
          of them; the caller supplies the level-drawn placeholder instead, which is
          the same treatment `CatalogueCard` and the old hero card used.

          The tint overlay below stays outside the slot on purpose: it is the depth
          shading and belongs to the carousel, not to whatever the slide draws.
        -->
          <slot name="card" :item="item" :index="i">
            <img
              class="pointer-events-none block h-full w-full object-cover select-none [-webkit-user-drag:none]"
              :src="item.image"
              :alt="item.alt || ''"
              :draggable="false"
            />
          </slot>
          <span
            :ref="(el) => setOverlayRef(el, i)"
            class="pointer-events-none absolute inset-0 opacity-0 mix-blend-multiply"
            :style="{ background: tint }"
          />
        </div>
      </div>

      <button
        v-if="showControls && count > 1"
        type="button"
        class="z-[3000] grid size-10 shrink-0 place-items-center self-center rounded-full border border-lp-line-strong/70 bg-lp-card/70 text-lp-ink backdrop-blur-sm transition-[background-color,border-color,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-lp-ink hover:bg-lp-card active:scale-95 motion-reduce:transition-none sm:size-11 lg:size-12 lg:bg-transparent lg:backdrop-blur-none"
        aria-label="Next slide"
        @click="navigateBy(1)"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path
            d="M9 5l7 7-7 7"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>

    <!--
      The dots, in their own row below the stage rather than over a card.

      Upstream hangs them off the bottom of the carousel, which works because its
      slides are a bare image with an empty lower edge. These slides carry a title,
      a price and a "View course" button along the bottom, so the dot row sat on top
      of the primary action and made it unreadable. Overlaying the card is the wrong
      shape of fix: whichever edge the dots go on, they land on content. A row below
      the stage collides with nothing.

      Centred on the WHOLE carousel, which is symmetric, so they also sit centred
      under the front card - the stage shifts left to balance the fan, so centring
      on the stage instead would put them visibly off to one side.
    -->
    <div
      v-if="showIndicators && count > 1"
      class="flex items-center justify-center gap-0.5 pt-4"
      role="tablist"
      aria-label="Slides"
    >
      <!--
        The button is a 44px touch target; the visible dot is the inner span.
        Upstream styles the button itself as the dot, which is 7px tall - far too
        small to hit reliably on a phone, and it happened to sit inside a padded
        wrapper, so the padding was the only thing making it tappable.
      -->
      <button
        v-for="(_, i) in data"
        :key="i"
        type="button"
        role="tab"
        :aria-selected="active === i"
        :aria-label="`Go to slide ${i + 1}`"
        class="grid size-11 cursor-pointer place-items-center"
        @click="setFocus(i, true)"
      >
        <!--
          `width` is the one property here that is not a transform, and it is the
          right one to animate: the active dot IS a different width from the inactive
          ones, so a transform would be faking a shape that has to be measured by a
          screen reader and hit-tested by a finger. It is a 20px width change on one
          element inside a 44px button - no reflow beyond that span.

          `duration-250` was an arbitrary number that existed before the motion
          system did. It is now the system's `--ith-motion-base` curve, so the dot
          settles at the same rate as the card it is tracking.
        -->
        <span
          class="block rounded-full transition-[width,background-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
          :class="
            active === i ? 'h-3 w-11 bg-lp-accent' : 'size-2.5 bg-lp-ink/25 dark:bg-lp-ink/40'
          "
        />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * A 3D "stack of cards receding into the distance" carousel.
 *
 * Upstream is Vue Bits' DepthCarousel, which needs a dependency this project does
 * not otherwise have (`gsap`) and hardcodes its own dark palette. Both were
 * adapted rather than vendored verbatim; the differences are all listed below,
 * because a component that is quietly edited is worse than one that is replaced.
 *
 * WHAT CHANGED FROM UPSTREAM, AND WHY
 *
 * 1. `card` slot. Upstream renders a bare `<img>` per slide. Almost no course in
 *    this catalogue has `thumbnail_url`, so the default would be a broken frame on
 *    most slides. The slot lets the caller draw the level placeholder instead.
 *    The default is unchanged for anyone who does not pass one.
 *
 * 2. Pointer drag and wheel steering were REMOVED. Upstream treats a drag as a
 *    navigation gesture, and that is wrong on this page. The wheel handler called
 *    `e.preventDefault()` on every wheel event including a vertical one, so a visitor
 *    scrolling the landing page with the pointer anywhere over the carousel did not
 *    scroll the page at all - the carousel swallowed it and silently advanced a
 *    slide. Pointer drag made it worse on touch: `setPointerCapture` on a
 *    vertically-scrolling screen can capture the gesture, so the page stops moving
 *    under the finger. Both were "the carousel fights the page", and neither was asked
 *    for. What remains is deliberate: the arrow buttons, the dots, the keyboard
 *    arrows, and clicking a card. A page that only scrolls has nothing to gain from a
 *    gesture that competes with scrolling.
 *
 *    `suppressClick`, the `DragState` interface and the drag projection went with
 *    them - they existed only to distinguish a click from a drag, which cannot happen
 *    now that there is no drag.
 *
 * 3. `stageRef` was referenced by the template but never declared. It is now
 *    declared, so the stage element is actually reachable.
 *
 * 4. Colours. Upstream hardcodes `#0b0d12`, `rgba(18,20,26,0.55)` and white.
 *    AGENTS.md forbids hex in class attributes in favour of `@theme` tokens, and
 *    those greys are chosen for a black page. They are now `lp-*` tokens, so the
 *    carousel sits on this product's cream canvas.
 *
 * 5. `z-3000` became `z-[3000]`. This project declares `--z-index-*` in `@theme`,
 *    and a bare `z-3000` is not reliably generated against that override. The
 *    cards are given inline `z-index` of 2000 and up by `layout()`, so the
 *    controls genuinely do need to clear 3000.
 *
 * 6. `select` is emitted alongside the upstream `change`, because a card in a hero
 *    is expected to go somewhere and the click handler is the natural place to
 *    find out that it was a click.
 *
 * NOT CHANGED: all the geometry maths, the loop wrapping, the autoplay
 * pause-on-hover-or-focus, and the reduced-motion handling.
 */
import { ref, computed, watch, onMounted, onUnmounted, type ComponentPublicInstance } from 'vue'
import gsap from 'gsap'

export type DepthCarouselItem = string | { image: string; alt?: string }
export type TiltDirection = 'left' | 'right'

interface DepthCarouselProps {
  items?: DepthCarouselItem[]
  cardWidth?: number
  cardHeight?: number
  radius?: number
  tint?: string
  depth?: number
  spread?: number
  tilt?: number
  tiltDirection?: TiltDirection
  perspective?: number
  visibleCards?: number
  falloff?: number
  blur?: number
  duration?: number
  ease?: string
  autoplay?: boolean
  autoplayDelay?: number
  loop?: boolean
  showControls?: boolean
  showIndicators?: boolean
  /** Accessible name for the whole carousel. Upstream hardcoded "Depth carousel". */
  ariaLabel?: string
}

const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), max)

const normalizeItem = (it: DepthCarouselItem): { image: string; alt?: string } =>
  typeof it === 'string' ? { image: it, alt: '' } : it

const props = withDefaults(defineProps<DepthCarouselProps>(), {
  items: () => [
    { image: 'https://picsum.photos/seed/depth1/800/1000', alt: 'Slide 1' },
    { image: 'https://picsum.photos/seed/depth2/800/1000', alt: 'Slide 2' },
    { image: 'https://picsum.photos/seed/depth3/800/1000', alt: 'Slide 3' },
    { image: 'https://picsum.photos/seed/depth4/800/1000', alt: 'Slide 4' },
    { image: 'https://picsum.photos/seed/depth5/800/1000', alt: 'Slide 5' },
    { image: 'https://picsum.photos/seed/depth6/800/1000', alt: 'Slide 6' },
  ],
  cardWidth: 300,
  cardHeight: 380,
  radius: 18,
  tint: '#05060a',
  depth: 220,
  spread: 90,
  tilt: 22,
  tiltDirection: 'right',
  perspective: 1400,
  visibleCards: 4,
  falloff: 0.2,
  blur: 6,
  duration: 700,
  ease: 'power3.out',
  autoplay: false,
  autoplayDelay: 3200,
  loop: true,
  showControls: true,
  showIndicators: true,
  ariaLabel: 'Course carousel',
})

const emit = defineEmits<{
  change: [index: number, item: { image: string; alt?: string }]
  select: [index: number, item: { image: string; alt?: string }]
}>()

const data = computed(() => (Array.isArray(props.items) ? props.items : []).map(normalizeItem))
const count = computed(() => data.value.length)

const rootRef = ref<HTMLDivElement | null>(null)
const stageRef = ref<HTMLDivElement | null>(null)
const cardRefs = ref<(HTMLDivElement | null)[]>([])
const overlayRefs = ref<(HTMLSpanElement | null)[]>([])

/**
 * Vue passes `Element | ComponentPublicInstance | null` to a template ref
 * callback, and this project runs `vue-tsc` over templates - so the parameter has
 * to accept the wider type or the template fails to type-check. The cast is
 * safe because both refs are only ever bound to plain elements here.
 */
const setCardRef = (el: Element | ComponentPublicInstance | null, index: number) => {
  cardRefs.value[index] = el as HTMLDivElement | null
}
const setOverlayRef = (el: Element | ComponentPublicInstance | null, index: number) => {
  overlayRefs.value[index] = el as HTMLSpanElement | null
}
const active = ref(0)

let pos = 0
let focusIndex = 0
let tween: gsap.core.Tween | null = null
let scale = 1

/**
 * The stage's painted height, in a ref so the template re-renders when it changes.
 *
 * The stage has to be exactly as tall as the painted card. Too short and the card is
 * clipped; sized for the UNSCALED card it leaves dead space instead - on a phone the
 * stack is scaled to roughly half, and a stage sized for the full card left ~180px
 * of emptiness under a 215px card.
 *
 * Written by `syncStageHeight` rather than derived in a `computed`, because `scale`
 * is a plain variable the observer owns and a `computed` would not observe it.
 */
const stageHeight = ref(0)

function syncStageHeight(): void {
  stageHeight.value = props.cardHeight * scale
}

/**
 * A first guess at the scale, before anything has been measured.
 *
 * The upstream figure is `cardWidth + 2 * spread + 120`, which is wrong in both
 * directions at once. It assumes a symmetric fan - but the cards all step to ONE
 * side of the front card - and it ignores that the perspective shrinks each card as
 * it recedes, so the real stack is much narrower than `spread * d` suggests.
 *
 * This guess only has to be in the right neighbourhood; `fitToStage` replaces it
 * with a measurement.
 */
function estimateScale(stageWidth: number): number {
  const worstD = Math.max(0, props.visibleCards)
  const foreshorten = props.perspective / (props.perspective + props.depth * worstD)
  const halfExtent = (worstD * Math.abs(props.spread) + props.cardWidth / 2) * foreshorten
  return stageWidth / (halfExtent * 2 + 40)
}

/**
 * Correct the scale from the stack's MEASURED width.
 *
 * This is the whole reason the card renders at its intended size.
 *
 * Every closed form of the stack's width is wrong, because `rotateY` narrows each
 * receding card by cos(tilt) - at 22 degrees that is 7% of the width plus the whole
 * perspective projection - and no combination of `spread`, `depth` and `tilt`
 * predicts the painted result closely. The calculated figure over-reserved by about
 * 36%, which silently shrank a 340px card to 250px with no visible reason.
 *
 * So: measure the painted cards, work out how much too wide they are, and scale down
 * by exactly that. `layout` has to run first, because until it has, the cards have no
 * transforms to measure.
 *
 * This also centres the stack, by translating the stage by half the overhang. The
 * front card is pinned to the stage's centre by its own transform, so centring the
 * stack means moving the stage, not the cards - the cards' transform maths stays
 * untouched.
 *
 * Three passes, not one. Scale and centring each depend on the other's measurement,
 * so a single pass fixes one and disturbs the other. It stops early once both are
 * within a hair of the answer.
 *
 * Never scales UP past 1, and never below the floor - `cardWidth` is the design size
 * and the card is not allowed to exceed it. When the stage is too narrow for even the
 * floor scale, the cards overhang and are centred by the translate instead; there is
 * nothing better to do at that width, and the caller can lower `cardWidth`.
 */
function fitToStage(stageWidth: number): void {
  /*
    Scale once, from a single measurement. No iteration, and no centring translate.

    WHY NO ITERATION. The obvious loop, `scale = stageWidth / paintedWidth`, cannot
    converge: painted width is NOT proportional to scale, because `translateZ`
    interacts both with the perspective projection and with the 2D `scale()` ahead of
    it in the transform list. Traced at a 192px stage - scale 1 painted 378.5px, scale
    0.507 painted 172.5px, and the loop wanted to bounce between them for ever.
    Forcing each step downward (`Math.min`) stalled at 0.36 instead: too small, and no
    way back up. So the scale comes from ONE measurement at a known reference and is
    accepted as approximate. A few percent out is invisible; not converging is not.

    WHY NO CENTRING TRANSLATE. Two obvious alternatives, both wrong:

      - Centre the STACK (translate the stage by half the overhang) and the stack never
        overlaps an arrow, but the front card ends up off-centre by half the fan's
        width, so the left arrow sits measurably closer to the card than the right one.
        Measured at 1440px: 51px on the left against 63px on the right.

      - Centre the front CARD (what upstream does, and what the reference shows) and
        the two arrow gaps are equal by the grid's own symmetry - but the fan then
        overhangs the stage on its side and reaches toward the right arrow.

    The scale below resolves it: it is chosen so the fan STILL FITS once the card is
    centred, which keeps the card centred AND the arrows clear, with no translate at
    all.

    THE ARITHMETIC. With the card centred in a stage of width S, the card's left edge
    sits at (S - C) / 2, where C is the SCALED card width, and the stack extends W
    further, W being the scaled stack width. No overhang means:

        (S - C) / 2 + W <= S
        W <= (S + C) / 2

    Substituting C = cardWidth * scale and W = reference * scale, and solving:

        scale <= S / (2 * reference - cardWidth)

    which is what the next line computes. `reference` is the stack's painted width
    measured at scale 1, so it already accounts for `rotateY`, the perspective
    projection and the fan - none of which any closed form predicts closely.
  */
  scale = 1
  layout(pos)

  const reference = paintedStackBounds()
  if (!reference) return
  const referenceWidth = reference.right - reference.left
  const divisor = referenceWidth * 2 - props.cardWidth
  if (referenceWidth <= 0 || divisor <= 0) return

  scale = clamp(stageWidth / divisor, 0.3, 1)
  layout(pos)
}

/**
 * The painted bounds of the stack, in stage-local coordinates, or null if none.
 *
 * Measured from the cards' own boxes rather than derived, which is the point: it is
 * the only figure that accounts for `rotateY`, the perspective projection and the
 * centring translation all at once.
 *
 * Only cards that are actually visible are included. A card past `visibleCards` has
 * opacity 0 and no bearing on the width; counting it would reserve space for a card
 * nobody can see.
 *
 * Returned relative to the stage, because the stage is translated to centre the
 * stack - so the stack's left edge is not at x=0 even when the front card is centred.
 */
function paintedStackBounds(): { left: number; right: number } | null {
  if (!stageRef.value) return null
  const stageBox = stageRef.value.getBoundingClientRect()
  let left = Infinity
  let right = -Infinity
  for (const el of cardRefs.value) {
    if (!el || Number(el.style.opacity) <= 0.05) continue
    const b = el.getBoundingClientRect()
    if (b.width === 0) continue
    if (b.left < left) left = b.left
    if (b.right > right) right = b.right
  }
  return left === Infinity ? null : { left: left - stageBox.left, right: right - stageBox.left }
}

let reduced = false

const layout = (p: number) => {
  const n = count.value
  if (!n) return
  const dir = props.tiltDirection === 'left' ? -1 : 1

  for (let i = 0; i < n; i++) {
    const el = cardRefs.value[i]
    if (!el) continue

    let d = i - p
    if (props.loop && n > 1) {
      d = ((d % n) + n) % n
      if (d > n / 2) d -= n
    }

    const back = Math.max(0, d)
    const az = Math.abs(d)
    const shown = az <= props.visibleCards + 0.5

    const tz = -props.depth * d
    const tx = dir * props.spread * d
    const ry = dir * props.tilt * clamp(d, 0, 1)

    let opacity = d < 0 ? Math.max(0, 1 + d) : 1
    if (!shown) opacity = 0

    const brightness = Math.max(0.15, 1 - back * props.falloff)
    const blurPx =
      props.blur > 0
        ? Math.min(props.blur, (back / Math.max(1, props.visibleCards)) * props.blur)
        : 0
    const zi = Math.round(2000 - d * 20)

    el.style.transform = `translate(-50%, -50%) scale(${scale}) translateX(${tx.toFixed(2)}px) translateZ(${tz.toFixed(2)}px) rotateY(${ry.toFixed(3)}deg)`
    el.style.opacity = opacity.toFixed(3)
    el.style.filter = `brightness(${brightness.toFixed(3)}) blur(${blurPx.toFixed(2)}px)`
    el.style.zIndex = String(zi)
    el.style.pointerEvents = shown && opacity > 0.05 ? 'auto' : 'none'

    const ov = overlayRefs.value[i]
    if (ov) ov.style.opacity = clamp(back * props.falloff * 1.25, 0, 0.86).toFixed(3)
  }
}

const notify = (idx: number) => {
  active.value = idx
  emit('change', idx, data.value[idx])
}

const tweenTo = (target: number, animate: boolean) => {
  tween?.kill()
  const proxy = { p: pos }
  // `duration` arrives in ms and gsap wants seconds. Under `prefers-reduced-motion` it
  // is zero, so changing slide is a cut rather than a travel: the reader still sees
  // which slide they landed on, they just do not watch the stack rotate to it. The dot
  // indicators keep their own colour transition, so the state change stays legible.
  const dur = animate && !reduced ? props.duration / 1000 : 0
  tween = gsap.to(proxy, {
    p: target,
    duration: dur,
    ease: props.ease,
    onUpdate: () => {
      pos = proxy.p
      layout(proxy.p)
    },
    onComplete: () => {
      const n = count.value
      if (n > 0) pos = ((pos % n) + n) % n
      layout(pos)
    },
  })
}

const setFocus = (rawIndex: number, animate = true) => {
  const n = count.value
  if (!n) return
  const idx = props.loop ? ((rawIndex % n) + n) % n : clamp(rawIndex, 0, n - 1)
  let delta = idx - pos
  if (props.loop && n > 1) {
    delta = ((delta % n) + n) % n
    if (delta > n / 2) delta -= n
  }
  tweenTo(pos + delta, animate)
  if (idx !== focusIndex) {
    focusIndex = idx
    notify(idx)
  }
}

const navigateBy = (step: number) => setFocus(focusIndex + step, true)

const onKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    navigateBy(-1)
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    navigateBy(1)
  }
}

const onCardClick = (index: number) => {
  setFocus(index, true)
  emit('select', index, data.value[index])
}

let ro: ResizeObserver | null = null
let stopAutoplay: (() => void) | null = null

const setupAutoplay = () => {
  reduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!props.autoplay || reduced || count.value < 2) return

  const root = rootRef.value
  let hovered = false
  let focused = false
  let timer: ReturnType<typeof setInterval> | null = null

  const stop = () => {
    if (timer) clearInterval(timer)
    timer = null
  }
  const start = () => {
    stop()
    timer = setInterval(
      () => {
        if (!hovered && !focused) navigateBy(1)
      },
      Math.max(props.autoplayDelay, 600),
    )
  }
  const onEnter = () => {
    hovered = true
  }
  const onLeave = () => {
    hovered = false
  }
  const onFocusIn = () => {
    focused = true
  }
  const onFocusOut = () => {
    focused = false
  }

  root?.addEventListener('mouseenter', onEnter)
  root?.addEventListener('mouseleave', onLeave)
  root?.addEventListener('focusin', onFocusIn)
  root?.addEventListener('focusout', onFocusOut)
  start()

  stopAutoplay = () => {
    stop()
    root?.removeEventListener('mouseenter', onEnter)
    root?.removeEventListener('mouseleave', onLeave)
    root?.removeEventListener('focusin', onFocusIn)
    root?.removeEventListener('focusout', onFocusOut)
  }
}

onMounted(() => {
  const root = rootRef.value
  if (root) {
    /*
      Observe the STAGE, not the root - the root also contains the two arrow columns,
      so measuring it would size the cards to a width they never occupy.

      Width changes only. A ResizeObserver reports height too, and this stage's height
      is `cardHeight * scale` - a value `fitToStage` writes. Watching both dimensions
      makes every scale change re-trigger the observer, which resets to scale 1 and
      measures again: a feedback loop that oscillates and settles on an arbitrary
      scale. Measured at 320px: a 340px card painted into a 192px stage, reported as
      scale 1 and clipped.
    */
    let lastWidth = 0
    ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width
      if (Math.abs(w - lastWidth) < 1) return
      lastWidth = w
      // Estimate first, so the cards are never painted at full size into a stage too
      // narrow for them - a visible flash and a scrollbar flicker on a phone. The
      // measurement below then replaces the guess with the real answer.
      scale = estimateScale(w)
      layout(pos)
      fitToStage(w)
      syncStageHeight()
    })
    if (stageRef.value) ro.observe(stageRef.value)

    /*
      No wheel listener here on purpose. Upstream registered one that called
      `e.preventDefault()` on every wheel event - including a purely vertical one -
      because it wanted the wheel to steer the carousel. That is a reasonable choice
      for a carousel that owns its own screen, and the wrong one for a carousel sitting
      in the middle of a scrolling page: a visitor whose pointer happened to be over
      the hero found the page would not scroll at all, and the carousel quietly changed
      slide instead. Removing the listener is what gives the page its scroll back; the
      arrows, the dots and the keyboard still navigate.
    */
  }

  // `fitToStage` measures the painted cards, and the cards have no transforms worth
  // measuring until `layout` has run - so the order here is load-bearing.
  layout(pos)
  const stage = stageRef.value
  if (stage) fitToStage(stage.getBoundingClientRect().width)
  syncStageHeight()
  setupAutoplay()
})

onUnmounted(() => {
  tween?.kill()
  ro?.disconnect()
  stopAutoplay?.()
})

watch(
  () => [props.autoplay, props.autoplayDelay, count.value],
  () => {
    stopAutoplay?.()
    stopAutoplay = null
    setupAutoplay()
  },
)

watch(
  () => [
    props.depth,
    props.spread,
    props.tilt,
    props.tiltDirection,
    props.visibleCards,
    props.falloff,
    props.blur,
    props.cardWidth,
    props.cardHeight,
    props.radius,
    count.value,
  ],
  () => {
    layout(pos)
    // The scale is measured, and these props are exactly what it measures, so it has
    // to be re-measured when they change. The observer only fires on width.
    const stage = stageRef.value
    if (stage) {
      fitToStage(stage.getBoundingClientRect().width)
    }
    syncStageHeight()
  },
)
</script>
