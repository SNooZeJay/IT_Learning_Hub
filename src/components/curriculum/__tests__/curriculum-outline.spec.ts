// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import CurriculumOutline from '@/components/curriculum/CurriculumOutline.vue'
import type { CurriculumModule, CurriculumSummary } from '@/types'

/**
 * The student outline as navigation, not as a printout.
 *
 * This page used to render every module open with every lesson summary,
 * material and body inline - three modules filled a phone screen with no way
 * to move except scrolling. The fix is structural: modules and lessons are
 * disclosures now, and the bodies live behind them.
 *
 * The instructor side is explicitly out of scope: `editable` keeps the flat,
 * always-expanded list with the numbered toggle buttons, byte for byte. A
 * test below pins that so the student rebuild cannot move it.
 */
function progress(status: 'completed' | 'in_progress' | 'not_started') {
  return {
    id: 'p',
    enrollmentId: 'e',
    lessonId: 'l',
    studentId: 's',
    status,
    progressPercent: status === 'completed' ? 100 : 10,
    lastPositionSeconds: null,
    startedAt: '2026-01-01',
    completedAt: status === 'completed' ? '2026-01-02' : null,
  } as const
}

function lesson(
  id: string,
  status: 'completed' | 'in_progress' | 'not_started',
  withMaterials = true,
) {
  return {
    id,
    position: 1,
    title: `Lesson ${id}`,
    summary: `Summary body for ${id} that must stay hidden until expanded`,
    lessonType: 'article',
    durationMinutes: 12,
    isRequired: true,
    status: 'published',
    materials: withMaterials
      ? [
          {
            id: `m-${id}`,
            lessonId: id,
            title: `File for ${id}`,
            materialType: 'file',
            position: 1,
            contentText: null,
            externalUrl: null,
            filePath: null,
            fileType: null,
            fileSize: null,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ]
      : [],
    progress: progress(status),
  } as unknown as CurriculumModule['lessons'][number]
}

function module(id: string, position: number, lessons: ReturnType<typeof lesson>[]) {
  return {
    id,
    position,
    title: `Module ${id}`,
    description: `Description for ${id}`,
    status: 'published',
    lessons,
  } as CurriculumModule
}

const summary = {
  moduleCount: 2,
  lessonCount: 3,
  materialCount: 2,
  completedLessonCount: 1,
  completionPercent: 33,
} as CurriculumSummary

const stubs = { RouterLink: { template: '<a><slot /></a>' } }

describe('student outline navigation', () => {
  const modules = [
    module('a', 1, [lesson('a1', 'completed'), lesson('a2', 'in_progress')]),
    module('b', 2, [lesson('b1', 'not_started', false)]),
  ]

  it('opens the first incomplete module and keeps the rest collapsed', () => {
    const wrapper = mount(CurriculumOutline, {
      props: { modules, summary },
      global: { stubs },
    })
    const moduleTriggers = wrapper
      .findAll('[data-slot="accordion-trigger"]')
      .filter((t) => t.text().includes('Module '))
    expect(moduleTriggers.length).toBe(2)
    // Module A has an incomplete lesson: open. Module B: closed.
    expect(moduleTriggers[0].attributes('aria-expanded')).toBe('true')
    expect(moduleTriggers[1].attributes('aria-expanded')).toBe('false')
    // The open module shows its lessons; the closed one shows none.
    expect(wrapper.text()).toContain('Lesson a1')
    expect(wrapper.text()).not.toContain('Lesson b1')
  })

  it('collapses everything when the course is complete', () => {
    const done = [
      module('a', 1, [lesson('a1', 'completed', false)]),
      module('b', 2, [lesson('b1', 'completed', false)]),
    ]
    const wrapper = mount(CurriculumOutline, {
      props: { modules: done, summary },
      global: { stubs },
    })
    for (const trigger of wrapper.findAll('[data-slot="accordion-trigger"]')) {
      expect(trigger.attributes('aria-expanded')).toBe('false')
    }
  })

  it('toggles a module open and closed from the header', async () => {
    const wrapper = mount(CurriculumOutline, {
      props: { modules, summary },
      global: { stubs },
    })
    const moduleTriggerB = wrapper
      .findAll('[data-slot="accordion-trigger"]')
      .find((t) => t.text().includes('Module b'))
    expect(moduleTriggerB).toBeTruthy()
    await moduleTriggerB!.trigger('click')
    expect(moduleTriggerB!.attributes('aria-expanded')).toBe('true')
    expect(wrapper.text()).toContain('Lesson b1')
    await moduleTriggerB!.trigger('click')
    expect(moduleTriggerB!.attributes('aria-expanded')).toBe('false')
  })

  it('hides lesson bodies and materials until the lesson is expanded', async () => {
    const wrapper = mount(CurriculumOutline, {
      props: { modules, summary },
      global: { stubs },
    })
    // Module A is open, but its lessons start collapsed: summaries and
    // materials are in the DOM only behind their disclosures.
    expect(wrapper.text()).not.toContain('Summary body for a1')
    expect(wrapper.text()).not.toContain('File for a1')

    const lessonTriggers = wrapper.findAll('[data-slot="accordion-trigger"]')
    // First trigger is module A; second is lesson a1 inside it.
    const lessonTrigger = lessonTriggers.find((t) => t.text().includes('Lesson a1'))
    expect(lessonTrigger).toBeTruthy()
    await lessonTrigger!.trigger('click')
    expect(wrapper.text()).toContain('Summary body for a1')
    expect(wrapper.text()).toContain('File for a1')
  })

  it('keeps progress visible in collapsed headers', () => {
    const wrapper = mount(CurriculumOutline, {
      props: { modules, summary },
      global: { stubs },
    })
    // Module B is collapsed and still states its fraction; lesson b1's
    // trigger is not rendered, but module A's open lessons show status.
    expect(wrapper.text()).toMatch(/0 of 1 complete|1 of 2 complete/)
    expect(wrapper.text()).toContain('12 min')
  })

  it('lesson triggers are keyboard-focusable buttons with labelled state', () => {
    const wrapper = mount(CurriculumOutline, {
      props: { modules, summary },
      global: { stubs },
    })
    for (const trigger of wrapper.findAll('[data-slot="accordion-trigger"]')) {
      expect(trigger.element.tagName).toBe('BUTTON')
      expect(trigger.attributes('aria-expanded')).toMatch(/^(true|false)$/)
    }
  })
})

describe('instructor outline is untouched', () => {
  it('renders everything expanded with the numbered toggles, no accordion', () => {
    const modules = [module('a', 1, [lesson('a1', 'completed')])]
    const wrapper = mount(CurriculumOutline, {
      props: { modules, editable: true },
      global: { stubs },
    })
    expect(wrapper.findAll('[data-slot="accordion-trigger"]').length).toBe(0)
    expect(wrapper.text()).toContain('Lesson a1')
    expect(wrapper.text()).toContain('Summary body for a1')
    // The existing numbered toggle button survives with its accessible name.
    expect(wrapper.find('button[aria-label="Collapse module 1"]').exists()).toBe(true)
  })
})
