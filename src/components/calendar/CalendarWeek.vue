<script setup lang="ts">
/**
 * A week view, for the days around today.
 *
 * A month answers "when is it". A week answers "what is happening now", which is a
 * different question and the one a student has when they open the calendar to see
 * whether this week's deadline is still open.
 *
 * Columns stack below `sm`. Seven columns at 360px is 51px each, and a time, a
 * title and a course do not fit in that, so a horizontal-scrolling week would hide
 * most of itself behind a gesture nobody makes.
 */
import { computed } from 'vue'
import { Clock, MapPin } from 'lucide-vue-next'
import type { CalendarEvent } from '@/services/calendar.service'
import { EVENT_PRESENTATION } from '@/services/calendar.service'
import { formatTime } from '@/components/calendar/format'

const props = defineProps<{
  events: CalendarEvent[]
  /** Any date inside the week being shown. */
  anchor: Date
}>()

const emit = defineEmits<{
  'update:anchor': [date: Date]
  select: [isoDate: string]
}>()

function isoOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

const todayIso = computed(() => isoOf(new Date()))

/** Monday of the anchor's week. */
const weekStart = computed(() => {
  const date = props.anchor
  const monday = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - ((date.getDay() + 6) % 7),
  )
  return monday
})

const days = computed(() =>
  Array.from({ length: 7 }, (_, i) => {
    const date = new Date(
      weekStart.value.getFullYear(),
      weekStart.value.getMonth(),
      weekStart.value.getDate() + i,
    )
    const iso = isoOf(date)
    const all = props.events.filter((e) => isoOf(new Date(e.at)) === iso)
    return {
      iso,
      date,
      isToday: iso === todayIso.value,
      events: all,
      // Coming up before what already happened, for the same reason the month sorts
      // that way: the point of looking is usually what is still ahead.
      upcoming: all.filter((e) => e.tense !== 'past'),
      past: all.filter((e) => e.tense === 'past'),
    }
  }),
)

const weekLabel = computed(() => {
  const first = days.value[0].date
  const last = days.value[6].date
  const sameMonth = first.getMonth() === last.getMonth()
  const opts: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: sameMonth ? undefined : 'short',
  }
  return `${first.toLocaleDateString(undefined, opts)} – ${last.toLocaleDateString(undefined, {
    ...opts,
    month: 'short',
    year: 'numeric',
  })}`
})

function shiftWeek(delta: number): void {
  const next = new Date(
    weekStart.value.getFullYear(),
    weekStart.value.getMonth(),
    weekStart.value.getDate() + delta * 7,
  )
  emit('update:anchor', next)
}

function goToToday(): void {
  const now = new Date()
  emit('update:anchor', now)
  emit('select', todayIso.value)
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="flex size-9 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
          aria-label="Previous week"
          @click="shiftWeek(-1)"
        >
          <svg viewBox="0 0 20 20" fill="none" class="size-4 rtl:rotate-180" aria-hidden="true">
            <path
              d="M12.5 4 6.5 10l6 6"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          class="flex size-9 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
          aria-label="Next week"
          @click="shiftWeek(1)"
        >
          <svg viewBox="0 0 20 20" fill="none" class="size-4 rtl:rotate-180" aria-hidden="true">
            <path
              d="M7.5 4l6 6-6 6"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <h2 class="ms-2 text-lg font-semibold text-ink" aria-live="polite">{{ weekLabel }}</h2>
      </div>

      <button
        type="button"
        class="min-h-9 rounded-md border border-hairline px-3 text-sm font-medium text-slate transition-colors hover:bg-surface hover:text-ink dark:border-white/10 dark:hover:bg-white/[0.06]"
        @click="goToToday"
      >
        Today
      </button>
    </div>

    <div class="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
      <div
        v-for="day in days"
        :key="day.iso"
        class="rounded-lg border p-3"
        :class="
          day.isToday
            ? 'border-brand-400 bg-brand-50 dark:border-brand-500/40 dark:bg-brand-500/[0.08]'
            : 'border-hairline dark:border-white/10'
        "
      >
        <button
          type="button"
          class="flex w-full items-baseline justify-between gap-2 text-start"
          :aria-label="`Select ${day.date.toLocaleDateString(undefined, { dateStyle: 'full' })}`"
          @click="emit('select', day.iso)"
        >
          <span
            class="text-xs font-medium tracking-wide uppercase"
            :class="day.isToday ? 'text-brand-700 dark:text-brand-300' : 'text-stone'"
          >
            {{ day.date.toLocaleDateString(undefined, { weekday: 'short' }) }}
          </span>
          <span
            class="text-lg font-semibold tabular-nums"
            :class="day.isToday ? 'text-brand-700 dark:text-brand-300' : 'text-ink'"
          >
            {{ day.date.getDate() }}
          </span>
        </button>

        <ul role="list" class="mt-2 flex flex-col gap-1.5">
          <li v-for="event in day.upcoming" :key="event.id">
            <component
              :is="event.link ? 'router-link' : 'span'"
              :to="event.link ?? undefined"
              class="block rounded-md px-2 py-1.5 text-xs leading-5 transition-colors"
              :class="event.link ? 'hover:bg-white/60 dark:hover:bg-white/[0.06]' : ''"
            >
              <span class="flex items-center gap-1.5">
                <span
                  class="size-1.5 shrink-0 rounded-full"
                  :class="EVENT_PRESENTATION[event.kind].tone.split(' ')[0]"
                  aria-hidden="true"
                />
                <span class="truncate font-medium text-ink">{{ event.title }}</span>
              </span>
              <span class="mt-0.5 flex items-center gap-1 text-xs text-slate">
                <Clock class="size-3 shrink-0" aria-hidden="true" />
                {{ formatTime(event.at) }}
              </span>
              <span
                v-if="event.courseTitle"
                class="mt-0.5 flex items-center gap-1 truncate text-xs text-slate"
              >
                <MapPin class="size-3 shrink-0" aria-hidden="true" />
                {{ event.courseTitle }}
              </span>
            </component>
          </li>

          <li v-if="day.past.length" class="pt-1">
            <details class="group">
              <summary
                class="cursor-pointer list-none text-xs text-slate transition-colors hover:text-slate"
              >
                {{ day.past.length }} earlier
              </summary>
              <ul role="list" class="mt-1 flex flex-col gap-1">
                <li v-for="event in day.past" :key="event.id" class="px-2 py-1 text-xs text-slate">
                  <span class="flex items-center gap-1.5">
                    <span
                      class="size-1.5 shrink-0 rounded-full opacity-60"
                      :class="EVENT_PRESENTATION[event.kind].tone.split(' ')[0]"
                      aria-hidden="true"
                    />
                    <span class="truncate">{{ event.title }}</span>
                  </span>
                </li>
              </ul>
            </details>
          </li>

          <li v-if="day.events.length === 0" class="px-2 py-1.5 text-xs text-stone">Nothing</li>
        </ul>
      </div>
    </div>
  </div>
</template>
