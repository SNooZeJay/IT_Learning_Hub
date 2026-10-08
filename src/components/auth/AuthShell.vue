<template>
  <div class="relative isolate flex min-h-screen flex-col overflow-x-clip bg-lp-canvas text-lp-ink">
    <!--
      The landing page's background: three blurred pastel masses, static, behind
      everything and unclickable.

      This replaces `CommonGridShape`, the TailAdmin mesh. A wireframe grid is the
      clearest possible signal that a page predates the current design, and it was
      the loudest thing on all four auth pages.
    -->
    <div class="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div
        class="absolute -top-48 -start-40 size-[36rem] rounded-full bg-lp-glow-green opacity-70 blur-3xl"
      ></div>
      <div
        class="absolute -top-24 -end-48 size-[42rem] rounded-full bg-lp-glow-beige opacity-80 blur-3xl"
      ></div>
      <div
        class="absolute bottom-[-12rem] start-1/3 size-[30rem] rounded-full bg-lp-glow-peach opacity-60 blur-3xl"
      ></div>
    </div>

    <!--
      The landing page's floating header, minus the two account buttons - on the
      sign-in page "Sign in" is the page you are already on, and on the register
      page "Create account" likewise, so carrying them would offer a link to the
      current route.

      The back link stays for the reason its own comment gives: someone who
      followed "Sign in" from the marketing page needs an explicit way to undo
      that, and the logo alone is not an obvious link. It is the same pill the
      other public pages carry, so the control does not appear to jump when you
      navigate between them.
    -->
    <header class="px-4 pt-4 md:px-6 md:pt-5">
      <div
        class="mx-auto max-w-6xl rounded-3xl border border-lp-line bg-lp-card/85 shadow-lp-nav backdrop-blur-xl 2xsm:rounded-full"
      >
        <div
          class="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 px-3 py-2.5 2xsm:flex-nowrap 2xsm:justify-between 2xsm:gap-x-3 2xsm:px-4 md:px-5"
        >
          <RouterLink to="/" class="flex min-w-0 items-center gap-2.5">
            <BrandMark class="size-8 shrink-0" />
            <span
              class="hidden truncate text-[15px] font-semibold tracking-tight text-lp-ink md:inline"
            >
              IT Learning Hub
            </span>
          </RouterLink>

          <div class="flex shrink-0 items-center gap-0.5 2xsm:gap-1.5 md:gap-2">
            <!--
              The arrow points back toward the start of the reading direction, so it
              flips in RTL. `min-h-10` keeps a 40px hit area without the link
              reading as a button.
            -->
            <RouterLink
              to="/"
              class="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-lp-slate transition-[background-color,color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-lp-canvas hover:text-lp-ink motion-reduce:transition-none"
            >
              <ArrowLeft class="size-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
              Back to home
            </RouterLink>

            <ThemeToggleButton />
          </div>
        </div>
      </div>
    </header>

    <main class="flex flex-1 items-center justify-center px-4 py-12 sm:py-16">
      <!--
        `form` is the form width, and it is the default so every existing caller is
        unchanged. `wide` exists for the legal documents, which are read rather than filled
        in: at `max-w-md` a sentence wraps at roughly forty characters and the contents
        grid has two items per line that each wrap onto two, which is not how anyone reads
        a document.
      -->
      <div :class="width === 'wide' ? 'w-full max-w-3xl' : 'w-full max-w-md'">
        <!--
          The title sits above the card, centred, in the landing page's serif. The
          large logo that used to sit above it is gone: the header now carries the
          mark, and two logos on one screen is the redundancy the public pages were
          cleaned of.

          MOTION. Two steps, and this is deliberately less than the landing page's
          five. An authentication screen should feel stable and already-there: someone
          arriving at sign-in is about to type a password, and a long entrance sequence
          in front of a form is the reader waiting on the page rather than the page
          waiting for them. The heading establishes the screen, the card follows.

          It lives HERE rather than in each of the four auth views, which is what makes
          sign-in, sign-up and the two password pages share one animation language by
          construction rather than by four matching edits.
        -->
        <div :style="{ '--stagger-i': 0 }" class="lp-hero-step mb-8 text-center">
          <h1
            class="font-display text-3xl leading-tight font-semibold tracking-tight text-balance text-lp-ink sm:text-4xl"
          >
            {{ title }}
          </h1>
          <p v-if="description" class="mt-3 text-sm leading-relaxed text-lp-slate">
            {{ description }}
          </p>
        </div>

        <!--
          The page's own content, on a white card. This is the one structural
          change with a consequence worth naming: `Alert` and `EmptyState` render
          their own app-grey surfaces and are used by ~25 authenticated views, so
          in an error state this card shows grey inside white. Recolouring those
          two components to fix it would have repainted a quarter of the product.

          `lp-surface` on the card so its border and shadow respond to the theme
          toggle alongside everything else, rather than the card being the one object
          on the page that snaps between light and dark.
        -->
        <div
          :style="{ '--stagger-i': 1 }"
          class="lp-hero-step lp-surface rounded-3xl border border-lp-line bg-lp-card p-6 shadow-lp-card sm:p-8"
        >
          <slot />
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
/**
 * The frame every unauthenticated page shares: the landing page's header, a
 * title, and a card for the page's own content.
 *
 * This exists so "how do I get out of here" is answered in exactly one place.
 * Four separate copies of the same wrapper had drifted, and all four of them had
 * the same gap.
 *
 * SCOPE NOTE. `title` and `description` are unchanged, and so is the slot. What
 * changed is the frame, which means this also restyles `ForgotPassword` and
 * `ResetPassword` - they were built on this component and would otherwise have
 * been left as the only two public pages still on the old surface, reached from
 * the very form this one wraps.
 */
import { RouterLink } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import BrandMark from '@/components/common/BrandMark.vue'
import ThemeToggleButton from '@/components/common/ThemeToggleButton.vue'

defineProps<{
  /** Heading for the card. Plain text: every page here uses a plain sentence. */
  title: string
  /** Optional supporting line under the heading. */
  description?: string
  /**
   * How wide the card is.
   *
   * `form` is right for anything a person types into. `wide` is for the legal documents,
   * which are read in sentences rather than filled in fields.
   */
  width?: 'form' | 'wide'
}>()
</script>
