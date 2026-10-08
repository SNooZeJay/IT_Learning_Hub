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
   * The unread-notification count is a number a student wants, not a red smear:
   * 40 unread and 1 unread look identical as a dot, and the student is the only one
   * who can act on it.
   *
   * One vocabulary for both counts rather than a second mechanism, so the sidebar
   * badge and the header button for the same thing cannot drift apart.
   */
  badge?: 'notifications' | 'messages'
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
    { label: 'Messages', to: '/messages', icon: MessageSquare, badge: 'messages' },
    // No Notifications item for this role, and that is a real gap rather than an
    // oversight: notifications are written for enrolled students, and
    // `/student/notifications` is `roles: ['student']`. A link here would be refused by
    // the guard. What an instructor needs instead is a way to reach the notifications
    // for a course, and no such screen exists yet. Adding a dead item would be worse
    // than the omission, so the list stays honest and the gap stays visible.
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
    { label: 'Messages', to: '/messages', icon: MessageSquare, badge: 'messages' },
  ],
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

/** Brand name shown in the sidebar and header. */
export const BRAND = {
  name: 'IT Learning Hub',
  tagline: 'Learn it. Build it. Ship it.',
}
