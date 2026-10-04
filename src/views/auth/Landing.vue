<template>
  <div class="min-h-screen bg-canvas">
    <!--
      Public topbar.

      Thin on purpose. A visitor has no dashboard to reach, so this carries the
      brand, the catalogue, the theme switch and the account actions. Every
      destination here is a route that exists - a link to something unbuilt is a
      defect, not a placeholder.
    -->
    <header class="sticky top-0 z-40 border-b border-hairline bg-canvas/85 backdrop-blur-md">
      <div
        class="mx-auto flex max-w-(--breakpoint-2xl) items-center justify-between gap-4 px-4 py-3.5 md:px-6"
      >
        <RouterLink to="/" class="flex min-w-0 items-center gap-2.5">
          <BrandMark class="size-9 shrink-0" />
          <span class="truncate text-title-sm text-ink">IT Learning Hub</span>
        </RouterLink>

        <nav class="flex items-center gap-1 sm:gap-2">
          <RouterLink
            to="/courses"
            class="hidden rounded-md px-3 py-2 text-sm font-medium text-slate transition-colors hover:bg-surface sm:inline-block"
          >
            Courses
          </RouterLink>
          <ThemeToggleButton class="size-10" />
          <RouterLink
            to="/auth/login"
            class="rounded-md px-3 py-2 text-sm font-medium text-slate transition-colors hover:bg-surface"
          >
            Sign in
          </RouterLink>
          <RouterLink
            to="/auth/register"
            class="rounded-md bg-ink px-3 py-2 text-sm font-medium text-canvas transition-colors hover:bg-charcoal"
          >
            Create account
          </RouterLink>
        </nav>
      </div>
    </header>

    <main>
      <!--
        HERO.

        One action, and it is the first thing below the headline. The secondary
        link sits underneath as text rather than beside it as a second button,
        because two filled buttons is the generic SaaS habit and only one of them
        is really the call to action.

        The headline is set in the serif. Inter carries everything else on this
        page - all body copy, all labels, all controls - so the editorial voice is
        confined to the places where a publication would use one.
      -->
      <section class="border-b border-hairline">
        <div class="mx-auto max-w-(--breakpoint-2xl) px-4 py-16 md:px-6 md:py-24">
          <div class="grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16">
            <div class="max-w-2xl">
              <h1
                class="font-display text-4xl leading-[1.08] font-semibold tracking-[-0.02em] text-balance text-ink sm:text-5xl md:text-6xl"
              >
                Learn IT skills through structured, practical courses.
              </h1>

              <p class="mt-6 max-w-xl text-lg leading-relaxed text-slate">
                IT Learning Hub gives you organised learning materials, lessons and quizzes — with
                your progress tracked from the first lesson to the last.
              </p>

              <div class="mt-9">
                <RouterLink
                  to="/courses"
                  class="inline-flex h-12 items-center gap-2 rounded-md bg-brand-500 px-6 text-sm font-medium text-white transition-colors hover:bg-brand-600"
                >
                  Explore courses
                  <ArrowRight class="size-4" aria-hidden="true" />
                </RouterLink>
              </div>

              <p class="mt-4 text-sm text-slate">
                Browsing is open to everyone. You only need an account to enrol.
              </p>
            </div>

            <!--
              What a learner actually does, in order. Not a screenshot and not a
              mockup: these are the four real stages, stated as a sequence, because
              the sequence IS the product's difference from a video library.
            -->
            <div class="lg:pt-3">
              <ol class="border-s border-hairline ps-6 sm:ps-8">
                <li
                  v-for="(stage, index) in stages"
                  :key="stage.title"
                  class="relative pb-7 last:pb-0"
                >
                  <span
                    class="absolute -start-[1.9rem] top-0.5 flex size-6 items-center justify-center rounded-full border border-hairline bg-canvas text-xs font-semibold text-slate sm:-start-[2.4rem] bg-canvas"
                    aria-hidden="true"
                  >
                    {{ index + 1 }}
                  </span>
                  <h2 class="text-sm font-semibold text-ink">
                    {{ stage.title }}
                  </h2>
                  <p class="mt-1 text-sm leading-relaxed text-slate">
                    {{ stage.body }}
                  </p>
                </li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      <!--
        WHAT YOU CAN LEARN.

        The disciplines, as an editorial list rather than a grid of icon tiles. A
        grid of eight identical cards is the shape the category always reaches
        for, and it makes every subject look equally important and equally vague.
        A set of rules with real content under them does the opposite.
      -->
      <section class="border-b border-hairline bg-surface">
        <div class="mx-auto max-w-(--breakpoint-2xl) px-4 py-16 md:px-6 md:py-20">
          <div class="grid gap-10 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-16">
            <div>
              <h2 class="font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl">
                What you can learn here
              </h2>
              <p class="mt-4 text-base leading-relaxed text-slate">
                Courses are organised into modules and lessons, so you always know where you are in
                the material and what comes next.
              </p>
            </div>

            <dl class="grid gap-x-10 gap-y-7 sm:grid-cols-2">
              <div
                v-for="area in disciplines"
                :key="area.name"
                class="border-t border-hairline pt-4"
              >
                <dt class="font-display text-lg font-semibold text-ink">
                  {{ area.name }}
                </dt>
                <dd class="mt-1.5 text-sm leading-relaxed text-slate">
                  {{ area.body }}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <!--
        A REAL COURSE.

        This section reads from the database. Every title, peso price and module
        count below is a published course that actually exists, and the whole
        section disappears when none do.

        It is here because "why should I use this" is answered far better by
        showing the product's own content than by describing it. No testimonials,
        no learner counts, no ratings — the catalogue is the proof.
      -->
      <section class="border-b border-hairline">
        <div class="mx-auto max-w-(--breakpoint-2xl) px-4 py-16 md:px-6 md:py-20">
          <div class="flex flex-wrap items-end justify-between gap-4">
            <h2 class="font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl">
              Published courses
            </h2>
            <RouterLink
              to="/courses"
              class="-me-2 group inline-flex min-h-8 items-center gap-1.5 rounded px-2 py-1.5 text-sm font-medium text-brand-600 hover:underline"
            >
              All {{ totalPublished }} {{ totalPublished === 1 ? 'course' : 'courses' }}
              <ArrowRight
                class="size-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </RouterLink>
          </div>

          <div
            v-if="catalogueLoading"
            class="mt-8 py-12 text-center"
            role="status"
            aria-live="polite"
          >
            <LoaderCircle class="mx-auto size-5 animate-spin text-slate" />
            <p class="mt-3 text-sm text-slate">Loading the catalogue…</p>
          </div>

          <Alert
            v-else-if="catalogueError"
            variant="error"
            title="Could not load the catalogue"
            :message="catalogueError"
            class="mt-8"
          />

          <EmptyState
            v-else-if="featured.length === 0"
            class="mt-8"
            title="No courses published yet"
            description="Courses appear here as soon as an instructor publishes them. Sign in to enrol once the catalogue is live."
            :icon="BookOpen"
          >
            <RouterLink
              to="/auth/register"
              class="mt-4 inline-block rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-white"
            >
              Create a free account
            </RouterLink>
          </EmptyState>

          <ul v-else class="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <li v-for="course in featured" :key="course.id">
              <CatalogueCard :course="course" />
            </li>
          </ul>
        </div>
      </section>

      <!--
        INSIDE A COURSE.

        The reading experience and the assessment, drawn as the product draws
        them. Both are real features in the schema, and both are shown as the
        interface a learner meets — the lesson pane and the quiz question — rather
        than as a feature list describing them.

        The quiz shown here is a worked example of the format, marked as such. It
        is not a live assessment and it records nothing.
      -->
      <section class="border-b border-hairline">
        <div class="mx-auto max-w-(--breakpoint-2xl) px-4 py-16 md:px-6 md:py-20">
          <h2 class="font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl">
            Inside a course
          </h2>
          <p class="mt-4 max-w-2xl text-base leading-relaxed text-slate">
            Lessons are written to be read, and quizzes check what you took in. Both sit behind your
            enrolment, so a free course and a paid one give you the same material.
          </p>

          <div class="mt-10 grid gap-6 lg:grid-cols-2">
            <!-- The lesson pane: an outline beside the reading. -->
            <div class="overflow-hidden rounded-lg border border-hairline bg-surface">
              <div class="border-b border-hairline px-5 py-4">
                <p class="text-xs font-medium text-slate">Module 2 · Lesson 4</p>
                <h3 class="mt-1 text-base font-semibold text-ink">Setting up your environment</h3>
              </div>
              <div class="grid sm:grid-cols-[13rem_minmax(0,1fr)]">
                <ol class="border-b border-hairline bg-surface p-3 sm:border-e sm:border-b-0">
                  <li
                    v-for="(lesson, index) in sampleLessons"
                    :key="lesson"
                    class="flex items-baseline gap-2 rounded-md px-2.5 py-2 text-sm"
                    :class="index === 1 ? 'bg-white font-medium text-ink  ' : 'text-slate'"
                  >
                    <span class="text-xs text-slate">{{ index + 1 }}</span>
                    <span class="min-w-0">{{ lesson }}</span>
                  </li>
                </ol>
                <div class="p-5">
                  <p class="text-sm leading-relaxed text-slate">
                    Everything in this course runs from a terminal. Before the first exercise,
                    confirm the tools are installed and on your PATH — the rest of the module
                    assumes they are.
                  </p>
                  <pre
                    class="mt-4 overflow-x-auto rounded-md bg-surface p-3.5 font-mono text-xs leading-relaxed text-ink text-slate"
                  ><code>node --version
python3 --version
git --version</code></pre>
                  <p class="mt-4 flex items-center gap-2 text-xs text-slate">
                    <Clock3 class="size-3.5" aria-hidden="true" />
                    About 12 minutes
                  </p>
                </div>
              </div>
            </div>

            <!-- The quiz. One question, four options, no feedback before submitting. -->
            <div class="overflow-hidden rounded-lg border border-hairline bg-surface">
              <div class="border-b border-hairline px-5 py-4">
                <p class="text-xs font-medium text-slate">Quiz · Question 3 of 5</p>
                <p class="mt-3 font-display text-lg leading-snug font-semibold text-ink">
                  Which command creates a new branch and switches to it in one step?
                </p>
              </div>
              <ul class="space-y-2 p-5">
                <li
                  v-for="(option, index) in sampleOptions"
                  :key="option"
                  class="flex items-center gap-3 rounded-md border border-hairline px-4 py-3"
                >
                  <span
                    class="flex size-6 shrink-0 items-center justify-center rounded-full border border-hairline-strong text-xs font-medium text-slate"
                    aria-hidden="true"
                  >
                    {{ String.fromCharCode(65 + index) }}
                  </span>
                  <span class="font-mono text-sm text-slate">{{ option }}</span>
                </li>
              </ul>
              <p class="border-t border-hairline px-5 py-3 text-xs text-slate">
                Worked example of the question format. Nothing is recorded here.
              </p>
            </div>
          </div>
        </div>
      </section>

      <!--
        CLOSE.

        The page ends on the action, not on a footer of links. Repeating the CTA
        at the end is the one place a second mention is earned rather than
        competing.
      -->
      <section class="bg-ink">
        <div class="mx-auto max-w-(--breakpoint-2xl) px-4 py-16 md:px-6 md:py-20">
          <div class="max-w-2xl">
            <h2
              class="font-display text-3xl font-semibold tracking-tight text-balance text-white md:text-4xl"
            >
              Your next skill is a lesson away.
            </h2>
            <p class="mt-4 text-base leading-relaxed text-white/70">
              Create a free account to enrol in a free course, or pay for one in Philippine pesos.
              Either way your progress is kept from your first lesson.
            </p>
            <RouterLink
              to="/courses"
              class="mt-8 inline-flex h-12 items-center gap-2 rounded-md bg-brand-500 px-6 text-sm font-medium text-white transition-colors hover:bg-brand-400"
            >
              Explore courses
              <ArrowRight class="size-4" aria-hidden="true" />
            </RouterLink>
          </div>
        </div>
      </section>
    </main>

    <!--
      Public footer: brand, link groups, copyright bar. Registration is
      deliberately NOT offered here, and there are no social links.
    -->
    <footer class="border-t border-hairline bg-canvas">
      <div class="mx-auto max-w-(--breakpoint-2xl) px-4 py-12 md:px-6">
        <div class="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div class="flex items-center gap-2.5">
              <BrandMark class="size-8 shrink-0" />
              <span class="text-sm font-semibold text-ink">IT Learning Hub</span>
            </div>
            <p class="mt-3 max-w-xs text-sm leading-relaxed text-slate">
              Structured courses for learning IT skills and concepts, one lesson at a time.
            </p>
          </div>

          <nav v-for="group in footerGroups" :key="group.title" :group>
            <h2 class="text-sm font-semibold text-ink">{{ group.title }}</h2>
            <ul class="mt-3 space-y-1">
              <li v-for="link in group.links" :key="link.label">
                <RouterLink
                  :to="link.to"
                  class="inline-flex min-h-11 items-center text-sm text-slate transition-colors hover:text-ink dark:hover:text-white/90"
                >
                  {{ link.label }}
                </RouterLink>
              </li>
            </ul>
          </nav>
        </div>

        <div
          class="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-6"
        >
          <p class="text-xs text-slate">© {{ year }} IT Learning Hub</p>
          <p class="text-xs text-slate">Payments processed in Philippine pesos.</p>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
/**
 * The public landing page.
 *
 * Structure answers a visitor's questions in the order they actually ask them:
 * what is this, what can I learn, what does it look like inside, why should I
 * start. There is no testimonials section, no learner count and no rating
 * because the product has none, and the product spec forbids inventing them —
 * the catalogue below is the proof instead.
 *
 * The disciplines and the lesson/quiz panels are authored illustration, not
 * screenshots. They are marked as examples wherever they could be mistaken for
 * live data, and nothing on this page records anything.
 */
import { describeSupabaseError } from '@/services/supabase/client'
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowRight, BookOpen, Clock3, LoaderCircle } from 'lucide-vue-next'
import Alert from '@/components/ui/Alert.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import BrandMark from '@/components/common/BrandMark.vue'
import ThemeToggleButton from '@/components/common/ThemeToggleButton.vue'
import CatalogueCard from '@/components/catalogue/CatalogueCard.vue'
import { listPublishedCourses } from '@/services/catalogue.service'
import type { CatalogueCourse } from '@/services/catalogue.service'

/** The four real stages of using the platform, in order. */
const stages = [
  {
    title: 'Pick a course',
    body: 'Browse published courses by subject and level. Free and paid courses sit in the same catalogue.',
  },
  {
    title: 'Work through the lessons',
    body: 'Each course is split into modules and lessons, so you always know what comes next.',
  },
  {
    title: 'Take the quizzes',
    body: 'Quizzes check what you took in and mark you against the course passing score.',
  },
  {
    title: 'Keep your progress',
    body: 'Completed lessons are recorded on your account, so you can stop and pick up where you left off.',
  },
] as const

/**
 * What can be learned here.
 *
 * Written as subject areas rather than a count, because "Programming, Networking,
 * Support, Security, Data" is what a visitor is actually scanning for. The
 * catalogue link below proves which of these exist today.
 */
const disciplines = [
  {
    name: 'Programming',
    body: 'From a first script to object-oriented Python, with the tools a working developer actually uses.',
  },
  {
    name: 'Networking',
    body: 'How traffic moves, how devices are configured, and how to read what a network is telling you.',
  },
  {
    name: 'IT support',
    body: 'Diagnosing and fixing the problems end users hit, and documenting the fix so it does not recur.',
  },
  {
    name: 'Security',
    body: 'Preparing for recognised security certifications, covering the theory and the practical checks.',
  },
  {
    name: 'Web and APIs',
    body: 'Building against HTTP services, consuming an API, and handling the data it returns.',
  },
  {
    name: 'Data',
    body: 'Storing, querying and reasoning about data, and knowing when a spreadsheet is the better tool.',
  },
] as const

/** Illustrative module outline for the lesson pane. */
const sampleLessons = [
  'Introduction and setup',
  'How the tools fit together',
  'Your first program',
  'Input and output',
  'Conditionals',
  'Loops and iteration',
  'Functions',
] as const

const sampleOptions = [
  'git branch -c new-branch',
  'git switch -c new-branch',
  'git checkout new-branch -b',
  'git merge new-branch -c',
] as const

const catalogue = ref<CatalogueCourse[]>([])
const catalogueLoading = ref(true)
const catalogueError = ref('')

/** Three is what fits one row at desktop without the grid wrapping awkwardly. */
const featured = ref<CatalogueCourse[]>([])
const totalPublished = ref(0)

onMounted(async () => {
  catalogueLoading.value = true
  catalogueError.value = ''
  try {
    catalogue.value = await listPublishedCourses()
    featured.value = catalogue.value.slice(0, 3)
    totalPublished.value = catalogue.value.length
  } catch (error) {
    catalogueError.value = describeSupabaseError(error)
  } finally {
    catalogueLoading.value = false
  }
})

const year = new Date().getFullYear()

/**
 * Every link here is a route that exists. There is deliberately no Become an
 * instructor, About, Careers or Contact — those pages do not exist, and a footer
 * full of dead destinations is worse than a short one.
 */
const footerGroups = [
  {
    title: 'Learn',
    links: [
      { label: 'Browse courses', to: '/courses' },
      { label: 'Create an account', to: '/auth/register' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Sign in', to: '/auth/login' },
      { label: 'Reset password', to: '/auth/forgot-password' },
    ],
  },
] as const
</script>
