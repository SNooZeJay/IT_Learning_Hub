<script setup lang="ts">
/**
 * One day's events.
 *
 * The detail half of the calendar: clicking a date shows what is on it, with
 * enough to act on - where, when, and a link when there is somewhere to go.
 *
 * Every event is a link when the LMS has a page for it. An event with no
 * destination is rendered as plain text rather than as a dead link, because a
 * clickable row that does nothing is worse than an obviously informational one.
 */
import { computed } from 'vue'
import { CalendarDays, Clock, ExternalLink, MapPin } from 'lucide-vue-next'
import type { CalendarEvent } from '@/services/calendar.service'
import { EVENT_PRESENTATION } from '@/services/calendar.service'
import { formatDayHeading, formatTime } from './format'

const props = defineProps<{
  events: CalendarEvent[]
  /** `YYYY-MM-DD`. */
  date: string
}>()

const dayEvents = computed(() => props.events.filter((e) => e.at.slice(0, 10) === props.date))
</script>

<template>
  <section aria-labelledby="calendar-day-heading">
    <h3 id="calendar-day-heading" class="text-theme-sm text-ink">
      {{ formatDayHeading(date) }}
    </h3>

    <ul v-if="dayEvents.length" role="list" class="mt-3 flex flex-col gap-2">
      <li v-for="event in dayEvents" :key="event.id">
        <component
          :is="event.link ? 'router-link' : 'div'"
          :to="event.link ?? undefined"
          class="flex items-start gap-3 rounded-lg border border-hairline p-3 transition-colors dark:border-white/10"
          :class="
            event.link
              ? 'hover:border-brand-400 hover:bg-brand-50/40 dark:hover:border-brand-500 dark:hover:bg-brand-500/[0.06]'
              : ''
          "
        >
          <span
            class="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase"
            :class="EVENT_PRESENTATION[event.kind].tone"
          >
            {{ EVENT_PRESENTATION[event.kind].label }}
          </span>

          <span class="min-w-0 flex-1">
            <span class="block text-sm font-medium text-ink">{{ event.title }}</span>
            <span class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate">
              <span class="flex items-center gap-1">
                <Clock class="size-3 shrink-0" aria-hidden="true" />
                {{ formatTime(event.at) }}
              </span>
              <span v-if="event.courseTitle" class="flex items-center gap-1">
                <MapPin class="size-3 shrink-0" aria-hidden="true" />
                {{ event.courseTitle }}
              </span>
            </span>
            <span v-if="event.detail" class="mt-1 block text-xs text-stone">{{
              event.detail
            }}</span>
          </span>

          <ExternalLink
            v-if="event.link"
            class="mt-0.5 size-4 shrink-0 text-stone"
            aria-hidden="true"
          />
        </component>
      </li>
    </ul>

    <div
      v-else
      class="mt-3 flex items-center gap-3 rounded-lg border border-dashed border-hairline px-4 py-6 text-sm text-slate dark:border-white/10"
    >
      <CalendarDays class="size-4 shrink-0 text-stone" aria-hidden="true" />
      <span>Nothing on this day.</span>
    </div>
  </section>
</template>
