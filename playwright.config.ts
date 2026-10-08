import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end configuration.
 *
 * These tests run against a real Supabase project, so they need credentials. They are
 * read from the environment and the suite refuses to start without them rather than
 * failing every spec with a confusing auth error - a run that quietly skips is worse
 * than one that refuses, because it reports green.
 *
 * What these cover and what they deliberately do not
 * -------------------------------------------------
 * Covered: the workflows a professor will watch. Signing in, the role guard, browsing
 * the catalogue, enrolling, reading a lesson, the calendar, and the instructor's
 * course and quiz screens.
 *
 * Not covered: anything that writes to money or deletes content. A checkout charges a
 * card and a delete is a cascade, and an E2E suite pointed at a real database is not
 * the place to find that out. The write paths are covered by the SQL verification in
 * `docs/quiz-system.md` and by the unit suite, which mocks the client.
 *
 * The credentials used here are throwaway demo accounts. Nothing in this file creates
 * an account, and no secret is read from the repository.
 */
const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? ''
const E2E_SUPABASE_ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY ?? ''
const E2E_STUDENT_EMAIL = process.env.E2E_STUDENT_EMAIL ?? ''
const E2E_STUDENT_PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? ''
const E2E_INSTRUCTOR_EMAIL = process.env.E2E_INSTRUCTOR_EMAIL ?? ''
const E2E_INSTRUCTOR_PASSWORD = process.env.E2E_INSTRUCTOR_PASSWORD ?? ''

/**
 * `E2E_SUPABASE_ANON_KEY` is the publishable key, the same one compiled into the bundle.
 * It is not a secret and is checked here only because the suite cannot complete a
 * sign-in without it: the second step of the flow is a code sent to a real inbox, and an
 * automated runner has none. See `signIn` in `e2e/helpers.ts`.
 */
const missing = [
  !SUPABASE_URL && 'E2E_SUPABASE_URL',
  !E2E_SUPABASE_ANON_KEY && 'E2E_SUPABASE_ANON_KEY',
  !E2E_STUDENT_EMAIL && 'E2E_STUDENT_EMAIL',
  !E2E_STUDENT_PASSWORD && 'E2E_STUDENT_PASSWORD',
  !E2E_INSTRUCTOR_EMAIL && 'E2E_INSTRUCTOR_EMAIL',
  !E2E_INSTRUCTOR_PASSWORD && 'E2E_INSTRUCTOR_PASSWORD',
].filter(Boolean) as string[]

if (missing.length > 0) {
  // Thrown at config load, so `npx playwright test` exits before running anything and
  // says exactly which variables are absent.
  throw new Error(
    'E2E tests need these environment variables and they are not set: ' +
      missing.join(', ') +
      '. See docs/DEPLOYMENT.md for where to get them. The suite is refusing to start ' +
      'rather than reporting a pass it did not earn.',
  )
}

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4173'

/** True only when the suite is meant to serve its own copy. */
const usesLocalServer = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseURL)

export default defineConfig({
  testDir: './e2e',
  // A failed spec is only worth reading once. Retrying in CI hides flake and makes a
  // broken suite look intermittent, which is how a real failure goes unnoticed.
  retries: 0,
  // Serial, deliberately. These share one database: the instructor's course list and
  // the student's enrolment list are the same rows, and running two contexts that
  // mutate state at once produces failures that are not bugs.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  /**
   * Serve the built app rather than the dev server.
   *
   * A production build is what a professor sees, and the dev server has no error on a
   * failed template compile - a route that cannot render returns a blank page there
   * and a 404 page in the build, which is exactly the difference worth testing.
   *
   * Skipped when `E2E_BASE_URL` names somewhere other than localhost, so the same
   * suite can be pointed at staging or at the deployed site without first building
   * and serving a local copy. Without this the config would start a server nobody is
   * going to use and the run would quietly test that server instead of the URL asked
   * for - which is how a suite ends up reporting green about the wrong artefact.
   */
  webServer: usesLocalServer
    ? {
        command: 'npm run build && npx vite preview --port 4173 --strictPort',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      }
    : undefined,
})

export const env = {
  SUPABASE_URL,
  STUDENT: { email: E2E_STUDENT_EMAIL, password: E2E_STUDENT_PASSWORD },
  INSTRUCTOR: { email: E2E_INSTRUCTOR_EMAIL, password: E2E_INSTRUCTOR_PASSWORD },
}
