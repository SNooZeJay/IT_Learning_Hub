import { describe, it, expect } from 'vitest'
import { gradingQueueToCsv } from './csv'
import type { GradingQueueItem } from '@/services/instructor.service'

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
