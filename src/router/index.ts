import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

/**
 * Route shape for the LMS.
 *
 * `meta.roles` is UX only: it keeps people out of screens they cannot use and
 * gives them a sensible landing page. It is NOT the security boundary. Every
 * read and write is filtered by Supabase Row Level Security against
 * `auth.uid()`, so editing client state buys nothing. See section 5 of
 * docs/superpowers/specs/2026-10-04-lms-foundation-design.md.
 */
declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    /** Roles permitted on this route. Absent or empty means any signed-in role. */
    roles?: Role[]
    /** Route requires a session. Defaults to true for every non-auth route. */
    public?: boolean
  }
}

export type Role = 'admin' | 'instructor' | 'student'

/** Where each role lands after signing in, and after an unauthorised visit. */
export const ROLE_HOME: Record<Role, string> = {
  admin: '/admin/dashboard',
  instructor: '/instructor/dashboard',
  student: '/student/dashboard',
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'landing',
    component: () => import('@/views/auth/Landing.vue'),
    // No meta.title: this is the brand page, and the guard falls back to the
    // bare brand name rather than rendering "IT Learning Hub | IT Learning Hub".
    meta: { public: true },
  },

  // ---- Authentication -----------------------------------------------------
  {
    // The public catalogue. This is where the landing page's primary action
    // goes, so a visitor who is not ready to make an account can still see what
    // they would be enrolling in. Declared before /courses/:slug so the static
    // segment wins over the parameter.
    path: '/courses',
    name: 'catalog',
    component: () => import('@/views/auth/Catalog.vue'),
    meta: { title: 'Courses', public: true },
  },
  {
    path: '/courses/:slug',
    name: 'public-course',
    component: () => import('@/views/auth/CoursePage.vue'),
    meta: { title: 'Course', public: true },
  },
  {
    path: '/auth/login',
    name: 'login',
    component: () => import('@/views/auth/Login.vue'),
    meta: { title: 'Sign in', public: true },
  },
  {
    path: '/auth/register',
    name: 'register',
    component: () => import('@/views/auth/Register.vue'),
    meta: { title: 'Create account', public: true },
  },
  {
    path: '/auth/forgot-password',
    name: 'forgot-password',
    component: () => import('@/views/auth/ForgotPassword.vue'),
    meta: { title: 'Reset password', public: true },
  },
  {
    path: '/auth/reset-password',
    name: 'reset-password',
    component: () => import('@/views/auth/ResetPassword.vue'),
    meta: { title: 'Choose a new password', public: true },
  },

  // ---- Student ------------------------------------------------------------
  {
    path: '/student',
    component: () => import('@/layouts/AppLayout.vue'),
    children: [
      {
        path: '',
        redirect: '/student/dashboard',
      },
      {
        path: 'dashboard',
        name: 'student-dashboard',
        component: () => import('@/views/student/Dashboard.vue'),
        meta: { title: 'My dashboard', roles: ['student'] },
      },
      {
        path: 'courses',
        name: 'student-courses',
        component: () => import('@/views/student/Courses.vue'),
        meta: { title: 'My courses', roles: ['student'] },
      },
      {
        path: 'courses/:id',
        name: 'student-course-detail',
        component: () => import('@/views/student/CourseDetail.vue'),
        meta: { title: 'Course', roles: ['student'] },
      },
      {
        path: 'lessons/:id',
        name: 'student-lesson',
        component: () => import('@/views/student/Lesson.vue'),
        meta: { title: 'Lesson', roles: ['student'] },
      },
      {
        path: 'quizzes/:id',
        name: 'student-quiz',
        component: () => import('@/views/student/QuizAttempt.vue'),
        meta: { title: 'Quiz', roles: ['student'] },
      },
      {
        path: 'grades',
        name: 'student-grades',
        component: () => import('@/views/student/Grades.vue'),
        meta: { title: 'My grades', roles: ['student'] },
      },
      {
        path: 'calendar',
        name: 'student-calendar',
        component: () => import('@/views/student/Calendar.vue'),
        meta: { title: 'Calendar', roles: ['student'] },
      },
      {
        path: 'notifications',
        name: 'student-notifications',
        component: () => import('@/views/student/Notifications.vue'),
        meta: { title: 'Notifications', roles: ['student'] },
      },
    ],
  },

  // ---- Instructor ---------------------------------------------------------
  {
    path: '/instructor',
    component: () => import('@/layouts/AppLayout.vue'),
    children: [
      {
        path: '',
        redirect: '/instructor/dashboard',
      },
      {
        path: 'dashboard',
        name: 'instructor-dashboard',
        component: () => import('@/views/instructor/Dashboard.vue'),
        meta: { title: 'Instructor dashboard', roles: ['instructor'] },
      },
      {
        path: 'courses',
        name: 'instructor-courses',
        component: () => import('@/views/instructor/Courses.vue'),
        meta: { title: 'My courses', roles: ['instructor'] },
      },
      {
        path: 'courses/create',
        name: 'instructor-course-create',
        component: () => import('@/views/instructor/CourseEditor.vue'),
        meta: { title: 'New course', roles: ['instructor'] },
      },
      {
        path: 'courses/:id',
        name: 'instructor-course-detail',
        component: () => import('@/views/instructor/CourseDetail.vue'),
        meta: { title: 'Course', roles: ['instructor'] },
      },
      {
        path: 'courses/:id/edit',
        name: 'instructor-course-edit',
        component: () => import('@/views/instructor/CourseEditor.vue'),
        meta: { title: 'Edit course', roles: ['instructor'] },
      },
      {
        // Its own page rather than another panel on the course screen, because
        // this is where the answer key is. `quiz_with_answers` returns every
        // correct answer on the course in one payload, and that should be read on
        // demand in a place reached deliberately, not left loaded on a page an
        // instructor keeps open all day.
        path: 'courses/:id/quiz',
        name: 'instructor-course-quiz',
        component: () => import('@/views/instructor/QuizManager.vue'),
        meta: { title: 'Quizzes', roles: ['instructor'] },
      },
      {
        path: 'students',
        name: 'instructor-students',
        component: () => import('@/views/instructor/Students.vue'),
        meta: { title: 'My students', roles: ['instructor'] },
      },
      {
        path: 'grading',
        name: 'instructor-grading',
        component: () => import('@/views/instructor/Grading.vue'),
        meta: { title: 'Grading', roles: ['instructor'] },
      },
      {
        path: 'analytics',
        name: 'instructor-analytics',
        component: () => import('@/views/instructor/Analytics.vue'),
        meta: { title: 'Course insights', roles: ['instructor'] },
      },
      {
        path: 'calendar',
        name: 'instructor-calendar',
        component: () => import('@/views/instructor/Calendar.vue'),
        meta: { title: 'Calendar', roles: ['instructor'] },
      },
    ],
  },

  // ---- Admin --------------------------------------------------------------
  {
    path: '/admin',
    component: () => import('@/layouts/AppLayout.vue'),
    children: [
      {
        path: '',
        redirect: '/admin/dashboard',
      },
      {
        path: 'dashboard',
        name: 'admin-dashboard',
        component: () => import('@/views/admin/Dashboard.vue'),
        meta: { title: 'Admin dashboard', roles: ['admin'] },
      },
      {
        path: 'users',
        name: 'admin-users',
        component: () => import('@/views/admin/Users.vue'),
        meta: { title: 'Users and roles', roles: ['admin'] },
      },
      {
        path: 'students',
        name: 'admin-students',
        component: () => import('@/views/admin/Students.vue'),
        meta: { title: 'Students', roles: ['admin'] },
      },
      {
        path: 'instructors',
        name: 'admin-instructors',
        component: () => import('@/views/admin/Instructors.vue'),
        meta: { title: 'Instructors', roles: ['admin'] },
      },
      {
        path: 'courses',
        name: 'admin-courses',
        component: () => import('@/views/admin/Courses.vue'),
        meta: { title: 'All courses', roles: ['admin'] },
      },
      {
        path: 'categories',
        name: 'admin-categories',
        component: () => import('@/views/admin/Categories.vue'),
        meta: { title: 'Categories', roles: ['admin'] },
      },
      {
        path: 'payments',
        name: 'admin-payments',
        component: () => import('@/views/admin/Payments.vue'),
        meta: { title: 'Payments', roles: ['admin'] },
      },
      {
        path: 'analytics',
        name: 'admin-analytics',
        component: () => import('@/views/admin/Analytics.vue'),
        meta: { title: 'Platform analytics', roles: ['admin'] },
      },
      {
        path: 'settings',
        name: 'admin-settings',
        component: () => import('@/views/admin/Settings.vue'),
        meta: { title: 'System settings', roles: ['admin'] },
      },
    ],
  },

  // ---- Shared -------------------------------------------------------------
  {
    path: '/profile',
    // No name on the parent: Vue Router rejects a child route that shares its
    // ancestor's name, and this parent exists only to attach AppLayout. The
    // child below owns the name 'profile'.
    component: () => import('@/layouts/AppLayout.vue'),
    children: [
      {
        path: '',
        name: 'profile',
        component: () => import('@/views/shared/Profile.vue'),
        meta: { title: 'My profile' },
      },
    ],
  },
  {
    // Every role, like the profile above it. Messaging is not a student feature or an
    // instructor feature - it is the way all three talk to the people they share a
    // course with, and the permission check that matters lives in Row Level Security:
    // a conversation is only visible to its own participants. Listing all three roles
    // here means the navigation guard lets them through and RLS decides what they
    // actually see, rather than the route deciding who may have a conversation at all.
    path: '/messages',
    component: () => import('@/layouts/AppLayout.vue'),
    children: [
      {
        path: '',
        name: 'messages',
        component: () => import('@/views/shared/Messages.vue'),
        meta: { title: 'Messages', roles: ['student', 'instructor', 'admin'] },
      },
    ],
  },

  // ---- Errors -------------------------------------------------------------
  {
    path: '/error-404',
    name: 'not-found',
    component: () => import('@/views/Errors/FourZeroFour.vue'),
    meta: { title: 'Page not found', public: true },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'catch-all',
    redirect: '/error-404',
    meta: { public: true },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, from, savedPosition) {
    return savedPosition || { left: 0, top: 0 }
  },
  routes,
})

/**
 * Navigation guard.
 *
 * This improves UX and nothing else. It stops a student from seeing an admin
 * screen, which is good, but it is not the security boundary: the same student
 * who edits this check in devtools still gets nothing back from Supabase,
 * because every query is filtered by RLS against `auth.uid()`.
 *
 * Three cases:
 *   - public route, signed in   -> nothing, public routes are genuinely public
 *   - guarded route, signed out -> sign in, carrying where they were headed
 *   - route the role cannot use -> that role's own home
 */
router.beforeEach(async (to) => {
  const auth = useAuthStore()

  // Never decide anything before the session is known. Without this, a refresh
  // on a deep link bounces a signed-in user to the sign-in page.
  await auth.ensureReady()

  document.title = to.meta.title ? `${to.meta.title} | IT Learning Hub` : 'IT Learning Hub'

  if (to.meta.public) {
    // A signed-in user has no business on the landing page or the sign-in form.
    if (to.name === 'landing' && auth.isAuthenticated) return auth.homePath
    return true
  }

  if (!auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // A role-gated route, entered with the role still unknown.
  //
  // `auth.role` is `profile?.role ?? null`, and `stores/auth.ts` sets `profile = null` when
  // the profile read throws. The `auth.role &&` clause that used to sit in this condition
  // made an unknown role evaluate it false, so the guard allowed the navigation: a
  // signed-in user whose profile failed to load reached the admin shell and saw empty
  // tables and "your profile has not loaded".
  //
  // Not a data leak - RLS is the boundary, as the note at the top of this file says - but
  // a fail-open in the one place that otherwise tries not to. `layouts/navigation.ts`
  // returns no items for an unknown role rather than guessing, so the sidebar was careful
  // while the guard was not.
  //
  // `homePath` for a null role is the dashboard, which is not itself role-gated, so this
  // cannot loop.
  if (to.meta.roles && (!auth.role || !to.meta.roles.includes(auth.role))) {
    return auth.homePath
  }

  return true
})

export default router
