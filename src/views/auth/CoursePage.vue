<template>
  <!--
    The public course page, on the landing page's surface.

    This is the last public page that was still on the pre-landing palette, and it
    is one click from every card on `/courses` and on the landing page.

    What did NOT change, and is the important part: the query, the privacy
    decision, the outline rules, every fact shown, the enrolment copy and the
    enrolment action. Lesson bodies, summaries, material titles and links are
    still absent, because a public page that leaks paid content is a hole in the
    paywall rather than a marketing page. Only the structure is public.

    The three badges are plain pills rather than `Badge.vue`, matching every other
    converted public surface - the landing page's cards and featured card both
    draw their own. Keeping one pill idiom across the six public pages is worth
    more here than keeping a shared component alive on one of them.
  -->
  <div class="relative isolate min-h-screen overflow-x-clip bg-lp-canvas text-lp-ink">
    <div class="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div
        class="absolute -top-48 -start-40 size-[36rem] rounded-full bg-lp-glow-green opacity-70 blur-3xl"
      ></div>
      <div
        class="absolute -top-24 -end-48 size-[42rem] rounded-full bg-lp-glow-beige opacity-80 blur-3xl"
      ></div>
      <div
        class="absolute top-[46rem] -end-32 size-[30rem] rounded-full bg-lp-glow-peach opacity-60 blur-3xl"
      ></div>
    </div>

    <!--
      The landing page's header, byte for byte - same pill, same controls, same
      wrap behaviour below 375px. There is deliberately no `Courses` link: the
      breadcrumb immediately below this bar is the way back, and two routes to the
      same page a few centimetres apart is noise.
    -->
    <header class="sticky top-0 z-40 px-4 pt-4 md:px-6 md:pt-5">
      <div
        class="mx-auto max-w-6xl rounded-3xl border border-lp-line bg-lp-card/85 shadow-lp-nav backdrop-blur-xl 2xsm:rounded-full"
      >
        <div
          class="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 px-3 py-2.5 2xsm:flex-nowrap 2xsm:justify-between 2xsm:gap-x-3 2xsm:px-4 md:px-5"
        >
          <RouterLink to="/" class="flex min-w-0 items-center gap-2.5">
            <BrandMark class="size-8 shrink-0" />
            <span
              class="sr-only truncate text-[15px] font-semibold tracking-tight text-lp-ink md:not-sr-only"
            >
              IT Learning Hub
            </span>
          </RouterLink>

          <div class="flex shrink-0 items-center gap-0.5 2xsm:gap-1.5 md:gap-2">
            <ThemeToggleButton />
            <RouterLink
              to="/auth/login"
              class="rounded-full px-3 py-2 text-sm font-medium text-lp-slate transition-colors hover:bg-lp-canvas hover:text-lp-ink sm:px-3.5 md:px-4"
            >
              Sign in
            </RouterLink>
            <RouterLink
              to="/auth/register"
              class="rounded-full bg-lp-ink px-3.5 py-2 text-sm font-medium text-lp-ink-inverse shadow-lp-button transition-colors hover:opacity-90 sm:px-4 md:px-5"
            >
              Get Started
            </RouterLink>
          </div>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 pt-8 pb-20 md:px-6 md:pt-12 md:pb-28">
      <!--
        The way out, at the top of the content rather than in the navbar - for the
        reason given on the catalogue page. A fourth control in the bar overflowed
        the pill by 24px at 320px; here it costs the header nothing.

        Note this page therefore has three routes home: this link, the brand, and
        the breadcrumb's "Home" crumb below. The breadcrumb says where this course
        sits in the hierarchy and this says how to leave the site, which is why both
        were kept - but the crumb is the one to drop if that is ever a concern.

        `-ms-3` pulls the pill's own padding back so the label is optically aligned
        with the page edge. The arrow points toward the start of the reading
        direction, so it flips in RTL.
      -->
      <RouterLink
        to="/"
        class="-ms-3 mb-6 inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-lp-slate transition-colors hover:bg-lp-accent-soft hover:text-lp-accent"
      >
        <ArrowLeft class="size-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
        Back to home
      </RouterLink>

      <!--
        Each crumb carries its own padding so the link box clears 24px. A bare
        text link measures about 17px, which is a fiddly target on a phone.
      -->
      <nav aria-label="Breadcrumb" class="mb-8">
        <ol class="flex flex-wrap items-center text-sm text-lp-slate">
          <li class="-ms-2">
            <RouterLink
              to="/"
              class="inline-flex min-h-6 items-center rounded-lg px-2 py-1 transition-colors hover:bg-lp-accent-soft hover:text-lp-accent"
              >Home</RouterLink
            >
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <RouterLink
              to="/courses"
              class="inline-flex min-h-6 items-center rounded-lg px-2 py-1 transition-colors hover:bg-lp-accent-soft hover:text-lp-accent"
            >
              Courses
            </RouterLink>
          </li>
          <li aria-hidden="true">/</li>
          <li class="min-w-0 truncate px-2 text-lp-ink" aria-current="page">
            {{ loading ? 'Loading' : (course?.title ?? 'Not found') }}
          </li>
        </ol>
      </nav>

      <div v-if="loading" class="py-20 text-center" role="status" aria-live="polite">
        <LoaderCircle class="mx-auto size-5 animate-spin text-lp-slate" />
        <p class="mt-3 text-sm text-lp-slate">Loading course…</p>
      </div>

      <Alert
        v-else-if="errorMessage"
        variant="error"
        title="Could not load this course"
        :message="errorMessage"
      />

      <!-- A draft or archived course has no public page. Say so plainly rather than 404. -->
      <EmptyState
        v-else-if="!course"
        title="This course is not published"
        description="Published courses are open to everyone. This one is not available on the catalogue yet."
        :icon="BookOpen"
      >
        <RouterLink
          to="/courses"
          class="mt-4 inline-block rounded-full bg-lp-ink px-5 py-2.5 text-sm font-medium text-lp-ink-inverse"
        >
          Back to all courses
        </RouterLink>
      </EmptyState>

      <template v-else>
        <article class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-10">
          <div class="min-w-0">
            <!--
              The cover sits on the accent tint rather than `surface`, so the
              level-drawn placeholder reads as the same warm green it reads as on
              the cards, and a real thumbnail lands on a matching ground.
            -->
            <div
              :style="{ '--stagger-i': 0 }"
              class="lp-hero-step relative aspect-16/9 w-full overflow-hidden rounded-2xl border border-lp-line bg-lp-accent-soft"
            >
              <img
                v-if="course.thumbnailUrl"
                :src="course.thumbnailUrl"
                :alt="`Cover for ${course.title}`"
                class="size-full object-cover"
              />
              <div v-else class="flex size-full items-center justify-center p-10">
                <LevelPattern
                  :level="course.level"
                  :module-count="course.moduleCount"
                  class="size-full text-lp-accent"
                />
              </div>
            </div>

            <!-- Price reads as the emphasis pill; level and category are quiet. -->
            <div :style="{ '--stagger-i': 1 }" class="lp-hero-step mt-6 flex flex-wrap items-center gap-2">
              <span
                class="rounded-full bg-lp-ink px-3 py-1 text-xs font-medium text-lp-ink-inverse"
              >
                {{ priceLabel }}
              </span>
              <span
                class="rounded-full bg-lp-accent-soft px-3 py-1 text-xs font-medium text-lp-accent"
              >
                {{ LEVEL_LABELS[course.level] }}
              </span>
              <span
                class="rounded-full border border-lp-line px-3 py-1 text-xs font-medium text-lp-slate"
              >
                {{ course.categoryName ?? 'Uncategorized' }}
              </span>
              <span class="text-xs font-medium text-lp-slate">Published course</span>
            </div>

            <h1
              :style="{ '--stagger-i': 2 }"
              class="lp-hero-step mt-4 font-display text-3xl leading-[1.1] font-semibold tracking-tight text-balance text-lp-ink sm:text-4xl md:text-[2.75rem]"
            >
              {{ course.title }}
            </h1>

            <p
              v-if="course.description"
              :style="{ '--stagger-i': 3 }"
              class="lp-hero-step mt-4 max-w-2xl text-base leading-relaxed text-lp-slate"
            >
              {{ course.description }}
            </p>

            <!--
              Four items, one per concern, stated in words. `gap-px` over the
              container's own line colour draws the dividers, which is how this was
              built before and is still the cheapest way to get hairlines that stop
              at the rounded corners.
            -->
            <dl
              :style="{ '--stagger-i': 4 }"
              class="lp-hero-step mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-lp-line bg-lp-line sm:grid-cols-4"
            >
              <div v-for="fact in facts" :key="fact.label" class="bg-lp-card px-5 py-4">
                <dt
                  class="text-[11px] font-medium tracking-[0.12em] text-lp-slate uppercase"
                >
                  {{ fact.label }}
                </dt>
                <dd class="mt-1.5 font-display text-base font-semibold text-lp-ink">
                  {{ fact.value }}
                </dd>
              </div>
            </dl>

            <section v-if="objectives.length" class="mt-12">
              <h2 class="font-display text-2xl font-semibold tracking-tight text-lp-ink">
                What you will learn
              </h2>
              <ul class="mt-5 space-y-3">
                <li
                  v-for="objective in objectives"
                  :key="objective"
                  class="flex gap-3 text-base leading-relaxed text-lp-slate"
                >
                  <span
                    class="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-lp-accent-soft text-lp-accent"
                    aria-hidden="true"
                  >
                    <Check class="size-3" />
                  </span>
                  <span class="whitespace-pre-line">{{ objective }}</span>
                </li>
              </ul>
            </section>

            <section class="mt-12">
              <h2 class="font-display text-2xl font-semibold tracking-tight text-lp-ink">
                Course outline
              </h2>
              <p class="mt-3 max-w-2xl text-sm leading-relaxed text-lp-slate">
                Module and lesson titles only. Lesson content and materials stay private until you
                enroll.
              </p>

              <p
                v-if="modules.length === 0"
                class="mt-6 rounded-2xl border border-lp-line bg-lp-card px-5 py-6 text-sm text-lp-slate"
              >
                This course has no published outline yet.
              </p>

              <!--
                THE OUTLINE, arriving as a list.

                This is the one place on this page where a stagger is right rather
                than merely available: a course's modules ARE a list, in order, and the
                reader is scanning for how many there are. A sequence that walks down
                the list says "these are separate things in a sequence" - which is
                exactly what the numbering already says, now confirmed by the motion.

                Capped at four steps. A ten-module course would otherwise take 600ms
                for its last module to begin, and someone comparing two courses would
                be waiting on one of them.

                `:key` is the module id, not the index, so a course whose outline loads
                after the page does not re-animate the modules that were already there.
              -->
              <ol v-else class="mt-6 space-y-4">
                <li
                  v-for="(module, index) in modules"
                  :key="module.id"
                  :style="{ '--stagger-i': index }"
                  class="lp-stagger rounded-2xl border border-lp-line bg-lp-card p-5 sm:p-6"
                >
                  <h3 class="font-display text-base font-semibold text-lp-ink">
                    <span class="text-lp-slate">Module {{ index + 1 }}</span>
                    · {{ module.title }}
                  </h3>

                  <p v-if="module.lessons.length === 0" class="mt-2 text-sm text-lp-slate">
                    No published lessons in this module yet.
                  </p>

                  <ul v-else class="mt-4 space-y-2.5">
                    <li
                      v-for="(lesson, lessonIndex) in module.lessons"
                      :key="lesson.id"
                      class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
                    >
                      <span class="text-lp-slate"> Lesson {{ lessonIndex + 1 }} </span>
                      <span class="text-lp-ink">{{ lesson.title }}</span>
                      <!--
                        No Required/Optional badge here, unlike the old system's
                        course page. That field does not exist on this schema, so
                        every badge would read "Required" - which is not a badge,
                        it is a constant pretending to be information. The schema's
                        real distinction is lesson_type, and is_preview, and
                        neither is part of the public grant.
                      -->
                      <span v-if="lesson.durationMinutes" class="text-lp-slate">
                        {{ lesson.durationMinutes }} min
                      </span>
                    </li>
                  </ul>
                </li>
              </ol>
            </section>
          </div>

          <!--
            Enrolment block. Checked before the course type, so someone who has
            already paid is never offered a pay button.

            `lg:top-24` clears the floating header, which is pill height plus its
            top offset - the old `lg:top-6` tucked the card under it.
          -->
          <aside class="lg:sticky lg:top-24 lg:self-start">
            <div class="rounded-2xl border border-lp-line bg-lp-card p-6 shadow-lp-card">
              <p class="font-display text-3xl font-semibold tracking-tight text-lp-ink">
                {{ priceLabel }}
              </p>

              <p class="mt-4 text-sm leading-relaxed text-lp-slate">{{ enrollmentMessage }}</p>

              <RouterLink
                v-if="primaryAction"
                :to="primaryAction.to"
                class="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-lp-ink px-5 text-sm font-medium text-lp-ink-inverse shadow-lp-button transition-opacity hover:opacity-90"
              >
                {{ primaryAction.label }}
              </RouterLink>

              <p class="mt-4 text-xs text-lp-slate">Browsing needs no account.</p>
            </div>
          </aside>
        </article>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
/**
 * The public course page.
 *
 * The important rule on this page is what it does NOT show. Lesson bodies,
 * lesson summaries, material titles, material bodies and material links are all
 * absent, because a public page that leaks paid content is not a marketing page,
 * it is a hole in the paywall. Only the structure is public: module and lesson
 * titles, badges and durations.
 */
import { describeSupabaseError } from '@/services/supabase/client'
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ArrowLeft, BookOpen, Check, LoaderCircle } from 'lucide-vue-next'
import Alert from '@/components/ui/Alert.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import BrandMark from '@/components/common/BrandMark.vue'
import ThemeToggleButton from '@/components/common/ThemeToggleButton.vue'
import LevelPattern from '@/components/catalogue/LevelPattern.vue'
import {
  LEVEL_LABELS,
  formatPrice,
  getPublicCourseOutline,
  listPublishedCourses,
} from '@/services/catalogue.service'
import type { CatalogueCourse, PublicModule } from '@/services/catalogue.service'

const route = useRoute()

const course = ref<CatalogueCourse | null>(null)
const modules = ref<PublicModule[]>([])
const loading = ref(true)
const errorMessage = ref('')

const slug = computed(() => String(route.params.slug ?? ''))

onMounted(async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    // The catalogue service is the read model that already filters to published
    // and carries the counts, so the page gets its card data and its privacy
    // decision from the same place rather than trusting the router.
    const listed = await listPublishedCourses()
    const match = listed.find((c) => c.slug === slug.value)
    course.value = match ?? null

    // Only ask for the outline once the course is known to be published. A draft's
    // modules are not public, so requesting them would be denied rather than
    // return nothing, and the page would show an error instead of "not published".
    if (course.value) {
      modules.value = await getPublicCourseOutline(course.value.id)
    }
  } catch (error) {
    errorMessage.value = describeSupabaseError(error)
  } finally {
    loading.value = false
  }
})

const isPaid = computed(() => (course.value?.priceCentavos ?? 0) > 0)

/**
 * "Free" or a peso amount, from the service's shared formatter.
 *
 * This was a third private copy of the price rule, and unlike the first two it
 * had no `if (centavos <= 0)` guard - it always produced `₱0` and relied on every
 * call site guarding it with `isPaid ? ... : 'Free'`. `formatPrice` handles both
 * cases itself, so those guards are gone and there is one rule left.
 */
const priceLabel = computed(() => formatPrice(course.value?.priceCentavos ?? 0))

/**
 * Objectives live in the description as line breaks on this schema, so they are
 * split rather than stored twice. No objectives means no section, rather than an
 * empty one.
 */
const objectives = computed(() =>
  (course.value?.description ?? '')
    .split(/\r?\n+/)
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter((line) => line.length > 3 && line.length < 160),
)

const facts = computed(() => {
  const c = course.value
  if (!c) return []
  // Four items, one per concern, as the product spec requires. Lesson counts are
  // deliberately absent: the outline below already lists every lesson by name, so
  // a count here would restate what the reader is looking at.
  return [
    { label: 'Price', value: priceLabel.value },
    // The instructor is never named publicly, so this slot states what is
    // actually known rather than leaking an account.
    { label: 'Instructor', value: 'IT Learning Hub' },
    { label: 'Modules', value: String(c.moduleCount) },
    {
      label: 'Published',
      value: c.publishedAt
        ? new Date(c.publishedAt).toLocaleDateString('en-PH', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : 'Recently',
    },
  ]
})

const enrollmentMessage = computed(() =>
  isPaid.value
    ? 'This course is paid. Lesson content and materials stay locked until a payment is confirmed.'
    : 'This course is free. Enroll to start your learning record.',
)

const primaryAction = computed(() =>
  isPaid.value
    ? { to: '/auth/register', label: 'Create an account to enroll' }
    : { to: '/auth/register', label: 'Create a free account to enroll' },
)
</script>
