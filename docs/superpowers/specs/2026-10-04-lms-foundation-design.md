# IT Learning Hub LMS — Foundation Design

- **Date:** 2026-10-04
- **Status:** Draft for review
- **Scope:** Stages 1–7 of §18 (project setup → Supabase config → database schema → authentication → role system → layouts/navigation)
- **Repository:** https://github.com/SNooZeJay/IT_Learning_Hub

---

## 1. Context

IT Learning Hub is a school-project Learning Management System with three roles:
`ADMIN`, `INSTRUCTOR`, `STUDENT`. It must ship at $0 hosting cost on Vercel Hobby
with Supabase as the only backend.

This spec covers the **foundation only**: an installed, empty-but-real application
where an operator can register, log in, be assigned a role, and land on a
role-appropriate dashboard. No courses, quizzes, assignments, grading or analytics
are built here. Those arrive as separate spec → plan → implement cycles.

### 1.1 Out of scope (deliberately)

Stages 8–21 of §18: admin/instructor/student feature pages, course and lesson
authoring, quiz engine, assignments, progress rollups, analytics, calendar events,
notifications, responsive refinement beyond the shell, accessibility audit, test
suite, and production deployment.

Also deferred from the database: `course_progress`, `quiz_*`, `assignments`,
`assignment_submissions`, `announcements`, `notifications`, `calendar_events`.
Rationale in §5.3.

**Amended 2026-10-04.** Two additions were approved after this spec was first
written:

- **Payments** — a mixed free/paid course catalogue settled in Philippine pesos
   through PayMongo. Designed in §12; it adds `payments`, the price columns on
   `courses`, and two Supabase Edge Functions. Folding it in here rather than
   splitting it into a separate spec, because it is two tables and two
   functions and it is a precondition for enrolment rather than an independent
   feature.
- **A `visitor` state** — the unsigned-in visitor described in
   `docs/role-flowchart.md`. This is *not* a fourth database role; it is the
   absence of a session, so §5.1's three-role enum is unchanged.

---

## 2. Repository baseline

The repository was empty at project start. TailAdmin Vue v2.4.0 (MIT) was
imported verbatim as commit `ce75550`, giving a working, verified UI foundation
rather than a hand-built design system.

| Locked requirement | Present | Version |
|---|---|---|
| Vue 3.5 | yes | `^3.5.26` |
| TypeScript | yes | `~5.7.3` |
| Vite | yes | `^6.4.3` |
| Tailwind CSS v4 | yes | `^4.1.18` |
| Vue Router | yes | `^4.6.4` |
| ApexCharts | yes | `^7.1.0` + `vue3-apexcharts` |
| Flatpickr | yes | `^4.6.13` + wrapper |
| JSVectorMap | yes | `^1.6.0` + `vuevectormap` |
| Lucide Vue | yes | `lucide-vue-next` |
| ESLint / Prettier | yes | eslint 9, prettier 3 |
| Pinia | **no** | to be installed |
| Supabase JS | **no** | to be installed |

Baseline verified: `npm run build` passes (`vue-tsc` type-check + Vite build).
263 tracked files; `dist/` and `node_modules/` correctly ignored.

### 2.1 Licensing

Three license facts must be preserved:

- Root `LICENSE` is the **project's own** MIT license (`Copyright (c) 2026 SNooZeJay`).
  It was deliberately preserved over the upstream template's `LICENSE` during the
  initial merge.
- `THIRD_PARTY_NOTICES.md` carries the TailAdmin Vue MIT notice (required, MIT
  §"copyright notice shall be included").
- `THIRD_PARTY_NOTICES.md` carries the `awesome-design-md` MIT notice for
  `DESIGN.md`.

---

## 3. Decisions and rationale

| # | Decision | Rationale |
|---|---|---|
| D1 | Foundation scope = stages 1–7 | A 19-table, 3-role LMS cannot be specced as one unit. Each sub-project gets its own spec → plan → implement cycle. |
| D2 | Self-registration defaults to `student`; admin promotes | Least admin overhead for a school. Role comes from a column `DEFAULT` and a DB trigger, never from client input. |
| D3 | Typed service layer in `src/services/` | Only layer permitted to contain Supabase queries. One place to fix bugs, one place to mock during UI work, type-checkable independently of components. |
| D4 | Keep FullCalendar, remove Leaflet | Flatpickr is a date *picker*; a month-grid event calendar is the "genuine requirement Flatpickr cannot satisfy" that §13 explicitly permits. |
| D5 | Delete `src/icons/`, import Lucide directly | §10 forbids mixing icon styles. 48 hand-rolled SVG SFCs vs. an already-installed `lucide-vue-next`. |
| D6 | Single `AppLayout` + role-keyed nav registry | §8 forbids duplicating an application per role. All three roles share identical chrome, so role layouts are configuration, not components. |
| D7 | Role resolved from `profiles` at guard time | No JWT custom claims (avoids login-hook and claim-sync bugs). RLS enforces; guards are UX only. |
| D8 | Full IBM Carbon adoption | See §4. Agrees with §10's rejection of excessive shadows, gradients and rounded cards. |
| D9 | Middle-path schema | Create only tables whose grain is not guessable and whose RLS is testable now. Defer the rest. |

### 3.1 Resolved conflicts with the template's `AGENTS.md`

`AGENTS.md` is binding on this repository and was followed throughout. Two of its
rules conflicted with the project specification; both were resolved in favour of
the specification, and `AGENTS.md` is amended accordingly in the implementation
plan.

| `AGENTS.md` said | Resolution |
|---|---|
| "Icons live in `src/icons/` as Vue SFCs" | Superseded. §10 requires one consistent icon style. `src/icons/` is deleted; import from `lucide-vue-next` directly. The Icons section of `AGENTS.md` is rewritten to match. |
| "Don't install new NPM packages without asking the user" | Honoured — explicit approval obtained for `pinia` and `@supabase/supabase-js` only. |

`AGENTS.md` rules that are **unchanged** and binding: no `tailwind.config.js`;
`<script setup lang="ts">` only; `@theme` tokens only, never hardcoded hex or
inline styles; dark-mode class-driven with `dark:` variants on every element; RTL
logical properties only (`ms-*`/`ps-*`/`start-*`/`text-start`, never
`ml-*`/`pl-*`/`left-*`/`text-left`); chart, calendar and map libraries initialised
in `onMounted` only.

---

## 4. Design system — IBM Carbon on TailAdmin tokens

`DESIGN.md` (adopted from `VoltAgent/awesome-design-md`, IBM Carbon analysis) is
the **visual intent** layer. `src/assets/main.css` `@theme` tokens remain the
**implementation** layer. Carbon values are mapped onto the *existing token
names*, so all 262 existing files inherit the new palette with **zero component
edits** — token names are the API, only values change.

### 4.1 Colour mapping

`brand` ramp → Carbon blue. `brand-500` is exactly IBM Blue 60 (`#0f62fe`),
matching `DESIGN.md`'s `primary`.

| Token | Carbon | Value |
|---|---|---|
| `brand-25` | blue-100 tint | `#f5faff` |
| `brand-50` | blue-100 | `#edf5ff` |
| `brand-100` | blue-90 | `#e0efff` |
| `brand-200` | blue-80 | `#c6e0ff` |
| `brand-300` | blue-70 | `#a6c8ff` |
| `brand-400` | blue-60 | `#4589ff` |
| **`brand-500`** | **blue-50 (primary)** | **`#0f62fe`** |
| `brand-600` | blue-40 | `#0353e9` |
| `brand-700` | blue-70 hover | `#0043ce` |
| `brand-800` | blue-30 | `#002d9c` |
| `brand-900` | blue-20 | `#001d6c` |
| `brand-950` | blue-10 | `#000d2d` |

`gray` ramp → Carbon neutral gray, replacing TailAdmin's blue-tinted grays.

| Token | Carbon | Value |
|---|---|---|
| `gray-25` | — | `#fafafa` |
| `gray-50` | gray-5 | `#f4f4f4` |
| `gray-100` | gray-10 | `#e0e0e0` |
| `gray-200` | gray-20 | `#c6c6c6` |
| `gray-300` | gray-30 | `#a8a8a8` |
| `gray-400` | gray-40 | `#8d8d8d` |
| `gray-500` | gray-50 | `#6f6f6f` |
| `gray-600` | gray-60 | `#525252` |
| `gray-700` | gray-70 | `#393939` |
| `gray-800` | gray-80 | `#262626` |
| `gray-900` | gray-90 | `#161616` |
| `gray-950` | gray-100 | `#000000` |

Status colours → Carbon support palette: `success-500 #24a148`,
`error-500 #da1e28`, `warning-500 #f1c21b` with `warning-700 #8e6a00` for
readable text on light surfaces.

`blue-light-*` and `orange-*` ramps are deleted — Carbon is a single-accent
system (§10: avoid decorative colour). Any surviving reference is remapped to
`brand-*` or `gray-*`.

### 4.2 Radius, shadow, typography

- **Radius:** `--radius-sm: 2px`; `md`/`lg`/`xl`/`2xl`/`3xl` all `4px`.
  `--radius-full` retained for avatars and status dots. Result: flat-square
  Carbon geometry with no component churn.
- **Shadow:** tokens remain *defined* (other components still reference them) but
  the rule is that cards use `border border-gray-200`, never a shadow. Focus
  rings use Carbon's 2px `brand-500` outline.
- **Typeface:** IBM Plex Sans (SIL OFL 1.1, free), weights 300/400/600, loaded
  from Google Fonts. `--font-plex` is canonical; `--font-outfit` is retained
  temporarily as an alias mapping to Plex so the build never breaks, and is
  migrated away as components are touched. Carbon's signature is display type at
  weight 300 — headings use `font-light`, body `font-normal`, emphasis
  `font-semibold`.
- **Breach to record:** adding a Google Fonts `<link>` is a new external runtime
  resource. It is free and CDN-hosted, but it is an availability dependency the
  project did not previously have. Self-hosting the two woff2 files is the
  fallback if that is unacceptable.

### 4.3 Dark mode

Unchanged mechanics — class-driven via `@custom-variant dark`, `.dark` on
`<html>`. Carbon's inverse scale replaces TailAdmin's: `gray-950` canvas
(`#000000`), `gray-800` surface (`#262626`), `gray-200` ink (`#c6c6c6`). Every
element keeps its required `dark:` variants.

---

## 5. Database

PostgreSQL via Supabase. All tables use `uuid` primary keys,
`timestamptz` timestamps, and explicit `created_at` / `updated_at`. RLS is enabled
on every table.

### 5.1 Tables created in this spec (9)

1. **`profiles`** — `id` PK → `auth.users(id)` cascade; `role` (enum
   `admin|instructor|student`) `default 'student'`; `full_name`; `email`;
   `avatar_url`; `phone`; `bio`; `status` (`active|invited|suspended`);
   timestamps. `email` is denormalised for admin search only; `auth.users`
   remains the source of truth.
2. **`course_categories`** — `id`, `name` unique, `slug` unique, `description`,
   `icon`, timestamps.
3. **`courses`** — `id`, `category_id` FK → `course_categories` `on delete set
   null`, `title`, `slug` unique, `description`, `thumbnail_url` (Storage path),
   `status` (`draft|published|archived`), `level`
   (`beginner|intermediate|advanced`), `duration_minutes`, `passing_score`
   numeric(5,2) default 70, `created_by` FK → `profiles`, `published_at`,
   timestamps.
4. **`course_instructors`** — composite PK `(course_id, instructor_id)`, both FK
   → `courses` / `profiles` cascade, `assigned_at`. Supports multiple
   instructors per course.
5. **`modules`** — `id`, `course_id` FK cascade, `title`, `description`,
   `position`, timestamps, `unique (course_id, position)`.
6. **`lessons`** — `id`, `module_id` FK cascade, `title`, `content`,
   `lesson_type` (`article|video`), `position`, `duration_minutes`,
   `is_preview`, `video_url`, timestamps, `unique (module_id, position)`.
7. **`lesson_materials`** — `id`, `lesson_id` FK cascade, `title`,
   `file_path` (Storage path, never raw file bytes), `file_type`, `file_size`,
   `position`, timestamps.
8. **`enrollments`** — `id`, `course_id` FK cascade, `student_id` FK cascade,
   `status` (`active|completed|dropped`), `enrolled_at`, `completed_at`,
   `unique (course_id, student_id)`.
9. **`lesson_progress`** — `id`, `enrollment_id` FK cascade, `lesson_id` FK
   cascade, `status` (`not_started|in_progress|completed`),
   `progress_percent` numeric(5,2), `last_position_seconds`, `started_at`,
   `completed_at`, `unique (enrollment_id, lesson_id)`.

### 5.2 Why these nine

Their *grain* is not guessable and their RLS is testable through the shell built
in this spec. `course_instructors` fixes the many-to-many instructor assignment
that every downstream instructor policy depends on. `lesson_progress` keyed on
`(enrollment_id, lesson_id)` fixes the per-student-per-lesson cardinality that
drives all progress and completion policy.

### 5.3 Why the rest are deferred

- **`course_progress`** — derivable from `lesson_progress` as a SQL view or
  aggregate. Materialising it now creates a synchronisation bug with no UI to
  expose it.
- **`quiz_*`, `assignments`, `assignment_submissions`** — grading rules and
  attempt semantics should be designed against a real quiz-taking UI.
- **`announcements`, `notifications`, `calendar_events`** — each has audience and
  delivery semantics that are clearer once roles and courses exist.

Each arrives with its own spec, its own migration, and testable policies.

### 5.4 Helper functions

RLS policies that read `profiles` from within a `profiles` policy recurse
infinitely. Four `SECURITY DEFINER` helpers break that cycle and are the only
sanctioned way policies authorise:

- `public.current_role()` → `user_role`
- `public.is_admin()` → `boolean`
- `public.is_instructor_of(course_id uuid)` → `boolean`
- `public.is_enrolled_in(course_id uuid)` → `boolean`

### 5.5 Triggers

- `handle_new_user()` on `auth.users` **insert** → create the `profiles` row with
  `role = 'student'`. The role is never read from client-supplied metadata.
- `prevent_role_self_change()` on `profiles` **update** → raise unless the acting
  role is `admin`. RLS cannot restrict a single column, so this trigger is what
  actually blocks privilege escalation.
- `set_updated_at()` on all tables → maintain `updated_at`.

### 5.6 Authorisation vocabulary

Two terms are used throughout this spec and mean exactly one thing each:

- **"instructor-of course X"** — a row exists in `course_instructors` for
  `(X, auth.uid())`. It is *not* implied by `courses.created_by`; that column
  records provenance only and confers no access.
- **"own"** — the row's owning column equals `auth.uid()`, or in the case of
  `lesson_progress`, the owning row's `enrollment_id` resolves to an enrollment
  whose `student_id` equals `auth.uid()`.

### 5.7 RLS matrix

| Table | select | insert | update | delete |
|---|---|---|---|---|
| `profiles` | self; admin all; instructor reads students enrolled in own courses | admin | self (non-role fields); admin any | admin |
| `course_categories` | all authenticated | admin | admin | admin |
| `courses` | `published`, or admin, or instructor-of, or enrolled | admin, instructor | admin, owning instructor | admin, owning instructor |
| `course_instructors` | admin; own row; enrolled student | admin | admin | admin |
| `modules` / `lessons` / `lesson_materials` | admin; instructor-of; enrolled | admin, instructor-of | admin, instructor-of | admin, instructor-of |
| `enrollments` | own student; instructor-of course; admin | student self-enroll in `published` course; admin | admin, instructor-of | student own; admin |
| `lesson_progress` | own; instructor-of; admin | own | own; admin | admin |

### 5.8 Storage buckets

| Bucket | Access | Contents |
|---|---|---|
| `course-thumbnails` | public read | course images |
| `avatars` | public read | instructor/student avatars |
| `lesson-materials` | **private**, signed URLs | lesson downloads |
| `assignment-submissions` | **private**, signed URLs | student uploads (bucket created with the assignments feature) |

File metadata lives in PostgreSQL; bytes never do.

---

## 6. Authentication and roles

### 6.1 Flow

1. **Bootstrap** — `authStore.initialize()` once on app mount:
   `supabase.auth.getSession()` → if a session exists, fetch the `profiles` row →
   set `role`. An `initialized` flag gates the router so guards never race the
   session.
2. **Guard** — `router.beforeEach` awaits `authStore.ensureReady()`. No session →
   redirect `/auth/login?redirect=<intended>`. `meta.roles` present and current
   role not included → redirect to that role's home. Guards are UX only; RLS is
   enforcement (§5).
3. **Register** — `supabase.auth.signUp({ email, password, options:
   { emailRedirectTo } })`. The `handle_new_user` trigger creates the profile as
   `student`. If email confirmation is enabled, show a "check your email" state.
4. **Login** — `signInWithPassword`, then fetch the profile, then route to the
   role home: `admin → /admin/dashboard`, `instructor → /instructor/dashboard`,
   `student → /student/dashboard`.
5. **Logout** — `signOut`, reset the store, redirect to `/auth/login`.
6. **Password reset** — `resetPasswordForEmail` with a redirect to
   `/auth/reset-password`; that view calls `updateUser` to set the new password.
7. **First admin** — bootstrapped by running one SQL snippet in the Supabase SQL
   editor that promotes one existing profile to `admin`. This is deliberate: RLS
   and the role-change trigger make self-escalation impossible, so the initial
   admin cannot come from the application.

### 6.2 Guards are not security

`meta.roles` improves UX only. A user who edits client state still gets nothing,
because every read and write is filtered by RLS against their `auth.uid()`.

---

## 7. Frontend architecture

### 7.1 Layering

```
Views / Layouts  →  Pinia stores  →  services/  →  supabase client  →  Postgres + RLS
    render          session+role     only queries
```

- **Views** never import the Supabase client.
- **Stores** hold session, profile, role and UI state. Only `auth.ts` in this
  spec; `course`, `enrollment` and `notification` stores arrive with their
  features.
- **Services** are the single home of Supabase queries. Each owns its `.select()`
  shape and its return type.
- **Composables** (`useSidebar`, `useRTL`) are retained unchanged — sidebar and
  RTL state is UI-local, not application state, so it does not belong in Pinia.

### 7.2 Target structure

```
src/
├── assets/main.css              Carbon-mapped @theme tokens
├── layouts/
│   ├── AppLayout.vue            route-level shell wrapper (generalized from AdminLayout)
│   └── AuthLayout.vue           route-level auth wrapper (thin, over FullScreenLayout)
├── router/
│   ├── index.ts                 createRouter + beforeEach guard
│   └── routes/{auth,student,instructor,admin}.ts
├── stores/
│   └── auth.ts                  session, profile, role
├── services/
│   ├── supabase/client.ts       createClient singleton
│   ├── supabase/types.ts        hand-written Database type
│   ├── profile.service.ts
│   └── course.service.ts
├── types/index.ts               Role, Profile, Course, Enrollment, ServiceError
├── utils/                       formatters, validation helpers
├── composables/                 useSidebar.ts, useRTL.ts (unchanged)
├── components/
│   ├── layout/                  shell parts retained per AGENTS.md: AppHeader,
│   │                            AppSidebar, Backdrop, SidebarProvider,
│   │                            SidebarWidget, ThemeProvider, header/*
│   ├── ui/ forms/ charts/ tables/ common/ profile/    retained + adapted
│   └── auth/                    auth-specific widgets
└── views/
    ├── auth/       student/     instructor/  admin/  errors/
```

View directories follow the template's `src/views/<Category>/<PageName>.vue`
convention, lowercased per §6.

**`src/layouts/` vs `src/components/layout/`.** These are not duplicative and the
distinction is deliberate. `src/layouts/` holds route-level wrappers that a route
record names in its `component` field — one per shell, per §6 of the project
specification. `src/components/layout/` holds the shell's *parts* and stays where
`AGENTS.md` puts it. `AdminLayout.vue` moves out of `components/layout/` into
`layouts/AppLayout.vue`; `AppHeader`, `AppSidebar`, `Backdrop`,
`SidebarProvider`, `SidebarWidget`, `ThemeProvider` and `header/*` stay put, and
`FullScreenLayout.vue` stays put and is wrapped by `layouts/AuthLayout.vue`.

### 7.3 Navigation registry

`src/layouts/navigation.ts` exports a map from role to nav item definitions
(`{ label, to, icon }`, using Lucide components). `AppLayout` reads the current
role and renders that role's items. Adding a role is a data change; adding a page
is a route plus one nav entry.

### 7.4 Dependencies

**Removed:** `leaflet`, `@types/leaflet` (redundant with JSVectorMap), `swiper`,
`vuedraggable`, `dropzone`, `@floating-ui/vue`, `floating-vue`, `@popperjs/core`,
`simplebar-vue`, `temporal-polyfill` — each assessed against a concrete LMS need;
none currently has one. FullCalendar is **kept** per D4.

**Retained:** `fullcalendar` + `@fullcalendar/vue3`, `jsvectormap` +
`vuevectormap`, `apexcharts` + `vue3-apexcharts`, `flatpickr` +
`vue-flatpickr-component`, `lucide-vue-next`, `@tailwindcss/forms`,
`@tailwindcss/typography`.

**Reinstalled on demand:** `dropzone` returns with the Storage upload feature;
`vuedraggable` returns with module/lesson reordering. Both were verified as
genuine future needs, not installed speculatively.

**Added (approved):** `pinia`, `@supabase/supabase-js`.

### 7.5 Deleted content

`src/icons/` (48 files, per D5), `src/components/ecommerce/`,
`src/views/Ecommerce.vue`, the demo `public/images/` set (`product/`, `user/`,
`chat/`, `task/`, `carousel/`, `grid-image/`, `cards/`, `ecommerce`-adjacent
imagery), `banner.png`.

`src/views/UiElements/`, `Chart/`, `Tables/`, `Forms/` are retained during the
foundation as the live component reference, and pruned in a later stage once real
LMS pages supersede them.

---

## 8. Environment and configuration

`.env.example` (committed):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

`.gitignore` gains `.env`, `.env.*`, `!.env.example`. The current `.gitignore`
does **not** ignore `.env`, which would violate §16.

Only the anon key is ever exposed. The service-role key never enters frontend code
and is not needed: role promotion runs as an explicit SQL snippet, and admin user
management uses RLS-authorised operations rather than the admin API.

`env.d.ts` gains typed declarations for the two variables so a missing variable is
a compile error rather than a runtime `undefined`.

---

## 9. Error handling

- Services throw `ServiceError { code, message, details }`; raw `PostgrestError`
  never reaches a component.
- Views catch and render the existing `Alert.vue`.
- RLS denials map to "You don't have permission to view this", never raw SQL text.
- Every async view implements three explicit states — **loading** (skeleton),
  **empty**, and **error** — per §10.
- Destructive actions confirm first (§10), using the existing modal component.

---

## 10. Verification

The template ships **no test infrastructure** — no Vitest, no test script. Adding
Vitest means a new dependency, so it is excluded from this spec and proposed
separately at §18 stage 20.

Stages 1–7 are gated on:

1. `npm run type-check` — `vue-tsc`, zero errors.
2. `npm run lint` — ESLint clean.
3. `npm run build` — production build succeeds.
4. `npm run preview` serves the built app.
5. **Manual smoke test.** The admin UI is out of scope for this spec (section 1.1,
   stage 8), so role promotion is performed by running SQL in the Supabase SQL
   editor. This is the same mechanism as first-admin bootstrap in section 6.1
   step 7, and a deliberate rehearsal of it.

   1. Register a new account. It lands on `/student/dashboard` with student nav only.
   2. Promote it in the SQL editor:
      `update profiles set role = 'instructor' where email = '<test email>';`
   3. Promote a second account to `admin` the same way.
   4. Log out, log back in as the instructor. Instructor nav renders,
      `/instructor/*` resolves, `/admin/*` is refused and redirects to
      `/instructor/dashboard`.
   5. From the browser console, on the instructor session, attempt
      `await supabase.from('profiles').update({ role: 'admin' }).eq('id', myId)`
      This **must be rejected** by the `prevent_role_self_change` trigger.
   6. Attempt to read another user's `profiles` row. This **must return zero
      rows** under RLS.

   Steps 5 and 6 are the real test of section 5. A passing router guard proves
   nothing; these must not be skipped.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| Google Fonts becomes an availability dependency | Self-host the two IBM Plex woff2 files as a fallback |
| Carbon's flat-square look is a visible change from TailAdmin's rounded cards | Token-only change; no component churn. Correctness over cosmetics. |
| Removing 9 npm packages breaks an import the audit missed | `type-check` + `build` gate each removal; remove one at a time |
| RLS policies written but never exercised | Only tables whose policies are reachable from the foundation UI are created now (§5.3) |
| Pinia + a 4th state mechanism (composables) invites confusion | Document the split: Pinia for cross-view application state, composables for UI-local state |
| `AGENTS.md` and `DESIGN.md` compete as instructions | `AGENTS.md` amended with an explicit precedence note: `DESIGN.md` governs appearance, `AGENTS.md` governs construction, and tokens in `main.css` are the single implementation |

---

## 12. Payments — PayMongo, Philippine pesos

Added 2026-10-04. Courses are a mix of free and paid; a free course enrols
immediately, a paid course unlocks only after PayMongo confirms payment out of
band. The user-facing journey is drawn in `docs/role-flowchart.md` §7.

### 12.1 Where the secret key lives

The PayMongo secret key (`sk_test_` / `sk_live_`) is **never** a `VITE_`
variable and never enters the frontend bundle. PayMongo requires it for two
operations — creating a checkout session and verifying webhook signatures — and
neither can be done safely from a browser. A `VITE_`-prefixed value is compiled
into public JavaScript and readable in devtools, which would let any visitor
create or refund payments.

It is held as a **Supabase secret** and read only inside a **Supabase Edge
Function**. This was chosen over a Vercel serverless function because §2 rules out
a separate backend and unnecessary API servers, and an Edge Function is part of
Supabase, which is already the locked backend. Only `VITE_SUPABASE_ANON_KEY`
reaches the browser.

Environment, all server-side, none committed:

```
PAYMONGO_SECRET_KEY=sk_test_...        # Supabase secret, never VITE_
PAYMONGO_WEBHOOK_SECRET=...           # if webhook signing is enabled
SUPABASE_SERVICE_ROLE_KEY=...         # used only inside the Edge Function
```

`.env.example` documents the two browser variables and states that the PayMongo
secret is set in Supabase, not in a `.env` file in the repository.

### 12.2 Schema

`courses` gains one column:

- `price_centavos integer not null default 0` — a course is paid iff
  `price_centavos > 0`. No separate boolean flag: a flag would be able to
  disagree with the price.

New table `payments`:

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `student_id` | `uuid` FK → `profiles` cascade | who paid |
| `course_id` | `uuid` FK → `courses` cascade | what for |
| `amount_centavos` | `integer` | copied from `courses` at checkout; the browser never supplies it |
| `currency` | `text` default `'PHP'` | |
| `status` | `payment_status` | `pending` → `paid` \| `failed` \| `refunded` |
| `provider` | `text` default `'paymongo'` | |
| `provider_payment_id` | `text` | PayMongo payment intent id |
| `provider_checkout_id` | `text` | PayMongo checkout session id |
| `reference_number` | `text` unique | human-readable, shown to the student |
| `paid_at` | `timestamptz` | set only by the verified webhook |
| `created_at` / `updated_at` | `timestamptz` | |

Amounts are stored as **integer centavos**, never floats. PHP has two decimal
places and float arithmetic loses cents.

A partial unique index allows repeated attempts but permits only one live charge:

```sql
create unique index payments_one_paid_per_student_course
  on payments (student_id, course_id)
  where status = 'paid';
```

### 12.3 RLS

| Operation | Who |
|---|---|
| select | the student who paid; admins all. Instructors see none. |
| insert / update | nobody directly. The Edge Function writes using the service role, which bypasses RLS by design. |
| delete | admins only |

The service role is the reason this is safe: a browser cannot write a
`status = 'paid'` row, so payment state cannot be forged from the client.

### 12.4 Edge Functions

**`create-checkout`** — authenticated.
1. Verify the caller's JWT, resolve `auth.uid()`.
2. Load the course. Reject if `price_centavos = 0` (free courses enrol directly).
3. Reject if already enrolled, or if a `paid` payment already exists.
4. Re-read the amount **from the database** — never from the request body.
5. Create a `pending` payment row and a PayMongo checkout session.
6. Return the redirect URL.

**`paymongo-webhook`** — public, signature-verified.
1. Verify the PayMongo signature with the shared secret. An unverified webhook
   is treated as hostile input and dropped.
2. On a paid event, mark the payment `paid` and set `paid_at`.
3. Create the enrollment, or upgrade an existing one to `active`.
4. Idempotent: the same event delivered twice must not create two enrollments.

### 12.5 Rules

1. **The amount comes from the school's records.** The client sends a course id
   and nothing else.
2. **Enrolment follows the webhook, not the browser.** Closing the tab mid-payment
   cannot lose a payment or strand an enrolment.
3. **Free and paid share one enrolment path.** Only the trigger differs, so
   there is no second code path to keep in sync.
4. **Refunds are admin-only**, recorded as a new `refunded` status rather than
   by deleting the row, so the ledger stays auditable.
5. **Test keys first.** All development and the school demo run on `sk_test_`.
   Live keys are introduced only at deployment, and only ever as a Supabase
   secret.

---

## 13. Definition of done

- [ ] `pinia` and `@supabase/supabase-js` installed; 9 unused packages removed
- [ ] Schema applied: 9 tables, 4 helper functions, 3 triggers, RLS on every table
- [ ] `.env.example` committed; `.git*` ignored
- [ ] Carbon tokens applied to `main.css`; Google Fonts link added
- [ ] `blue-light-*` and `orange-*` ramps deleted **and every surviving reference
      remapped** to the nearest `brand-*` or `gray-*` token — verified by
      `type-check` and by grepping the source for both ramp names returning zero
      hits
- [ ] `--radius-*` re-pointed to Carbon's 0/2/4px scale; `rounded-full` retained
- [ ] `--font-outfit` repointed to IBM Plex Sans with `--font-plex` canonical
- [ ] `src/icons/`, `components/ecommerce/`, `Ecommerce.vue`, demo images, `banner.png` deleted
- [ ] `AppLayout` + `AuthLayout` + role nav registry; router split per role
- [ ] Auth: register, login, logout, password reset, session persistence
- [ ] Role resolution from `profiles`; guard redirects; RLS blocks escalation
- [ ] Loading, empty and error states on every async view
- [ ] `type-check`, `lint`, `build` clean; manual smoke test passed including the privilege-escalation check
- [ ] `AGENTS.md` amended for the icon rule and the `DESIGN.md` precedence note
- [ ] `courses.price_centavos` added; `payments` table, partial unique index and RLS applied
- [ ] `create-checkout` and `paymongo-webhook` Edge Functions deployed; secret held as a Supabase secret and absent from the bundle
- [ ] Free course enrols immediately; paid course enrols only after a verified webhook; duplicate webhook is idempotent
