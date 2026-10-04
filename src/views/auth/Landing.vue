<template>
  <div class="bg-white dark:bg-gray-900">
    <!-- Header -->
    <header class="border-b border-gray-200 dark:border-gray-800">
      <div
        class="mx-auto flex max-w-(--breakpoint-2xl) items-center justify-between px-4 py-4 md:px-6"
      >
        <div class="flex items-center gap-3">
          <img src="/images/logo/logo-icon.svg" alt="IT Learning Hub" class="size-9" />
          <span class="text-title-sm text-gray-900 dark:text-white/90">IT Learning Hub</span>
        </div>
        <nav class="flex items-center gap-2">
          <!--
            The theme switch, so a visitor can read the landing page in dark mode
            before deciding to sign up. Same component and same position as the
            auth pages and the app header, which is why it is a component rather
            than a fourth hand-rolled button.
          -->
          <ThemeToggleButton class="me-1" />
          <router-link
            to="/auth/login"
            class="rounded px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06]"
          >
            Sign in
          </router-link>
          <router-link
            to="/auth/register"
            class="rounded bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600"
          >
            Get started
          </router-link>
        </nav>
      </div>
    </header>

    <!-- Hero -->
    <section class="mx-auto max-w-(--breakpoint-2xl) px-4 py-14 md:px-6 md:py-20">
      <div class="grid items-center gap-10 lg:grid-cols-2">
        <div>
          <p
            class="mb-3 inline-flex rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-400"
          >
            {{ BRAND.tagline }}
          </p>
          <h1
            class="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl lg:text-4xl dark:text-white/90"
          >
            Practical IT training, taught by working instructors.
          </h1>
          <p class="mt-4 max-w-lg text-gray-600 dark:text-gray-400">
            Build real skills across programming, networking and support. Enrol in a course, work
            through the lessons at your own pace, and track how far you have come.
          </p>
          <div class="mt-7 flex flex-col gap-3 sm:flex-row">
            <router-link
              to="/auth/register"
              class="inline-flex items-center justify-center gap-2 rounded bg-brand-500 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-600"
            >
              Create a free account
              <ArrowRight class="size-4" />
            </router-link>
            <router-link
              to="/auth/login"
              class="inline-flex items-center justify-center gap-2 rounded border border-gray-300 px-5 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.06]"
            >
              Sign in
            </router-link>
          </div>
        </div>

        <div class="hidden lg:block">
          <CommonGridShape />
        </div>
      </div>
    </section>

    <!-- Course catalogue -->
    <section
      class="border-t border-gray-200 bg-gray-50 py-14 dark:border-gray-800 dark:bg-gray-900/40"
    >
      <div class="mx-auto max-w-(--breakpoint-2xl) px-4 md:px-6">
        <h2 class="text-title-md text-gray-900 dark:text-white/90">Course catalogue</h2>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Every published course is listed here. Sign in to enrol.
        </p>

        <div class="mt-8">
          <EmptyState
            title="No courses published yet"
            description="Courses appear here as soon as an instructor publishes them. Sign in to enrol once the catalogue is live."
            :icon="BookOpen"
          >
            <router-link
              to="/auth/register"
              class="inline-flex items-center gap-2 rounded bg-brand-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600"
            >
              Create an account
            </router-link>
          </EmptyState>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="border-t border-gray-200 py-8 dark:border-gray-800">
      <div
        class="mx-auto flex max-w-(--breakpoint-2xl) flex-col items-center justify-between gap-3 px-4 text-sm text-gray-500 sm:flex-row dark:text-gray-400 md:px-6"
      >
        <p>{{ BRAND.name }}</p>
        <p>Payments processed securely in Philippine pesos.</p>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ArrowRight, BookOpen } from 'lucide-vue-next'
import CommonGridShape from '@/components/common/CommonGridShape.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ThemeToggleButton from '@/components/common/ThemeToggleButton.vue'
import { BRAND } from '@/layouts/navigation'
</script>
