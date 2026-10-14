import type { Component } from 'vue'
import {
  LayoutDashboard,
  BookOpen,
  GraduationCap,
  Wallet,
  CalendarDays,
  Bell,
  MessageSquare,
  Award,
  Library,
  ListChecks,
  Megaphone,
  NotebookPen,
  Users,
  ChartColumn,
  ShieldCheck,
  FolderTree,
} from 'lucide-vue-next'
import type { Role } from '@/types'

export interface NavItem {
  label: string
  to: string
  icon: Component
  /**
   * A count to show on the item, or `true` for a plain dot.
   *
   * The unread-notification count is a number the reader wants, not a red smear:
   * 40 unread and 1 unread look identical as a dot, and the reader is the one
   * who can act on it.
   *
   * One vocabulary for both counts rather than a second mechanism, so the sidebar
   * badge and the header button for the same thing cannot drift apart.
   */
  badge?: 'notifications' | 'messages'
}

/**
 * A labeled chunk of a role's navigation.
 *
 * The admin list holds eleven destinations, past the 7±2 a person scans as one
 * group, so it renders as labeled chunks instead of one flat list. Student (8)
 * and instructor (9) stay flat: chunking a list that already scans adds chrome
 * without removing load. Groups carry no routes of their own - every destination
 * still lives in exactly one place, and the grouped render must contain the same
 * `to` set as the flat list or the sidebar has lost a page.
 */
export interface NavGroup {
  label: string | null
  items: NavItem[]
}

/**
 * Navigation per role.
 *
 * All three roles share one shell, so the difference between an admin screen
 * and a student screen is this configuration, not a separate layout component.
 * Adding a page is a route plus one entry here; adding a role is one block.
 *
 * The dictionary is keyed by role and access is exhaustive, so a typo in a role
 * name is a compile error rather than a silently empty sidebar.
 */
export const ROLE_NAVIGATION: Record<Role, NavItem[]> = {
  student: [
    { label: 'Dashboard', to: '/student/dashboard', icon: LayoutDashboard },
    { label: 'My Courses', to: '/student/courses', icon: BookOpen },
    { label: 'Quizzes', to: '/student/quizzes', icon: NotebookPen },
    { label: 'Announcements', to: '/student/announcements', icon: Megaphone },
    { label: 'My Grades', to: '/student/grades', icon: Award },
    { label: 'Calendar', to: '/student/calendar', icon: CalendarDays },
    { label: 'Notifications', to: '/student/notifications', icon: Bell, badge: 'notifications' },
    { label: 'Messages', to: '/messages', icon: MessageSquare, badge: 'messages' },
  ],

  instructor: [
    { label: 'Dashboard', to: '/instructor/dashboard', icon: LayoutDashboard },
    { label: 'My Courses', to: '/instructor/courses', icon: Library },
    { label: 'My Students', to: '/instructor/students', icon: Users },
    { label: 'Grading', to: '/instructor/grading', icon: ListChecks },
    { label: 'Announcements', to: '/instructor/announcements', icon: Megaphone },
    { label: 'Insights', to: '/instructor/analytics', icon: ChartColumn },
    { label: 'Calendar', to: '/instructor/calendar', icon: CalendarDays },
    { label: 'Notifications', to: '/instructor/notifications', icon: Bell, badge: 'notifications' },
    { label: 'Messages', to: '/messages', icon: MessageSquare, badge: 'messages' },
  ],

  admin: [
    { label: 'Dashboard', to: '/admin/dashboard', icon: LayoutDashboard },
    { label: 'Users', to: '/admin/users', icon: ShieldCheck },
    { label: 'Students', to: '/admin/students', icon: GraduationCap },
    { label: 'Instructors', to: '/admin/instructors', icon: Users },
    { label: 'Courses', to: '/admin/courses', icon: Library },
    { label: 'Categories', to: '/admin/categories', icon: FolderTree },
    { label: 'Payments', to: '/admin/payments', icon: Wallet },
    { label: 'Announcements', to: '/admin/announcements', icon: Megaphone },
    { label: 'Analytics', to: '/admin/analytics', icon: ChartColumn },
    { label: 'Notifications', to: '/admin/notifications', icon: Bell, badge: 'notifications' },
    { label: 'Messages', to: '/messages', icon: MessageSquare, badge: 'messages' },
  ],
}

/**
 * Where the "view all notifications" link goes for each role.
 *
 * Every role with a sidebar Notifications item needs its own page, or the
 * badge counts down to a screen the guard refuses. Kept beside the navigation
 * it must agree with - the spec asserts the two cannot drift - rather than
 * inside the header bell that renders the link.
 */
export function notificationsPathFor(role: Role | null): string {
  switch (role) {
    case 'student':
      return '/student/notifications'
    case 'instructor':
      return '/instructor/notifications'
    case 'admin':
      return '/admin/notifications'
    default:
      return '/auth/login'
  }
}

/**
 * The fallback shown when the role could not be read.
 *
 * There is deliberately nothing in it.
 *
 * `navigationFor(null)` is not the signed-out case. `auth.role` is derived from the
 * profile, and `stores/auth.ts` sets the profile to `null` when the profile fetch
 * fails - so a signed-in user with a transient database error got this list. It
 * offered "Catalogue" pointing at `/`, which the navigation guard then bounced back
 * to their home, and "Payments" pointing at `/admin/payments`, which is
 * `roles: ['admin']` and bounced too. Two items, both wrong, for whoever saw them.
 *
 * There is no visitor shell either: `AppLayout` wraps guarded routes only, so a
 * genuinely signed-out visitor never sees a sidebar. Emptying this means a failed
 * profile read shows the sidebar's recovery state instead of a menu of links that
 * all lead somewhere the guard will refuse.
 */
export const UNKNOWN_ROLE_NAVIGATION: NavItem[] = []

export function navigationFor(role: Role | null): NavItem[] {
  return role ? ROLE_NAVIGATION[role] : UNKNOWN_ROLE_NAVIGATION
}

const ADMIN_GROUPS: NavGroup[] = [
  { label: null, items: [ROLE_NAVIGATION.admin[0]] },
  {
    label: 'People',
    items: ROLE_NAVIGATION.admin.filter((item) =>
      ['/admin/users', '/admin/students', '/admin/instructors'].includes(item.to),
    ),
  },
  {
    label: 'Content',
    items: ROLE_NAVIGATION.admin.filter((item) =>
      ['/admin/courses', '/admin/categories'].includes(item.to),
    ),
  },
  {
    label: 'Operations',
    items: ROLE_NAVIGATION.admin.filter((item) =>
      [
        '/admin/payments',
        '/admin/announcements',
        '/admin/analytics',
        '/admin/notifications',
      ].includes(item.to),
    ),
  },
  { label: null, items: [ROLE_NAVIGATION.admin[ROLE_NAVIGATION.admin.length - 1]] },
]

/**
 * A role's navigation as labeled chunks.
 *
 * Only admin is chunked; every other role renders the flat list as one group
 * with the role's existing section label. The sidebar calls this instead of
 * `navigationFor`, so a role gains grouping by appearing here and nothing else
 * changes about how its items render.
 */
export function navigationGroupsFor(role: Role | null): NavGroup[] {
  if (role === 'admin') return ADMIN_GROUPS
  const items = navigationFor(role)
  return [{ label: null, items }]
}

/** Brand name shown in the sidebar and header. */
export const BRAND = {
  name: 'IT Learning Hub',
  tagline: 'Learn it. Build it. Ship it.',
}
