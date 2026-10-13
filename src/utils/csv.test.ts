import { describe, it, expect } from 'vitest'
import { adminPaymentsToCsv, gradingQueueToCsv } from './csv'
import type { GradingQueueItem } from '@/services/instructor.service'
import type { AdminPayment } from '@/services/admin.service'

/**
 * The grading queue as a CSV download.
 *
 * An instructor's gradebook lives outside this product - in a spreadsheet, in
 * the school's records system - and retyping two hundred rows is how errors
 * get in. The export carries exactly what the queue shows: one row per
 * submission, grades blank where ungraded rather than zero (a blank cell says
 * "not marked"; a zero says "marked zero", and those are different facts).
 */
function item(overrides: Partial<GradingQueueItem> = {}): GradingQueueItem {
  return {
    id: 'sub-1',
    assignmentId: 'a1',
    courseId: 'c1',
    studentId: 's1',
    submissionText: 'Work',
    filePath: null,
    submittedAt: '2026-10-08T12:23:00Z',
    grade: null,
    feedback: null,
    gradedBy: null,
    gradedAt: null,
    status: 'submitted',
    assignmentTitle: 'Decision table exercise',
    assignmentInstructions: null,
    maxPoints: 50,
    dueAt: null,
    courseTitle: 'Programming Foundations',
    studentName: 'Shan Lee Kian Garmino',
    studentEmail: 'garmino.shanleekian@ncst.edu.ph',
    ...overrides,
  }
}

describe('gradingQueueToCsv', () => {
  it('writes one header plus one row per submission', () => {
    const csv = gradingQueueToCsv([item(), item({ id: 'sub-2', grade: 42 })])
    const lines = csv.trim().split('\r\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe(
      'Student,Email,Course,Assignment,Status,Grade,Max points,Submitted at,Graded at',
    )
  })

  it('leaves the grade blank when ungraded rather than writing zero', () => {
    const [, row] = gradingQueueToCsv([item()]).trim().split('\r\n')
    // Grade is the 6th column; empty, not 0.
    expect(row.split(',')[5]).toBe('')
  })

  it('quotes fields containing commas, quotes or newlines', () => {
    const csv = gradingQueueToCsv([
      item({ studentName: 'Tan, "Bo"', assignmentTitle: 'Line one\nLine two' }),
    ])
    expect(csv).toContain('"Tan, ""Bo"""')
    expect(csv).toContain('"Line one\nLine two"')
  })

  it('an empty queue still downloads a header, not an empty file', () => {
    expect(gradingQueueToCsv([]).trim().split('\r\n')).toHaveLength(1)
  })
})

/**
 * The payments ledger as a CSV download.
 *
 * This is a reconciliation export, not a report: an administrator's job here is
 * to match this list against the provider's own dashboard, row by row. So the
 * provider's own reference number is a column in its own right, and the amount
 * is exported as a plain decimal in the payment's currency rather than as the
 * integer centavos the database stores - a spreadsheet that has to be divided by
 * 100 before anyone can check the total is a spreadsheet people get wrong.
 */
function payment(overrides: Partial<AdminPayment> = {}): AdminPayment {
  return {
    id: 'pay-1',
    studentId: 's1',
    studentName: 'Shan Lee Kian Garmino',
    courseId: 'c1',
    courseTitle: 'Security+ Exam Preparation',
    amountCentavos: 249900,
    currency: 'PHP',
    status: 'paid',
    provider: 'PayMongo',
    providerPaymentId: 'pay_mongo_abc123',
    providerCheckoutId: 'chk_9f8e7d',
    referenceNumber: 'ITH-2026-0001',
    paidAt: '2026-10-02T09:14:00Z',
    createdAt: '2026-10-02T09:12:40Z',
    ...overrides,
  }
}

describe('adminPaymentsToCsv', () => {
  it('writes one header plus one row per payment', () => {
    const csv = adminPaymentsToCsv([
      payment(),
      payment({ id: 'pay-2', status: 'pending', paidAt: null }),
    ])
    const lines = csv.trim().split('\r\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe(
      'Reference,Student,Course,Amount,Currency,Status,Provider,Provider payment id,Provider checkout id,Paid at,Raised at',
    )
  })

  it('exports centavos as a decimal amount, not as the stored integer', () => {
    const [, row] = adminPaymentsToCsv([payment()]).trim().split('\r\n')
    // Amount is the 4th column: 249900 centavos is 2499.00, not 249900.
    expect(row.split(',')[3]).toBe('2499.00')
  })

  it('leaves a pending payment with no paid date blank rather than inventing one', () => {
    const pendingCsv = adminPaymentsToCsv([payment({ status: 'pending', paidAt: null })])
    const [, row] = pendingCsv.trim().split('\r\n')
    const columns = row.split(',')
    expect(columns[9]).toBe('')
    expect(columns[5]).toBe('pending')
  })

  it('quotes fields containing commas, quotes or newlines', () => {
    const csv = adminPaymentsToCsv([
      payment({ studentName: 'Tan, "Bo"', courseTitle: 'Line one\nLine two' }),
    ])
    expect(csv).toContain('"Tan, ""Bo"""')
    expect(csv).toContain('"Line one\nLine two"')
  })

  it('an empty ledger still downloads a header, not an empty file', () => {
    expect(adminPaymentsToCsv([]).trim().split('\r\n')).toHaveLength(1)
  })
})
