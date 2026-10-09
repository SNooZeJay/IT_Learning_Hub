<script setup lang="ts">
/**
 * The calendar: a month or week grid, with the selected day's events beside it.
 *
 * This is the part that makes it a calendar rather than a list. The grids say
 * *when*; the panel says *what*, and links to it. Neither does the other's job,
 * which is the distinction the previous version of this page collapsed - it was a
 * list of due dates under a "Calendar" heading and in the navigation.
 *
 * The month and the week share one event array and one selection, so switching view
 * does not lose where you were. The week opens on the week containing the selected
 * date, not today, because arriving from a month cell is the common case.
 */
import { computed, ref, watch } from 'vue'
import { LayoutGrid, Rows3 } from 'lucide-vue-next'
import CalendarMonth from './CalendarMonth.vue'
import CalendarWeek from './CalendarWeek.vue'
import CalendarDayDetail from './CalendarDayDetail.vue'
import type { CalendarEvent } from '@/services/calendar.service'
import { EVENT_PRESENTATION } from '@/services/calendar.service'
import { isoDate } from './format'

const props = defineProps<{
  events: CalendarEvent[]
  /** Who the calendar belongs to, used only for the empty-state wording. */
  audience: 'student' | 'instructor'
}>()

type View = 'month' | 'week'
const view = ref<View>('month')

const today = new Date()
const anchor = ref(new Date(today.getFullYear(), today.getMonth(), 1))
const selectedDate = ref<string>(isoDate(today))

/** Counts by kind, for the legend. Only kinds actually present are shown. */
const presentKinds = computed(() => {
  const counts = new Map<string, number>()
  for (const event of props.events) {
    counts.set(event.kind, (counts.get(event.kind) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([kind, count]) => ({
      kind,
      count,
      meta: EVENT_PRESENTATION[kind as keyof typeof EVENT_PRESENTATION],
    }))
})

/** True when nothing at all is on the calendar. */
const isEmpty = computed(() => props.events.length === 0)

/** Coming up: dated and not yet past. Drives the "next" rail. */
const upcoming = computed(() =>
  props.events
    .filter((e) => e.tense !== 'past')
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    .slice(0, 3),
)

function select(iso: string): void {
  selectedDate.value = iso
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return
  // Clicking a dimmed day from the neighbouring month should move the grid to it,
  // otherwise the selection appears to have done nothing.
  if (
    view.value === 'month' &&
    (date.getMonth() !== anchor.value.getMonth() ||
      date.getFullYear() !== anchor.value.getFullYear())
  ) {
    anchor.value = new Date(date.getFullYear(), date.getMonth(), 1)
  }
}

watch(view, (next) => {
  if (next === 'week') {
    const date = new Date(`${selectedDate.value}T00:00:00`)
    if (!Number.isNaN(date.getTime())) anchor.value = date
  } else {
    const date = new Date(`${selectedDate.value}T00:00:00`)
    if (!Number.isNaN(date.getTime()))
      anchor.value = new Date(date.getFullYear(), date.getMonth(), 1)
  }
})
</script>

<template>
  <div>
    <!-- View switch. Two segments, because it is a genuine either-or and not a menu. -->
    <div
      class="inline-flex rounded-md border border-hairline p-0.5 dark:border-white/10"
      role="group"
      aria-label="Calendar view"
    >
      <button
        type="button"
        class="inline-flex min-h-9 items-center gap-1.5 rounded-[5px] px-3 text-sm font-medium transition-colors"
        :class="view === 'month' ? 'bg-brand-600 text-white' : 'text-slate hover:text-ink'"
        :aria-pressed="view === 'month'"
        @click="view = 'month'"
      >
        <LayoutGrid class="size-4" aria-hidden="true" />
        Month
      </button>
      <button
        type="button"
        class="inline-flex min-h-9 items-center gap-1.5 rounded-[5px] px-3 text-sm font-medium transition-colors"
        :class="view === 'week' ? 'bg-brand-600 text-white' : 'text-slate hover:text-ink'"
        :aria-pressed="view === 'week'"
        @click="view = 'week'"
      >
        <Rows3 class="size-4" aria-hidden="true" />
        Week
      </button>
    </div>

    <!-- Legend. Only the kinds this calendar actually contains. A legend listing
         nine types when two are present is noise. -->
    <ul
      v-if="presentKinds.length"
      role="list"
      class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2"
    >
      <li v-for="item in presentKinds" :key="item.kind" class="flex items-center gap-1.5">
        <span
          class="size-2 shrink-0 rounded-full"
          :class="item.meta.tone.split(' ')[0]"
          aria-hidden="true"
        />
        <span class="text-xs text-slate">
          {{ item.meta.label }}
          <span class="text-stone tabular-nums">({{ item.count }})</span>
        </span>
      </li>
    </ul>

    <div class="mt-5 grid gap-6 lg:grid-cols-3">
      <div class="min-w-0 lg:col-span-2">
        <CalendarMonth
          v-if="view === 'month'"
          :events="events"
          :anchor="anchor"
          :selected-date="selectedDate"
          @update:anchor="anchor = $event"
          @select="select"
        />
        <CalendarWeek
          v-else
          :events="events"
          :anchor="anchor"
          @update:anchor="anchor = $event"
          @select="select"
        />
      </div>

      <div class="flex flex-col gap-6">
        <CalendarDayDetail :events="events" :date="selectedDate" />

        <!--
          The rail. Shown only when there is something ahead - a fixed-height panel
          reading "nothing due" is a dead component most days of the year.
        -->
        <section v-if="upcoming.length" aria-labelledby="calendar-upcoming-heading">
          <h3 id="calendar-upcoming-heading" class="text-theme-sm text-ink">Coming up</h3>
          <ul role="list" class="mt-3 flex flex-col gap-2">
            <li v-for="event in upcoming" :key="event.id">
              <component
                :is="event.link ? 'router-link' : 'div'"
                :to="event.link ?? undefined"
                class="block rounded-lg border border-hairline p-3 transition-colors dark:border-white/10"
                :class="event.link ? 'hover:border-brand-400 dark:hover:border-brand-500' : ''"
              >
                <span class="block text-sm font-medium text-ink">{{ event.title }}</span>
                <span class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate">
                  <span
                    class="rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase"
                    :class="EVENT_PRESENTATION[event.kind].tone"
                  >
                    {{ EVENT_PRESENTATION[event.kind].label }}
                  </span>
                  <span class="tabular-nums">
                    {{
                      new Date(event.at).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                      })
                    }}
                  </span>
                </span>
                <span v-if="event.courseTitle" class="mt-0.5 block truncate text-xs text-stone">
                  {{ event.courseTitle }}
                </span>
              </component>
            </li>
          </ul>
        </section>
      </div>
    </div>

    <!--
      The honest empty state.

      This is the outcome a new account sees, because there is genuinely nothing on
      their calendar yet. It says what the calendar is waiting for rather than
      apologising for being empty, and it does not offer a button that would have
      nothing to do.
    -->
    <div
      v-if="isEmpty"
      class="mt-6 rounded-lg border border-dashed border-hairline px-6 py-12 text-center dark:border-white/10"
    >
      <LayoutGrid class="mx-auto size-8 text-stone" aria-hidden="true" />
      <h2 class="mt-3 text-theme-sm text-ink">Nothing on your calendar yet</h2>
      <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-slate">
        <template v-if="audience === 'student'">
          Dates appear here as you enroll in a course, sit a quiz, complete a lesson and reach a
          deadline. Nothing has to be set up first.
        </template>
        <template v-else>
          Dates appear here as students enroll in your courses, sit your quizzes, and as you publish
          content and set assignment deadlines.
        </template>
      </p>
    </div>
  </div>
</template>
