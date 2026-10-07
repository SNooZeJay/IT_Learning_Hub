<script setup lang="ts">
/**
 * The screen before an assessment starts.
 *
 * The brief for this milestone is explicit that a student must read a warning
 * before being dropped into the first question, and the old Laravel system had
 * exactly that: a facts grid, then a four-way branch on what they are allowed to
 * do next. Both are kept.
 *
 * What is added is the part that was missing everywhere. Fullscreen is requested
 * when the quiz begins, tab-switching is counted, and a student who finds that
 * out by being ejected mid-question has been treated badly. So it is all stated
 * here, in advance, in plain words, including the thing nobody can promise:
 * these checks are deterrence, not security.
 */
import { computed } from 'vue'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileQuestion,
  HelpCircle,
  ListChecks,
  Maximize,
  Monitor,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
} from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import type { QuizBriefing } from '@/services/quiz.service'

const props = defineProps<{
  briefing: QuizBriefing
  /** True when a pass already exists, so no further attempt is needed. */
  alreadyPassed: boolean
  /** True when an unfinished attempt is waiting to be resumed. */
  hasOpenAttempt: boolean
  /** The attempt id to resume, when there is one. */
  openAttemptId: string | null
  starting: boolean
  supportOpen: boolean
}>()

const emit = defineEmits<{
  start: []
  resume: [attemptId: string]
  toggleSupport: []
}>()

const remainingAttempts = computed(() =>
  Math.max(props.briefing.attemptsAllowed - props.briefing.attemptsUsed, 0),
)

const exhausted = computed(() => !props.alreadyPassed && remainingAttempts.value === 0)

/**
 * The best graded result so far.
 *
 * Shown to a student who has failed and is deciding whether to spend another
 * attempt. The old screen carried an attempt history for the same reason, and
 * "you are not doing worse than 40%" is what makes that decision an informed one.
 */
const bestSoFar = computed(() => {
  const value = props.briefing.bestPercentage
  return typeof value === 'number' ? Math.round(value * 100) / 100 : null
})

/**
 * The four ways this screen can end, named.
 *
 * The old system branched four ways here and the reason is still true: each is a
 * genuinely different message, and collapsing them produces either a dead
 * "nothing here" or a Start button that fails when pressed.
 */
const state = computed<'passed' | 'resume' | 'exhausted' | 'ready'>(() => {
  if (props.alreadyPassed) return 'passed'
  if (props.hasOpenAttempt && props.openAttemptId) return 'resume'
  if (exhausted.value) return 'exhausted'
  return 'ready'
})
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <!-- Title and description -->
    <div>
      <p
        class="text-theme-xs font-medium tracking-wide text-brand-600 uppercase dark:text-brand-400"
      >
        Assessment
      </p>
      <h1
        class="mt-2 text-2xl font-semibold tracking-tight text-gray-900 text-balance dark:text-white/90 sm:text-3xl"
      >
        {{ briefing.title }}
      </h1>
      <p
        v-if="briefing.description"
        class="mt-3 text-base leading-7 text-gray-600 dark:text-gray-300"
      >
        {{ briefing.description }}
      </p>
    </div>

    <!-- The facts. Attempts used is shown on purpose: a student who is refused
         needs to know it is because they used them, not because something broke. -->
    <dl
      class="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200 sm:grid-cols-4 dark:border-gray-800 dark:bg-gray-800"
    >
      <div class="bg-white px-4 py-3 dark:bg-white/[0.03]">
        <dt class="text-xs text-gray-500 dark:text-gray-400">Questions</dt>
        <dd class="mt-1 text-lg font-semibold text-gray-900 tabular-nums dark:text-white/90">
          {{ briefing.questionCount }}
        </dd>
      </div>
      <div class="bg-white px-4 py-3 dark:bg-white/[0.03]">
        <dt class="text-xs text-gray-500 dark:text-gray-400">To pass</dt>
        <dd class="mt-1 text-lg font-semibold text-gray-900 tabular-nums dark:text-white/90">
          {{ briefing.passingScore }}%
        </dd>
      </div>
      <div class="bg-white px-4 py-3 dark:bg-white/[0.03]">
        <dt class="text-xs text-gray-500 dark:text-gray-400">Attempts</dt>
        <dd class="mt-1 text-lg font-semibold text-gray-900 tabular-nums dark:text-white/90">
          {{ briefing.attemptsUsed }} of {{ briefing.attemptsAllowed }}
        </dd>
      </div>
      <div class="bg-white px-4 py-3 dark:bg-white/[0.03]">
        <dt class="text-xs text-gray-500 dark:text-gray-400">Time limit</dt>
        <dd class="mt-1 text-lg font-semibold text-gray-900 tabular-nums dark:text-white/90">
          <template v-if="briefing.timeLimitMinutes">
            {{ briefing.timeLimitMinutes }} min
          </template>
          <template v-else>None</template>
        </dd>
      </div>
    </dl>

    <!-- Instructor instructions. This is the author's own text, which is why the
         field exists: the rules are not a hardcoded list the instructor cannot
         change, they are something they wrote for this quiz. -->
    <section
      v-if="briefing.instructions"
      class="mt-6 surface-card"
      aria-labelledby="quiz-instructions-heading"
    >
      <h2 id="quiz-instructions-heading" class="text-theme-sm text-gray-900 dark:text-white/90">
        Before you start
      </h2>
      <p class="mt-3 text-sm leading-7 whitespace-pre-line text-gray-600 dark:text-gray-300">
        {{ briefing.instructions }}
      </p>
    </section>

    <!-- What this quiz does while you take it. Every row here describes something
         the quiz will actually do. Nothing is listed as a deterrent it is not. -->
    <section
      class="mt-6 rounded-lg border border-warning-200 bg-warning-50/60 p-5 dark:border-warning-500/30 dark:bg-warning-500/[0.06]"
      aria-labelledby="quiz-rules-heading"
    >
      <h2
        id="quiz-rules-heading"
        class="flex items-center gap-2 text-theme-sm text-warning-800 dark:text-warning-300"
      >
        <ShieldAlert class="size-4 shrink-0" aria-hidden="true" />
        How this quiz is run
      </h2>

      <ul class="mt-4 flex flex-col gap-3 text-sm leading-6 text-warning-900 dark:text-warning-200">
        <li class="flex gap-2.5">
          <Maximize class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <strong class="font-semibold">The quiz opens fullscreen.</strong> Your browser will
            switch to fullscreen when you start. Leaving it during the quiz counts as a warning.
          </span>
        </li>
        <li class="flex gap-2.5">
          <Monitor class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <strong class="font-semibold">Stay on this tab.</strong> Switching to another tab or
            application is recorded as a warning.
          </span>
        </li>
        <li class="flex gap-2.5">
          <AlertTriangle class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <strong class="font-semibold"
              >{{ briefing.maxWarnings }} warnings end the attempt.</strong
            >
            You will be told each time, and told what is left. On the last one the attempt is
            submitted with whatever you have answered — you are not simply disconnected.
          </span>
        </li>
        <li v-if="briefing.timeLimitMinutes" class="flex gap-2.5">
          <Clock class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <strong class="font-semibold">{{ briefing.timeLimitMinutes }} minute limit.</strong>
            The clock runs on the server, so it cannot be reset by reloading the page. Work saved up
            to that point is still marked.
          </span>
        </li>
        <li v-if="briefing.shuffleQuestions" class="flex gap-2.5">
          <RefreshCw class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <strong class="font-semibold">Questions are shuffled.</strong> Your order is fixed when
            you start, so a reload will not reorder them mid-quiz. Everyone answers the same
            questions with the same correct answers.
          </span>
        </li>
      </ul>

      <!-- Stated plainly rather than implied. A student who believes the check is
           foolproof will do something the browser cannot detect and then feel
           cheated, and one who believes there is no check will not take it
           seriously. The honest middle is the only one that works. -->
      <p
        class="mt-4 border-t border-warning-200 pt-4 text-sm leading-6 text-warning-800/90 dark:border-warning-500/25 dark:text-warning-300/90"
      >
        These checks discourage switching away. They cannot guarantee you are working alone — no
        browser can see a second monitor or another person in the room — and this quiz is not
        proctored. They are here to keep the work yours, not to catch you out.
      </p>
    </section>

    <!-- What happens to the answers. -->
    <section class="mt-6 surface-card" aria-labelledby="quiz-results-heading">
      <h2 id="quiz-results-heading" class="text-theme-sm text-gray-900 dark:text-white/90">
        After you submit
      </h2>
      <ul class="mt-3 flex flex-col gap-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
        <li v-if="bestSoFar !== null" class="flex gap-2.5">
          <TrendingUp class="mt-0.5 size-4 shrink-0 text-gray-400" aria-hidden="true" />
          <span>
            Your best result so far is
            <strong class="font-semibold text-gray-800 dark:text-gray-200">{{ bestSoFar }}%</strong
            >, against a pass mark of {{ briefing.passingScore }}%.
          </span>
        </li>
        <li class="flex gap-2.5">
          <ListChecks class="mt-0.5 size-4 shrink-0 text-gray-400" aria-hidden="true" />
          <span>You get your score, the pass mark, and how many attempts you have left.</span>
        </li>
        <li v-if="briefing.revealAnswers" class="flex gap-2.5">
          <CheckCircle2 class="mt-0.5 size-4 shrink-0 text-gray-400" aria-hidden="true" />
          <span>You can review which questions were right and wrong, with explanations.</span>
        </li>
        <li v-else class="flex gap-2.5">
          <FileQuestion class="mt-0.5 size-4 shrink-0 text-gray-400" aria-hidden="true" />
          <span>
            This quiz does not reveal which questions were right or wrong, so that a later attempt
            is a fair one.
          </span>
        </li>
        <li v-if="remainingAttempts > 0" class="flex gap-2.5">
          <RefreshCw class="mt-0.5 size-4 shrink-0 text-gray-400" aria-hidden="true" />
          <span>
            You have {{ remainingAttempts }}
            {{ remainingAttempts === 1 ? 'attempt' : 'attempts' }} left after this one.
          </span>
        </li>
      </ul>
    </section>

    <!-- Support. An integration point, not a messaging system: it reveals where
         to ask, and emits so a future help panel can be wired in here without
         this screen changing. -->
    <section
      class="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]"
    >
      <button
        type="button"
        class="flex min-h-11 w-full items-center gap-2 text-start text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
        :aria-expanded="supportOpen"
        aria-controls="quiz-support-panel"
        @click="emit('toggleSupport')"
      >
        <HelpCircle class="size-4 shrink-0" aria-hidden="true" />
        Something wrong, or you cannot start?
      </button>
      <div
        v-if="supportOpen"
        id="quiz-support-panel"
        class="mt-3 border-t border-gray-200 pt-3 dark:border-gray-800"
      >
        <p class="text-sm leading-6 text-gray-600 dark:text-gray-300">
          If the quiz will not start, your connection drops mid-quiz, or something on your screen is
          broken, tell your instructor before you submit. Messages and notifications are not
          connected here yet — your instructor will see the attempt on their results screen either
          way, including any warnings recorded against it.
        </p>
      </div>
    </section>

    <!-- The action. Exactly one of four, and the reason for the next attempt is
         always stated rather than left to be discovered. -->
    <div class="mt-8 border-t border-gray-200 pt-6 dark:border-gray-800">
      <div
        v-if="state === 'passed'"
        class="flex items-start gap-3 rounded-lg border border-success-200 bg-success-50 px-4 py-4 dark:border-success-500/30 dark:bg-success-500/[0.08]"
      >
        <CheckCircle2
          class="mt-0.5 size-5 shrink-0 text-success-600 dark:text-success-400"
          aria-hidden="true"
        />
        <p class="text-sm leading-6 text-success-800 dark:text-success-200">
          <strong class="font-semibold">You have already passed this quiz.</strong> No further
          attempts are needed.
        </p>
      </div>

      <div
        v-else-if="state === 'exhausted'"
        class="flex items-start gap-3 rounded-lg border border-warning-200 bg-warning-50 px-4 py-4 dark:border-warning-500/30 dark:bg-warning-500/[0.08]"
      >
        <AlertTriangle
          class="mt-0.5 size-5 shrink-0 text-warning-600 dark:text-warning-400"
          aria-hidden="true"
        />
        <p class="text-sm leading-6 text-warning-800 dark:text-warning-200">
          <strong class="font-semibold"
            >You have used all {{ briefing.attemptsAllowed }} attempts.</strong
          >
          Your best result stands. Speak to your instructor if you think this is wrong.
        </p>
      </div>

      <div v-else-if="state === 'resume'" class="flex flex-wrap items-center gap-3">
        <Button variant="primary" :disabled="starting" @click="emit('resume', openAttemptId!)">
          <RefreshCw v-if="starting" class="size-4 animate-spin" aria-hidden="true" />
          Resume attempt {{ briefing.attemptsUsed }}
        </Button>
        <p class="section-subheading">
          You have an unfinished attempt. Resuming keeps your answers, your place and your time
          limit.
        </p>
      </div>

      <div v-else class="flex flex-wrap items-center gap-3">
        <Button variant="primary" :disabled="starting" @click="emit('start')">
          <Maximize v-if="starting" class="size-4 animate-spin" aria-hidden="true" />
          {{ starting ? 'Opening the quiz…' : 'Start the quiz' }}
        </Button>
        <p class="section-subheading">
          Starts attempt {{ briefing.attemptsUsed + 1 }} of {{ briefing.attemptsAllowed }}.
        </p>
      </div>
    </div>
  </div>
</template>
