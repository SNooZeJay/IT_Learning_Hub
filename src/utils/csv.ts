import type { GradingQueueItem } from '@/services/instructor.service'
import type { AdminPayment } from '@/services/admin.service'

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
 * Centavos to the decimal amount a spreadsheet will actually add up.
 *
 * Fixed to two places with no thousands separator: a CSV cell is read by a
 * spreadsheet as a number, and `2,499.00` inside an unquoted cell is two
 * columns, not one. Rounding rather than truncating matters only for a
 * sub-centavo amount, which cannot exist here - the smallest real charge is a
 * whole peso - but a half-up round keeps the value honest if that ever changes.
 */
function amountFromCentavos(amountCentavos: number): string {
  return (Math.round(amountCentavos) / 100).toFixed(2)
}

/**
 * The payments ledger as CSV rows, header first.
 *
 * This one is a reconciliation export rather than a gradebook export, and the
 * difference is why the provider's own identifiers are columns in their own
 * right rather than something an administrator has to reconstruct. Somebody
 * matching this file against the provider's dashboard needs
 * `providerPaymentId` and `providerCheckoutId` present, verbatim, or the
 * comparison is guesswork.
 *
 * Amounts come out as decimals in the payment's own currency, not as the
 * integer centavos Postgres stores, and the currency travels beside the amount
 * because a file of pesos labelled only "Amount" is a file that gets added to a
 * file of dollars one day without anyone noticing.
 *
 * `paidAt` stays blank when null. A pending or failed payment has no paid
 * date, and writing the raised date there would make an unpaid charge look
 * settled to anybody reading the column alone.
 */
export function adminPaymentsToCsv(payments: AdminPayment[]): string {
  const header = [
    'Reference',
    'Student',
    'Course',
    'Amount',
    'Currency',
    'Status',
    'Provider',
    'Provider payment id',
    'Provider checkout id',
    'Paid at',
    'Raised at',
  ]
  const rows = payments.map((payment) =>
    [
      field(payment.referenceNumber),
      field(payment.studentName),
      field(payment.courseTitle),
      field(amountFromCentavos(payment.amountCentavos)),
      field(payment.currency),
      field(payment.status),
      field(payment.provider),
      field(payment.providerPaymentId),
      field(payment.providerCheckoutId),
      field(payment.paidAt),
      field(payment.createdAt),
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
