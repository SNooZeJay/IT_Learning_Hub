# IT Learning Hub LMS

A role-based Learning Management System built with Vue 3, TypeScript, Tailwind CSS
v4 and Supabase. Three roles: **Admin**, **Instructor**, **Student**.

The interface is built on [TailAdmin Vue Free](https://github.com/TailAdmin/tailadmin-free-tailwind-dashboard-template)
(MIT). TailAdmin supplied the UI shell only — it does not define the data model,
permissions, roles or workflows. Those are described below and in `docs/`.

## What this is

An online learning platform where instructors publish courses and students enrol,
work through modules and lessons, sit timed quizzes, and track their results.

| Role           | Can do                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Student**    | Browse the catalogue, enrol, read lessons and materials, sit quizzes, submit assignments, see grades and certificates, message instructors and other students |
| **Instructor** | Create and publish courses, author modules / lessons / materials, build quizzes, set assignment deadlines, grade submissions, message enrolled students       |
| **Admin**      | Manage users, roles, categories, courses and payments; read platform-wide analytics                                                                           |

Enrolment is the basis of access. A student sees a course once they are enrolled in
it; an instructor sees only the courses assigned to them. Both are enforced by Row
Level Security in the database, not by the interface.

## Stack

- **Vue 3** — Composition API, `<script setup lang="ts">`
- **TypeScript** ~5.7 — strict
- **Tailwind CSS v4** — configured with `@theme` tokens in `src/assets/main.css`; there is no `tailwind.config.js`
- **Vite 6** — with `@vitejs/plugin-vue` and `@vitejs/plugin-vue-jsx`
- **Pinia** — application state that outlives a view (auth session, profile, role)
- **Supabase** — Postgres, Auth, Storage, Edge Functions
- **ApexCharts** — dashboard charts
- **Vitest** — unit and link-integrity tests

## Getting started

```bash
npm install
```

The app needs two environment variables:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Nothing else belongs in `.env`. Every server-side secret lives in Supabase Edge
Function secrets, never in this repository.

```bash
npm run dev          # development server
npm run build        # type-check, then build to dist/
npm run type-check   # vue-tsc
npm run lint         # eslint --fix
npm run format       # prettier
npm run test         # vitest
npm run verify       # test, type-check, lint, build
```

## Layout

```
src/
├── assets/main.css          Tailwind v4 theme: design tokens and global styles
├── components/
│   ├── calendar/            Month, week and day-detail calendar
│   ├── curriculum/          Module / lesson / material tree
│   ├── layout/              Admin shell, sidebar, header, dropdowns
│   ├── profile/             Avatar, details, security, preferences
│   ├── quiz/                Quiz authoring and the attempt runner
│   └── ui/                  Primitives: Button, Modal, Alert, Badge, …
├── composables/             UI state: sidebar, RTL, shared notification count
├── layouts/navigation.ts    Per-role navigation, single source of truth
├── router/index.ts          Routes and the role guard
├── services/                Every Supabase query lives here
├── stores/                  Pinia: auth session, profile, role
├── types/                   Shared types and enums
└── views/                   admin/ instructor/ student/ shared/
```

`src/services/` owns every query. Views and stores call typed service functions and
never import the Supabase client, so a change to a table's shape has one place to
change.

## Security model

- **Row Level Security is the enforcement point.** The interface hides what a user
  may not see; the database refuses it. Every security claim is verified by executing
  it as the role inside `BEGIN; … ROLLBACK;`.
- Role checks live in `src/router/index.ts` for navigation, and in RLS for data.
- Quiz answer keys are exposed only through functions that gate on entitlement
  (ownership, admin, or an active enrolment) — never by a plain `select`.
- Profile email is read-only in the interface: there is no sync trigger, so a direct
  write would desynchronise it.

`docs/quiz-system.md` records the quiz design and the verified security matrix.

## Deployment

The live site is **<https://it-learning-hub-three.vercel.app>**. Note the `-three`:
`it-learning-hub.vercel.app` is a _different_ Vercel project that happens to share
the name, it is not this application, and it will 404 on every route. See
[`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md).

Deep links work because `vercel.json` carries an SPA rewrite. The build also emits
`404.html` as a copy of `index.html`, as a safety net: the rewrite depends on a
Vercel project setting nobody can see from here, and if that setting is ever changed
the rewrite is silently ignored — `/` keeps working and every other route becomes a
bare 404, with no build, test or type-check failing to notice. The rationale and the
evidence are in the comment in `vite.config.ts`.

## Documentation

- `AGENTS.md` — how the project is built
- `DESIGN.md` — how it looks; the `@theme` tokens in `src/assets/main.css` are its
  implementation
- `docs/` — the foundation design, the quiz system reference, and audit notes

## Licence

MIT — see [`LICENSE`](./LICENSE). The TailAdmin template this UI is built on is
itself MIT licensed; its notice is retained in
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).
