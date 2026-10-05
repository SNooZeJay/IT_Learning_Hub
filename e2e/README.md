# End-to-end tests

Real browser tests against the real application. They cover the workflows a professor
will watch, from the Student's and the Instructor's side.

## What they need

Five environment variables. They are **not** in `.env` and must never be committed:

| Variable | What it is |
| --- | --- |
| `E2E_SUPABASE_URL` | The Supabase project URL. Public, but kept here so the suite needs no `.env`. |
| `E2E_STUDENT_EMAIL` | A throwaway demo student. |
| `E2E_STUDENT_PASSWORD` | Its password. |
| `E2E_INSTRUCTOR_EMAIL` | The demo instructor. |
| `E2E_INSTRUCTOR_PASSWORD` | Its password. |

The suite **refuses to start** if any are missing, rather than running and reporting
green. A skipped suite that looks like a passing suite is the failure mode this guards
against — the reason `playwright.config.ts` throws at config load.

In PowerShell:

```powershell
$env:E2E_SUPABASE_URL = '...'
$env:E2E_STUDENT_EMAIL = '...'
$env:E2E_STUDENT_PASSWORD = '...'
$env:E2E_INSTRUCTOR_EMAIL = '...'
$env:E2E_INSTRUCTOR_PASSWORD = '...'
npm run e2e
```

## Running them

```bash
npm run e2e:install   # once, downloads Chromium
npm run e2e           # against a production build on :4173
npm run e2e:ui        # the same, in the interactive runner
```

The config starts `vite preview` against a **built** bundle rather than using the dev
server. The dev server returns a blank page for a route whose template will not
compile; the build fails loudly instead. A production build is also what a professor
sees, so it is the thing worth testing.

## What is deliberately not covered

**Anything that writes to money or deletes content.** A checkout charges a card and a
delete cascades through modules, lessons, progress and attempts. An E2E suite pointed
at a real database is the wrong place to discover that. Every spec is a read.

The consequence, stated plainly: the write paths are covered by the SQL verification
recorded in `docs/quiz-system.md` and by the unit suite, which mocks the Supabase
client. They are not covered end to end.

**Mobile viewports.** Playwright can set a viewport but this suite does not, so
responsive behaviour is not asserted here. It was verified separately with a headless
harness measuring 320px to 1440px.

## The two specs

- `student.spec.ts` — sign in, land on the dashboard, the role guard refusing
  instructor and admin routes, enrolled courses, the calendar rendering 42 grid cells
  in month view and a week view after switching, opening a lesson, grades and
  notifications rendering, sign out. Plus authentication: an unauthenticated redirect,
  bad credentials refused with a message, the branded 404, and a deep link on a cold
  load.
- `instructor.spec.ts` — the same shape for the instructor, plus the course list
  linking by uuid rather than slug (the two roles' course routes differ, and crossing
  them produces a page that loads and shows nothing) and the quiz manager exposing its
  authoring controls.

Every spec watches the console and fails on an error. A Vue Router guard sending
somebody to a route that does not exist is not an error — it is a blank page, and
nothing anywhere complains.

Serial by design: the specs share one database.
