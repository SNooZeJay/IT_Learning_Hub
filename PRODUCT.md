# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is a student learning IT skills — a Filipino student or career-shifter
building practical, job-relevant technical knowledge: programming, networking, support and
related disciplines.

Their situation: they want to learn a specific, practical skill rather than browse a
video library. They enrol in a course, work through structured lessons in their own
time, test what they have absorbed with quizzes, and want to see evidence of how far
they have come.

Secondary users exist and are served, but the product's design priority follows the
student: instructors who author courses and grade, and administrators who manage users,
courses and payments.

## Product Purpose

IT Learning Hub is a learning management system for IT skills and concepts, delivered as
structured online courses rather than an open video library.

It provides organised learning materials — courses broken into modules and lessons,
quizzes, and progress tracking — so a student develops IT knowledge in a sequence with a
visible record of completion.

Success means a student can enrol, find a course that matches the skill they want,
progress through it lesson by lesson, be tested on it, and see their progress held on
record.

## Positioning

*OPEN — explicitly undecided. The differentiated position has not yet been agreed. It is
not recorded in the repository and must not be invented in copy or design. Until this is
settled, describe only what the product demonstrably does: structured courses, lessons,
quizzes and progress tracking, in Philippine pesos.*

Do not fabricate a differentiator. No copy may assert a claim that the product cannot
truthfully support.

## Operating Context

- Courses are authored by instructors and categorised, published and priced by an
  administrator.
- The catalogue mixes free and paid courses in one list. Paid courses are priced in
  Philippine pesos and enrolled into via PayMongo checkout.
- A new self-registered account starts as a student. Promotion to instructor or admin is
  an explicit administrative act, never a client-supplied one.
- Amounts are held as integer centavos, never floating-point pesos.
- Course structure is authored as categories → courses → modules → lessons, with lesson
  materials and quizzes attached to lessons.

## Capabilities and Constraints

**Confirmed functionality**
- Four roles: visitor (signed out), student, instructor, admin.
- Public landing page, sign in, registration, and password reset.
- Student: enrolled courses, lesson view, quizzes, grades, calendar, notifications.
- Instructor: course authoring and editing, course detail, students, grading, analytics,
  calendar.
- Admin: users and role management, categories, courses, instructors, students,
  payments, analytics, settings.
- Shared: profile.

**Hard constraints — binding on all future work**
- **Stack lock.** Vue 3.5 with Composition API and TypeScript, Vite, Tailwind CSS v4
  configured through `@theme` in `src/assets/main.css`, Vue Router, Pinia, ApexCharts,
  Supabase. No React, Next, Nuxt, Express, Prisma, MongoDB, Firebase, Laravel or Django.
  No separate Node backend.
- **Currency.** Philippine pesos, as integer centavos.
- **Authorization.** Supabase Row Level Security is the only real enforcement. Frontend
  route guards are a UX affordance, never a security boundary.
- **Secrets.** No service-role or PayMongo secret key in frontend code, in `.env`, or in
  any commit. PayMongo's secret lives as a Supabase secret consumed only by an Edge
  Function.
- **Notion design system.** Binding. Purple `#5645d4` reserved for the dominant CTA;
  8px buttons, 12px cards, pills only for badges, tabs and avatars; Inter at weight 600
  for display type; warm neutrals. See `DESIGN.md`.
- **RTL.** Logical properties throughout — no hardcoded physical directional utilities
  without `ltr:` / `rtl:` or a logical equivalent.
- **No invented evidence.** No fabricated testimonials, learner counts, ratings,
  certificates, pricing tiers or urgency messaging. Absences must be stated honestly
  rather than filled with plausible content.

**Undecided**
- Differentiated market position (see Positioning).

## Brand Commitments

- Name: **IT Learning Hub**. Logo asset is `D:\LMS_PROJECT\IT_Learning_Hub_Logo.webp` and
  is to be used as-is, not recreated or replaced.
- Derived from TailAdmin Vue (MIT); TailAdmin and awesome-design-md notices are in
  `THIRD_PARTY_NOTICES.md`.

No brand voice is pinned. Copy may be plain and direct, but that is a choice rather than
a recorded commitment.

## Evidence on Hand

- Live Supabase project with seeded content: 3 categories, 6 courses (5 published,
  1 draft, 2 paid at ₱1,500 and ₱2,500), 8 modules, 8 lessons, 4 enrolments, 5 accounts.
- Real application routes and screens for all three roles, with most admin and
  instructor views still marked as pending features.
- `DESIGN.md` — the Notion-derived design system, current.
- `docs/role-flowchart.md` — role flow and payment sequence.
- Logo asset as above.

**Absent, and therefore never to be fabricated:** testimonials, learner counts, average
ratings, completion statistics, certificates, institution affiliations, press, case
studies, partner logos, and any pricing tier beyond the real ₱ values on real courses.

## Product Principles

1. **A visitor must know what this is within seconds.** Clarity outranks decoration. If
   a section does not answer a real question or move someone toward using the LMS, it
   does not ship.
2. **Structure is the product.** What distinguishes this from a video library is ordered
   courses, lessons, quizzes and progress. Design should make the sequence and the
   progress legible.
3. **Show only what exists.** No placeholder metrics, no invented social proof, no
   urgency the product cannot back. An honest empty state beats a fabricated number.
4. **One obvious next action per surface.** Competing primary calls to action are a
   design failure, not a choice.
5. **Trust is a feature.** Peso pricing shown plainly, and authorization enforced in the
   database rather than implied by the interface.

## Accessibility & Inclusion

- Interactive targets must clear 24×24px minimum; 44×44px for primary controls.
- Dark mode is available on every page and honours `prefers-color-scheme` on first visit.
- Every icon-only control carries an accessible name.
- Colour is never the sole carrier of meaning — progress, status and quiz feedback pair
  it with text or shape.
- Dark mode is class-driven on `<html>`; every styled element has a `dark:` counterpart.
