<script setup lang="ts">
/**
 * A month grid.
 *
 * Built by hand rather than with a calendar library, deliberately. `@fullcalendar/vue3`
 * is in `package.json` and nothing imports it; its plugins are not installed, so it
 * could not render a month without adding dependencies. AGENTS.md is explicit that
 * new packages are not installed without asking.
 *
 * There is a second reason, which is the reason that actually decided it. FullCalendar
 * ships its own visual language. Using it would mean overriding most of what it does
 * in order to get the LMS's own tokens back, and the result would look like a calendar
 * with a theme applied rather than part of this product. A month grid is a table of
 * dates; writing it means every colour, radius and breakpoint is one of ours.
 *
 * What it has to do, and does:
 *
 *   - six weeks, so the grid does not change height between months, which is the
 *     thing that makes a month view feel unstable when you click through it
 *   - dates from the neighbouring months, dimmed, so a week is never split
 *   - days with events marked, and the count readable without colour
 *   - today outlined, and the selected day inverted
 *   - a keyboard-reachable day button per cell, with the event count in the
 *     accessible name, because a grid of coloured dots says nothing to a screen reader
 *   - collapses to a list of days under `sm`, where a seven-column grid is unreadable
 */
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import type { CalendarEvent, CalendarEventKind } from '@/services/calendar.service'
import { EVENT_PRESENTATION } from '@/services/calendar.service'

const props = defineProps<{
  events: CalendarEvent[]
  /** Any date inside the month being shown. */
  anchor: Date
  selectedDate: string | null
}>()

const emit = defineEmits<{
  'update:anchor': [date: Date]
  select: [isoDate: string]
}>()

/** `YYYY-MM-DD` in local time. Not `toISOString`, which shifts by the offset. */
function isoOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

const todayIso = computed(() => isoOf(new Date()))

const monthLabel = computed(() =>
  props.anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
)

/** Events keyed by local date, so a grid cell is one lookup rather than a scan. */
const byDate = computed(() => {
  const map = new Map<string, CalendarEvent[]>()
  for (const event of props.events) {
    const key = isoOf(new Date(event.at))
    const list = map.get(key) ?? []
    list.push(event)
    map.set(key, list)
  }
  return map
})

interface Cell {
  iso: string
  day: number
  inMonth: boolean
  isToday: boolean
  events: CalendarEvent[]
}

/**
 * Always six weeks.
 *
 * A month is 28, 29, 30 or 31 days, so a naive grid is five rows in most months and
 * six in some. That makes the calendar jump a row's height as you page through it.
 * Six rows always is the standard fix and costs one mostly-empty row.
 */
const weeks = computed<Cell[][]>(() => {
  const year = props.anchor.getFullYear()
  const month = props.anchor.getMonth()

  const firstOfMonth = new Date(year, month, 1)
  // Monday-first, which is the convention in most of the world and in this app's
  // locale. getDay() is Sunday-first.
  const leading = (firstOfMonth.getDay() + 6) % 7
  const gridStart = new Date(year, month, 1 - leading)

  const rows: Cell[][] = []
  for (let w = 0; w < 6; w++) {
    const row: Cell[] = []
    for (let d = 0; d < 7; d++) {
      const date = new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate() + w * 7 + d,
      )
      const iso = isoOf(date)
      row.push({
        iso,
        day: date.getDate(),
        inMonth: date.getMonth() === month,
        isToday: iso === todayIso.value,
        events: byDate.value.get(iso) ?? [],
      })
    }
    rows.push(row)
  }
  return rows
})

/** Distinct kinds on a day, so a cell with three events is not three identical dots.
 *
 * Typed as CalendarEventKind[] rather than string[]: the values index
 * EVENT_PRESENTATION, and a bare string will not index a typed record.
 */
function kindsOf(cell: Cell): CalendarEventKind[] {
  return [...new Set(cell.events.map((e) => e.kind))] as CalendarEventKind[]
}

function shiftMonth(delta: number): void {
  emit('update:anchor', new Date(props.anchor.getFullYear(), props.anchor.getMonth() + delta, 1))
}

function goToToday(): void {
  const today = new Date()
  emit('update:anchor', new Date(today.getFullYear(), today.getMonth(), 1))
  emit('select', todayIso.value)
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
</script>

<template>
  <div>
    <!-- Navigation. Month and year are announced, not just shown. -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="flex size-9 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
          aria-label="Previous month"
          @click="shiftMonth(-1)"
        >
          <ChevronLeft class="size-4 rtl:rotate-180" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="flex size-9 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
          aria-label="Next month"
          @click="shiftMonth(1)"
        >
          <ChevronRight class="size-4 rtl:rotate-180" aria-hidden="true" />
        </button>
        <h2 class="ms-2 text-lg font-semibold text-ink" aria-live="polite">{{ monthLabel }}</h2>
      </div>

      <button
        type="button"
        class="min-h-9 rounded-md border border-hairline px-3 text-sm font-medium text-slate transition-colors hover:bg-surface hover:text-ink dark:border-white/10 dark:hover:bg-white/[0.06]"
        @click="goToToday"
      >
        Today
      </button>
    </div>

    <!-- Month grid, from `sm` up. -->
    <div class="mt-4 hidden sm:block">
      <div class="grid grid-cols-7 border-b border-hairline" role="row">
        <div
          v-for="day in WEEKDAYS"
          :key="day"
          class="py-2 text-center text-xs font-medium tracking-wide text-stone uppercase"
          role="columnheader"
        >
          <span class="hidden md:inline">{{ day }}</span>
          <span class="md:hidden">{{ day.charAt(0) }}</span>
        </div>
      </div>

      <div
        v-for="(week, wi) in weeks"
        :key="wi"
        class="grid grid-cols-7 border-b border-hairline last:border-b-0"
      >
        <div
          v-for="cell in week"
          :key="cell.iso"
          class="min-h-24 border-e border-hairline last:border-e-0 lg:min-h-28"
          role="gridcell"
        >
          <button
            type="button"
            class="flex h-full w-full flex-col items-start gap-1 p-2 text-start transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 dark:hover:bg-white/[0.04]"
            :class="[
              cell.inMonth ? '' : 'opacity-45',
              cell.iso === selectedDate ? 'bg-brand-50 dark:bg-brand-500/10' : '',
            ]"
            :aria-label="
              cell.day +
              (cell.events.length
                ? `, ${cell.events.length} event${cell.events.length === 1 ? '' : 's'}: ` +
                  cell.events.map((e) => e.title).join(', ')
                : ', no events')
            "
            :aria-pressed="cell.iso === selectedDate"
            @click="emit('select', cell.iso)"
          >
            <span
              class="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums"
              :class="
                cell.isToday
                  ? 'bg-brand-600 text-white'
                  : cell.iso === selectedDate
                    ? 'text-brand-700 dark:text-brand-300'
                    : 'text-slate'
              "
            >
              {{ cell.day }}
            </span>

            <!-- Dots, plus a count. Three events and one event must not look the
                 same, and the count is what a screen reader reads out. -->
            <span v-if="cell.events.length" class="flex flex-wrap items-center gap-0.5">
              <span
                v-for="kind in kindsOf(cell).slice(0, 3)"
                :key="kind"
                class="size-1.5 rounded-full"
                :class="EVENT_PRESENTATION[kind].tone.split(' ')[0]"
                aria-hidden="true"
              />
              <!--
                `text-slate` and `text-xs`, not `text-stone` and `text-[10px]`.

                `stone` is #8b8880 and measures 3.25:1 on this app's light surface -
                below the 4.5:1 AA asks of the copy carrying it, and this is the only
                number telling you how much is on a given day. `slate` is 6.6:1 and
                flips with the theme, so the explicit dark pair goes with it.

                10px is also off the type scale: `main.css` sets the smallest step at
                12px, and a count that has to be read next to a coloured dot should not
                be the smallest text in the app.
              -->
              <span class="ms-0.5 text-xs font-medium text-slate tabular-nums">
                {{ cell.events.length }}
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>

    <!-- Month as a list, below `sm`. A seven-column grid at 360px gives each cell
         about 44px, which cannot hold a date and an event indicator legibly. -->
    <ul role="list" class="mt-4 flex flex-col gap-1 sm:hidden">
      <li v-for="week in weeks" :key="week[0].iso">
        <ul role="list" class="flex flex-col gap-1">
          <li v-for="cell in week" :key="cell.iso">
            <button
              type="button"
              class="flex min-h-11 w-full items-center gap-3 rounded-md border px-3 text-start transition-colors"
              :class="[
                cell.inMonth ? 'border-hairline' : 'border-transparent opacity-45',
                cell.iso === selectedDate
                  ? 'border-brand-400 bg-brand-50 dark:border-brand-500/40 dark:bg-brand-500/10'
                  : '',
              ]"
              :aria-pressed="cell.iso === selectedDate"
              @click="emit('select', cell.iso)"
            >
              <span
                class="flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-medium tabular-nums"
                :class="cell.isToday ? 'bg-brand-600 text-white' : 'text-slate'"
              >
                {{ cell.day }}
              </span>
              <span class="min-w-0 flex-1 truncate text-sm text-ink">
                {{
                  cell.events.length
                    ? cell.events.length + (cell.events.length === 1 ? ' event' : ' events')
                    : '—'
                }}
              </span>
              <span v-if="cell.events.length" class="flex shrink-0 items-center gap-0.5">
                <span
                  v-for="kind in kindsOf(cell).slice(0, 3)"
                  :key="kind"
                  class="size-1.5 rounded-full"
                  :class="EVENT_PRESENTATION[kind].tone.split(' ')[0]"
                  aria-hidden="true"
                />
              </span>
            </button>
          </li>
        </ul>
      </li>
    </ul>
  </div>
</template>
