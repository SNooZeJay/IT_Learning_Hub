import type { GradingQueueItem } from '@/services/instructor.service'

/**
 * Quote one CSV field per RFC 4180: wrap in double quotes when it contains a
 * comma, quote or newline, doubling any quotes inside. Everything else passes
 * through bare, which keeps the common case readable in a text editor.
 */
function field(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * The grading queue as CSV rows, header first.
 *
 * Grades stay blank until marked: a blank cell says "not marked" and a zero
 * says "marked zero", and those are different facts about a student. The
 * export carries exactly what the queue shows - same rows, same order - so
 * the file never disagrees with the screen it was downloaded from.
 */
export function gradingQueueToCsv(items: GradingQueueItem[]): string {
  const header = [
    'Student',
    'Email',
    'Course',
    'Assignment',
    'Status',
    'Grade',
    'Max points',
    'Submitted at',
    'Graded at',
  ]
  const rows = items.map((item) =>
    [
      field(item.studentName),
      field(item.studentEmail),
      field(item.courseTitle),
      field(item.assignmentTitle),
      field(item.status),
      field(item.grade),
      field(item.maxPoints),
      field(item.submittedAt),
      field(item.gradedAt),
    ].join(','),
  )
  return [header.join(','), ...rows].join('\r\n') + '\r\n'
}

/**
 * Offer a CSV string as a file download, with no dependencies.
 *
 * Creates an object URL, clicks a detached anchor, and revokes the URL on the
 * next frame. The anchor is never inserted into the document: programmatic
 * `.click()` on a detached anchor still triggers the download in every
 * browser this product supports.
 */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  requestAnimationFrame(() => URL.revokeObjectURL(url))
}
