/**
 * Date formatting for the calendar.
 *
 * A tiny module rather than inline `toLocaleDateString` calls because the calendar
 * needs the same rule in several places and they must not drift: a day cell, a week
 * column and the day-detail panel all label the same event, and three separately
 * written format strings is how a calendar ends up showing "3 Oct" in one place and
 * "October 3" in another.
 */

/** `YYYY-MM-DD` in local time.
 *
 * Not `toISOString()`, which converts to UTC first and can shift the date by a day
 * either side of the offset. In a timezone behind UTC, an event at 23:00 local on the
 * 5th serialises as the 6th, and the calendar puts it on the wrong day - which is
 * the one bug a calendar cannot have.
 */
export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

/** Time of day, e.g. "3:45 pm". Omits the seconds: nothing here needs them. */
export function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** A full, unambiguous date for a heading. */
export function formatDayHeading(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** Short date for a list row, e.g. "5 Oct". */
export function formatShortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** True when the date is within `days` of today, in the future or the recent past. */
export function isNear(iso: string, days = 7): boolean {
  const target = new Date(`${iso}T00:00:00`).getTime()
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const delta = target - today
  return delta <= days * 86_400_000 && delta >= -days * 86_400_000
}
