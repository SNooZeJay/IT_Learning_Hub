import { describe, it, expect } from 'vitest'
import {
  ROLE_NAVIGATION,
  navigationGroupsFor,
  notificationsPathFor,
  type NavItem,
} from '../navigation'

function flatItems(): NavItem[] {
  return ROLE_NAVIGATION.admin
}

/**
 * Miller's law applied to the admin sidebar: 10 items in one flat list is past
 * 7±2, so the list is chunked into labeled groups. Student (8) and instructor
 * (8) stay flat — grouping two already-manageable lists would add chrome without
 * removing load.
 */
describe('admin navigation grouping', () => {
  it('chunks the admin list into labeled groups', () => {
    const groups = navigationGroupsFor('admin')
    expect(groups.length).toBeGreaterThan(1)
    // Dashboard and Messages stand alone without a label; the middle groups
    // carry the chunking. Every chunk stays within a glance.
    for (const group of groups) {
      expect(group.items.length).toBeGreaterThan(0)
      expect(group.items.length).toBeLessThanOrEqual(4)
    }
    expect(groups.filter((g) => g.label !== null).length).toBeGreaterThanOrEqual(3)
  })

  it('keeps every admin destination exactly once across the groups', () => {
    const grouped = navigationGroupsFor('admin').flatMap((g) => g.items.map((i) => i.to))
    const flat = flatItems().map((i) => i.to)
    expect([...grouped].sort()).toEqual([...flat].sort())
  })

  it('keeps Dashboard first and Messages last', () => {
    const groups = navigationGroupsFor('admin')
    const first = groups[0].items[0]
    const last = groups[groups.length - 1].items.at(-1)
    expect(first?.to).toBe('/admin/dashboard')
    expect(last?.to).toBe('/messages')
  })

  it('leaves student and instructor as a single group', () => {
    expect(navigationGroupsFor('student')).toHaveLength(1)
    expect(navigationGroupsFor('instructor')).toHaveLength(1)
    expect(navigationGroupsFor('student')[0].items).toHaveLength(ROLE_NAVIGATION.student.length)
    expect(navigationGroupsFor('instructor')[0].items).toHaveLength(
      ROLE_NAVIGATION.instructor.length,
    )
  })
})

/**
 * Every role with a sidebar Notifications item needs the matching page, or the
 * badge counts down to a screen the guard refuses. The mapping lives beside
 * the navigation it must agree with rather than inside the header bell, so a
 * new role gets its link in the same edit that adds its sidebar item.
 */
describe('notificationsPathFor', () => {
  it('points each role at its own notifications page', () => {
    expect(notificationsPathFor('student')).toBe('/student/notifications')
    expect(notificationsPathFor('instructor')).toBe('/instructor/notifications')
    expect(notificationsPathFor('admin')).toBe('/admin/notifications')
  })

  it('agrees with the sidebar: every role that declares the badge gets a path', () => {
    for (const [role, items] of Object.entries(ROLE_NAVIGATION) as Array<
      [Parameters<typeof notificationsPathFor>[0], NavItem[]]
    >) {
      if (items.some((item) => item.badge === 'notifications')) {
        expect(notificationsPathFor(role)).toMatch(/^\/[^/]+\/notifications$/)
      }
    }
  })

  it('sends an unresolved role to the sign-in page, never to a guarded screen', () => {
    expect(notificationsPathFor(null)).toBe('/auth/login')
  })
})
