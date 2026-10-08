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

/**
 * A route parameter that must be a UUID, expressed as a path constraint.
 *
 * There was no UUID check anywhere in this project. Seven views read
 * `String(route.params.id ?? '')` and passed the result straight into a `.eq('id', value)`,
 * so `/student/lessons/not-a-uuid` reached PostgREST and came back as
 * `22P02 invalid input syntax for type uuid` - a Postgres data-type error rendered to
 * somebody who typed nothing wrong and clicked nothing.
 *
 * Constraining the path is the right layer for this, above every view: a URL that cannot
 * match does not render, so it lands on the 404 that already exists rather than mounting
 * a page that has to explain a database error. Each affected view ALSO validates in its
 * service call, because a route constraint protects the URL and a service check protects
 * the function - a caller can reach `findLessonProgress` without going through the router
 * at all.
 *
 * Applied only where the parameter really is a UUID. `student/courses/:id` is a *slug*,
 * despite the name, and `auth/courses/:slug` is too - constraining those as UUIDs would
 * have broken every course link in the product.
 */
const UUID_PARAM = '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})'

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
    path: '/legal/terms',
    name: 'legal-terms',
    component: () => import('@/views/auth/TermsOfService.vue'),
    meta: { title: 'Terms of Service', public: true },
  },
  {
    path: '/legal/privacy',
    name: 'legal-privacy',
    component: () => import('@/views/auth/PrivacyPolicy.vue'),
    meta: { title: 'Privacy Policy', public: true },
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
        // A SLUG, not an id, despite the parameter name. `CourseDetail.vue` looks this
        // course up with `.eq('slug', ...)` - which is why `checkout.service.ts` has to
        // build its return URL from the slug rather than the id, or a learner who had
        // just paid lands on a lookup for a UUID. Deliberately NOT given `UUID_PARAM`:
        // constraining it would break every course link in the product.
        path: 'courses/:id',
        name: 'student-course-detail',
        component: () => import('@/views/student/CourseDetail.vue'),
        meta: { title: 'Course', roles: ['student'] },
      },
      {
        // A SLUG, for the same reason as `courses/:id` above: PayMongo returns the
        // learner here, and `checkout.service.ts` builds that return URL from the slug.
        // The page reads `?payment=success|cancelled` on arrival and then confirms
        // settlement against the server rather than trusting the query string.
        path: 'checkout/:slug',
        name: 'student-checkout',
        component: () => import('@/views/student/Checkout.vue'),
        meta: { title: 'Checkout', roles: ['student'] },
      },
      {
        path: `lessons/:id${UUID_PARAM}`,
        name: 'student-lesson',
        component: () => import('@/views/student/Lesson.vue'),
        meta: { title: 'Lesson', roles: ['student'] },
      },
      {
        path: `quizzes/:id${UUID_PARAM}`,
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
        path: 'announcements',
        name: 'student-announcements',
        component: () => import('@/views/student/Announcements.vue'),
        meta: { title: 'Announcements', roles: ['student'] },
      },
      {
        path: 'quizzes',
        name: 'student-quizzes',
        component: () => import('@/views/student/Quizzes.vue'),
        meta: { title: 'Quizzes', roles: ['student'] },
      },
      {
        path: `certificates/:id${UUID_PARAM}`,
        name: 'student-certificate',
        component: () => import('@/views/student/Certificate.vue'),
        meta: { title: 'Certificate of completion', roles: ['student'] },
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
        path: `courses/:id${UUID_PARAM}`,
        name: 'instructor-course-detail',
        component: () => import('@/views/instructor/CourseDetail.vue'),
        meta: { title: 'Course', roles: ['instructor'] },
      },
      {
        path: `courses/:id${UUID_PARAM}/edit`,
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
        path: `courses/:id${UUID_PARAM}/quiz`,
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
        path: 'announcements',
        name: 'instructor-announcements',
        component: () => import('@/views/instructor/Announcements.vue'),
        meta: { title: 'Announcements', roles: ['instructor'] },
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
        path: 'announcements',
        name: 'admin-announcements',
        component: () => import('@/views/admin/Announcements.vue'),
        meta: { title: 'Announcements', roles: ['admin'] },
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
    // Who the signed-in person is. Their photo, name, contact details and bio, and the
    // figures that summarise their own activity. No settings on this screen.
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
    // How the LMS behaves for them. Appearance and security.
    //
    // Separate from `/profile` because they are different questions. `/profile` is "who
    // am I" and is part of how they are identified everywhere in the LMS; `/settings` is
    // "how do I want this to behave" and is per-browser or per-account, never shown next
    // to a person's name. They used to be one page, which is why the user menu offered
    // "Profile" and then "Account settings" pointing at two anchors on the same route -
    // two labels for one destination, so the choice carried no information.
    //
    // No `meta.roles`, for the same reason `/profile` has none: this is not a
    // student-only or instructor-only feature. The guard refuses it for a signed-out
    // visitor, which is the only restriction that applies.
    path: '/settings',
    component: () => import('@/layouts/AppLayout.vue'),
    children: [
      {
        path: '',
        name: 'settings',
        component: () => import('@/views/shared/Settings.vue'),
        meta: { title: 'Settings' },
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
/**
 * Where a navigation should go, given the roles a route accepts and the caller's role.
 *
 * Extracted from the guard because the interesting part is a pure decision, and a pure
 * decision can be tested without a DOM. Vue Router needs `window.history` and
 * `document`, so exercising the guard itself in node means stubbing a browser, and the
 * bug this exists to pin down - a redirect sent to a route the guard then refuses - is a
 * property of this function's output, not of Vue Router.
 *
 * Returns `undefined` to allow the navigation, or the destination to redirect to.
 *
 * The two refusals are different on purpose:
 *
 *   * A **wrong role** goes to that role's own home. `homePath` is derived from `role`,
 *     so it is a route for a role we know, and `ROLE_HOME[role]` is the same table the
 *     redirect uses, which makes the loop below structural rather than accidental.
 *
 *   * An **unknown role** goes to `/profile`, which carries no `meta.roles`. It cannot go
 *     to `homePath`: that is `/student/dashboard` for a null role, and that route declares
 *     `roles: ['student']`, so the guard would refuse its own redirect target and redirect
 *     again - for ever, in a production build. `Profile.vue` renders an error state with a
 *     retry, so this destination can also be reached *and* do something about the failure.
 */
export function resolveRoleRedirect(
  allowed: readonly Role[] | undefined,
  role: Role | null,
): { name: 'profile' } | string | undefined {
  if (!allowed) return undefined
  if (role === null) return { name: 'profile' }
  if (!allowed.includes(role)) return ROLE_HOME[role]
  return undefined
}
router.beforeEach(async (to) => {
  const auth = useAuthStore()

  // Never decide anything before the session is known. Without this, a refresh
  // on a deep link bounces a signed-in user to the sign-in page.
  //
  // But never let *failing* to learn the session stop the navigation either.
  // initialize() is 	ry { await readyPromise } finally { readyPromise = null } - there
  // is no catch - so anything supabase.auth.getSession() throws propagates out of
  // ensureReady(). An unguarded await here therefore REJECTS the navigation, Vue Router
  // abandons it, and because main.ts mounts without awaiting
  // router.isReady() nothing
  // ever paints: a blank page, no console error, no route.
  //
  // Observed while driving the real app: document.body was empty, the document title
  // still read IT Learning Hub rather than IT Learning Hub | My profile - the guard had
  // not reached line two - and the console held nothing but Vite's connect messages. One
  // transient failure to read the session was a permanently blank application.
  //
  // Continuing is strictly better than aborting: the checks below decide on whatever the
  // store knows. No session sends the user to sign in; a session with an unknown role goes
  // to /profile, which renders its own error state with a retry. Both are visible and
  // recoverable. A rejected navigation is neither.
  try {
    await auth.ensureReady()
  } catch (error) {
    console.warn('[router] the session could not be read; continuing without it', error)
  }
  document.title = to.meta.title ? `${to.meta.title} | IT Learning Hub` : 'IT Learning Hub'

  if (to.meta.public) {
    // A signed-in user has no business on the landing page or the sign-in form.
    if (to.name === 'landing' && auth.isAuthenticated) return auth.homePath
    return true
  }

  if (!auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // `auth.role` is `profile?.role ?? null`, and the store sets `profile = null` when the
  // profile read throws. The guard used to carry an `auth.role &&` clause here, which made
  // an unknown role evaluate the condition false and let the navigation through: a
  // signed-in user whose profile failed to load reached the admin shell and saw empty
  // tables. Not a data leak - RLS is the boundary - but a fail-open in the one place that
  // otherwise tries not to, since navigation.ts returns no items for an unknown role
  // rather than guessing.
  const roleRedirect = resolveRoleRedirect(to.meta.roles, auth.role)
  if (roleRedirect) return roleRedirect

  return true
})

export default router
