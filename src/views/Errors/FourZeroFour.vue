<template>
  <div
    class="relative isolate flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12"
  >
    <CommonGridShape />

    <main class="relative z-10 flex w-full max-w-md flex-col items-center text-center">
      <span
        class="mb-5 inline-flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
      >
        <Compass class="size-6" />
      </span>

      <!-- text-theme-xl is already 600; no font weight class needed. -->
      <p class="text-theme-xl text-brand-600 dark:text-brand-400">404</p>

      <h1 class="mt-2 text-title-lg text-gray-900 dark:text-white/90">That page isn't here</h1>

      <p class="mt-2 section-subheading">
        The link may be out of date, or the page may have moved. Nothing has been lost:
        <template v-if="auth.isAuthenticated"
          >your courses and your work are where you left them.</template
        >
        <template v-else>the catalogue is open and waiting.</template>
      </p>

      <RouterLink
        :to="homeLink"
        class="mt-7 inline-flex items-center gap-2 rounded-md bg-brand-500 px-5 py-3.5 text-sm font-medium text-white shadow-theme-xs transition-colors hover:bg-brand-600 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20"
      >
        <!-- Points back toward the start of the reading direction, so it flips in RTL. -->
        <ArrowLeft class="size-4 rtl:rotate-180" />
        {{ homeLabel }}
      </RouterLink>

      <RouterLink
        v-if="!auth.isAuthenticated"
        to="/courses"
        class="mt-4 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
      >
        Browse the catalogue
      </RouterLink>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowLeft, Compass } from 'lucide-vue-next'
import CommonGridShape from '@/components/common/CommonGridShape.vue'
import { useAuthStore } from '@/stores/auth'

/**
 * The 404, rewritten for this product.
 *
 * Three things it deliberately does not have:
 *
 *   - No third-party credit. The upstream page printed a trademark line for the
 *     template it came from, which this project no longer uses.
 *   - No template illustration. The 404.svg pair was the template's own artwork
 *     in the template's own blue; the product does not share either.
 *   - No physical insets. The footer credit was centred with
 *     `-translate-x-1/2 left-1/2`, which pins it to the left in RTL. There is no
 *     footer now, and nothing here is positioned physically.
 *
 * The way out depends on who hit the page. A signed-in reader wants their own
 * dashboard, not the marketing page; a visitor wants the catalogue. Both are real
 * destinations in the router rather than a link to `/` that may be somewhere they
 * were already trying to leave.
 */
const auth = useAuthStore()

const homeLink = computed(() => (auth.isAuthenticated ? auth.homePath : '/'))

const homeLabel = computed(() =>
  auth.isAuthenticated ? 'Back to my dashboard' : 'Back to the home page',
)
</script>
