import type { Component } from 'vue'
import {
  LayoutDashboard,
  BookOpen,
  GraduationCap,
  Wallet,
  CalendarDays,
  Bell,
  Award,
  Library,
  ListChecks,
  Users,
  ChartColumn,
  ShieldCheck,
  FolderTree,
  CreditCard,
  Settings,
} from 'lucide-vue-next'
import type { Role } from '@/types'

export interface NavItem {
  label: string
  to: string
  icon: Component
  /** Small status dot, used for the unread-notification count. */
  badge?: 'notifications'
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
    { label: 'My Grades', to: '/student/grades', icon: Award },
    { label: 'Calendar', to: '/student/calendar', icon: CalendarDays },
    { label: 'Notifications', to: '/student/notifications', icon: Bell, badge: 'notifications' },
  ],

  instructor: [
    { label: 'Dashboard', to: '/instructor/dashboard', icon: LayoutDashboard },
    { label: 'My Courses', to: '/instructor/courses', icon: Library },
    { label: 'Students', to: '/instructor/students', icon: Users },
    { label: 'Grading', to: '/instructor/grading', icon: ListChecks },
    { label: 'Insights', to: '/instructor/analytics', icon: ChartColumn },
    { label: 'Calendar', to: '/instructor/calendar', icon: CalendarDays },
  ],

  admin: [
    { label: 'Dashboard', to: '/admin/dashboard', icon: LayoutDashboard },
    { label: 'Users', to: '/admin/users', icon: ShieldCheck },
    { label: 'Students', to: '/admin/students', icon: GraduationCap },
    { label: 'Instructors', to: '/admin/instructors', icon: Users },
    { label: 'Courses', to: '/admin/courses', icon: Library },
    { label: 'Categories', to: '/admin/categories', icon: FolderTree },
    { label: 'Payments', to: '/admin/payments', icon: Wallet },
    { label: 'Analytics', to: '/admin/analytics', icon: ChartColumn },
    { label: 'Settings', to: '/admin/settings', icon: Settings },
  ],
}

/** Items shown to a signed-out visitor browsing the marketing shell. */
export const VISITOR_NAVIGATION: NavItem[] = [
  { label: 'Catalogue', to: '/', icon: BookOpen },
  { label: 'Payments', to: '/admin/payments', icon: CreditCard },
]

export function navigationFor(role: Role | null): NavItem[] {
  return role ? ROLE_NAVIGATION[role] : VISITOR_NAVIGATION
}

/** Brand name shown in the sidebar and header. */
export const BRAND = {
  name: 'IT Learning Hub',
  tagline: 'Learn it. Build it. Ship it.',
}