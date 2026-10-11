import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The quiz result's exit must leave, not restart.
 *
 * Both buttons emitted `retake`: "Back to my courses" and "Try again" did the
 * same thing. On a passed quiz the view papered over it by routing inside the
 * retake handler; on a failed quiz with attempts left, the student's explicit
 * choice to leave reloaded the quiz instead. A peak with no exit is a trap,
 * and an exit label that restarts is a lie about what the button does.
 */
describe('quiz result exit', () => {
  const content = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'components/quiz/QuizResultPanel.vue'),
    'utf-8',
  )

  it('declares an exit event distinct from retake', () => {
    expect(content).toMatch(/exit:\s*\[\]/)
  })

  it('wires the Back button to the exit, not to a restart', () => {
    const backButton = content.match(/<Button variant="outline"[^>]*>([\s\S]*?)Back to my courses/)
    expect(backButton).not.toBeNull()
    expect(backButton?.[0]).toMatch(/@click="emit\('exit'\)/)
    expect(backButton?.[0]).not.toMatch(/emit\('retake'\)/)
  })
})
