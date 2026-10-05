<template>
  <div class="relative isolate flex min-h-screen flex-col overflow-hidden">
    <CommonGridShape />

    <!--
      A row holding the two things a visitor needs regardless of what they came
      here to do: the way out, and the theme switch.

      The back link exists because a visitor who followed "Sign in" from the
      marketing page has to be able to undo that. Without it the only way out is
      the browser back button, which loses the page they came from, or the logo,
      which is not obviously a link. It sits in its own row rather than over the
      card so the card stays optically centred and the link gets a real hit target
      on a phone.

      The toggle sits opposite it at the same height as on the landing page, so
      the control does not appear to jump when you navigate.
    -->
    <div class="relative z-10 flex items-center justify-between gap-3 px-4 pt-5 sm:px-6 sm:pt-6">
      <!--
        py-1 and px-2 give the link a 28px tall hit area while keeping
        the text optically aligned to the page edge. A bare text link measures
        about 20px, which is under the 24px minimum target size and awkward to
        hit on a phone.

        `text-slate` rather than the `text-gray-500` this carried: #787671 on the
        #f6f5f4 surface measures 4.17:1, which fails AA for 14px text, and it is
        the one place the auth pages still spoke the old TailAdmin grey. `text-slate`
        is the token every authenticated screen already uses and measures 6.2:1 here.
      -->
      <RouterLink
        to="/"
        class="-ms-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-slate transition-colors hover:text-ink focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 dark:hover:text-white/90"
      >
        <!-- Points back toward the start of the reading direction, so it flips in RTL. -->
        <ArrowLeft class="size-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
        Back to home
      </RouterLink>

      <ThemeToggleButton />
    </div>

    <div class="relative flex flex-1 items-center justify-center px-4 py-8 sm:py-10">
      <div class="w-full max-w-md">
        <div class="mb-8 flex flex-col items-center text-center">
          <!--
            The logo is a link home too. It is the conventional way back and costs
            nothing, but it is an affordance and not a label, so the link carries
            its own text and the image is decorative.
          -->
          <RouterLink
            to="/"
            class="rounded-lg focus:outline-hidden focus:ring-2 focus:ring-brand-500/20"
          >
            <BrandMark class="size-12" aria-hidden="true" />
            <span class="sr-only">IT Learning Hub home</span>
          </RouterLink>

          <h1 class="mt-4 text-title-lg text-gray-900 dark:text-white/90">{{ title }}</h1>
          <p v-if="description" class="mt-1 text-sm text-slate dark:text-slate">
            {{ description }}
          </p>
        </div>

        <slot />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The frame every unauthenticated page shares: the landing page's way back, the
 * logo, a title, and a centred card for the page's own content.
 *
 * This exists so "how do I get out of here" is answered in exactly one place.
 * Four separate copies of the same wrapper had drifted, and all four of them had
 * the same gap.
 */
import { RouterLink } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import BrandMark from '@/components/common/BrandMark.vue'
import CommonGridShape from '@/components/common/CommonGridShape.vue'
import ThemeToggleButton from '@/components/common/ThemeToggleButton.vue'

defineProps<{
  /** Heading for the card. Plain text: every page here uses a plain sentence. */
  title: string
  /** Optional supporting line under the heading. */
  description?: string
}>()
</script>
