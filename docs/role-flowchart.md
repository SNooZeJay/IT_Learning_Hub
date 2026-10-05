# IT Learning Hub — User Role Flowchart

> A user-and-role map of the finished system. Not an architecture diagram.
> Every arrow here corresponds to something the running application actually does.

Last rebuilt against the deployed system on **5 October 2026**.

---

## 1. The four roles

| Role           | Who they are                     | What they are trying to do                         |
| -------------- | -------------------------------- | -------------------------------------------------- |
| **Visitor**    | Anyone, no account               | Decide whether this is worth an account            |
| **Student**    | Signed in, `role = 'student'`    | Learn something, and see that they are progressing |
| **Instructor** | Signed in, `role = 'instructor'` | Teach a course and see who is stuck                |
| **Admin**      | Signed in, `role = 'admin'`      | Keep the platform correct                          |

A visitor is not a fifth database role. `profiles.role` has exactly three values —
`student`, `instructor`, `admin` — and a visitor is simply _not signed in_. Every
policy in the schema is written `to authenticated`, which is what makes "not
signed in" a real, enforced state rather than a UI convention.

---

## 2. The whole map

```
                            ┌──────────────────────┐
                            │       VISITOR       │
                            │    (not signed in)   │
                            └──────────┬───────────┘
                                       │
                 ┌─────────────────────┼─────────────────────┐
                 │                     │                     │
                 ▼                     ▼                     ▼
        ┌────────────────┐   ┌──────────────────┐  ┌──────────────────┐
        │ / landing      │   │ /courses         │  │ /courses/:slug   │
        │ read-only      │   │ public catalogue │  │ public course    │
        └────────────────┘   └──────────────────┘  └──────────────────┘
                 │                     │                     │
                 └─────────────────────┴──────────┬──────────┘
                                                    │ "Enrol"
                                                    ▼
                                       ┌────────────────────────┐
                                       │  /auth/register        │
                                       │  creates an account    │
                                       └────────────┬───────────┘
                                                    │ account created
                                                    ▼
        ╔═══════════════════════════════════════════════════════════╗
        ║                     S T U D E N T                        ║
        ╚═══════════════════════════════════════════════════════════╝
             │              │               │              │
             │              │               │              │
             ▼              ▼               ▼              ▼
        Enrol in a      Take a         Submit an      Claim a
        course          quiz           assignment     certificate
             │              │               │              │
             └──────────────┴───────┬───────┴──────────────┘
                                    │ needs help
                                    ▼
                          ┌──────────────────┐
                          │ Notifications    │◄──── written by database
                          │ /student/        │      triggers, not the client
                          │ notifications    │
                          └──────────────────┘

        ┌─────────────────────────────────────────────────────────┐
        │                  I N S T R U C T O R                    │
        │  assigned to a course via course_instructors           │
        └───────────┬───────────────────────┬─────────────────────┘
                    │                       │
                    ▼                       ▼
          Author a course            Grade work
          modules / lessons /        submissions and
          quizzes / assignments      see who is stuck
                    │                       │
                    └───────────┬───────────┘
                                │ publishes
                                ▼
                     Students see the material
                                │
                                └────► back to the student flow

        ┌─────────────────────────────────────────────────────────┐
        │                        A D M I N                        │
        │  sees every course, user, payment and record           │
        └───────────┬───────────────────────┬─────────────────────┘
                    │                       │
                    ▼                       ▼
          Change a user's role        Read every payment
          (set_user_role)             and its webhook ledger
```

---

## 3. How the role is actually decided

This is the part worth being precise about, because it is where a student
LMS usually has a hole in it.

```
  Person types an email
          │
          ▼
  Supabase Auth creates the user          ← the ONLY place accounts are made
          │
          ▼
  handle_new_user() trigger fires
          │
          ▼
  INSERT INTO profiles (role = 'student')  ← every new account is a student
```

An account **cannot** become an instructor or admin by itself. There is exactly one
route, and it is not available from the UI:

```
  admin signs in
      │
      ▼
  set_user_role(target_id, 'instructor')   ← SECURITY DEFINER
      │
      ▼
  prevent_role_self_change() trigger
      │  refuses if target_id = auth.uid()
      ▼
  role updated
```

`prevent_role_self_change` exists so an admin cannot accidentally or deliberately
demote themselves and lock the platform. It is enforced by Postgres, not by the
admin screen hiding the control.

---

## 4. Where the boundary is drawn

The router guard decides what someone _sees_. It is not what protects anything.

```
  Route guard (src/router/index.ts)          Row Level Security (Postgres)
  ────────────────────────────────           ──────────────────────────
  "a student should not see the               "a student cannot read this
   admin dashboard, send them                 row even if they ask directly
   to their own home"                         with a crafted request"
        UX only                                   THE boundary
```

**A student who edits the route guard in devtools reaches an admin-shaped screen
that renders empty**, because every query it makes is filtered by a policy against
`auth.uid()`. That is the whole design: the client is not trusted, so nothing
important is enforced there.

### What each role can reach

| Area                                      | Visitor | Student          | Instructor  | Admin       |
| ----------------------------------------- | ------- | ---------------- | ----------- | ----------- |
| Landing page, catalogue, course page      | read    | read             | read        | read        |
| Enrol in a course                         | —       | own              | —           | —           |
| Lesson content                            | —       | enrolled courses | own courses | all         |
| Sit a quiz                                | —       | own attempts     | —           | —           |
| **Read the quiz answer key**              | —       | **never**        | own courses | yes         |
| Submit an assignment                      | —       | own              | —           | —           |
| **Grade an assignment**                   | —       | **never**        | own courses | yes         |
| Author courses, modules, lessons, quizzes | —       | —                | own courses | all         |
| Announcements                             | —       | enrolled courses | own courses | all         |
| Notifications                             | —       | own only         | own only    | own only    |
| Messages                                  | —       | own threads      | own threads | own threads |
| Payments                                  | —       | own only         | —           | all         |
| Change a user's role                      | —       | —                | —           | yes         |
| Activity log                              | —       | own actions      | own courses | all         |

---

## 5. The five rules the database refuses to break

Each of these is a Postgres constraint or trigger. If the UI has a bug, the
database still says no.

**1. A student cannot read the answers before submitting.**
`quiz_options.is_correct` and `quiz_questions.explanation` have **no `SELECT`
grant** for `authenticated`. The columns exist; the permission does not. Grading
happens in `submit_quiz_attempt`, which is `SECURITY DEFINER`.

**2. A student cannot mark their own work.**
`quiz_attempts` has no `UPDATE` grant at all. Only `submit_quiz_attempt` writes
the score. One `UPDATE quiz_attempts SET passed = true` is not available.

**3. A graded submission is a record.**
`protect_graded_submission` refuses any change to the grade, feedback or grader of
a submission that has already been graded. A grade above the assignment's maximum
is refused too.

**4. Three quiz attempts, no more.**
`attempts_allowed` has a `CHECK` capping it at 3, and `start_quiz_attempt`
refuses the fourth try. A client cannot raise the cap; the constraint is in the
schema.

**5. A revoked certificate stays visible and blocks re-issue.**
Revoking sets `revoked_at` and a reason. The row is never deleted. The student
keeps seeing it, with the reason. `issue_certificate` refuses to mint a
replacement, so a revoked certificate cannot be quietly swapped out.

---

## 6. The payment journey

Only **GCash** and **PayMaya**, in test mode. No card, no QR Ph.

```
  Student picks a paid course
            │
            ▼
  create-checkout  (Edge Function, verifies the Supabase JWT)
            │
            ├── INSERT enrollment  status = 'pending'
            ├── INSERT payment     status = 'pending', reference_number = ITH-...
            └── PayMongo Checkout Session
                    │
                    ▼
            Student pays with GCash or PayMaya
                    │
                    ▼
  PayMongo ──POST──► paymongo-webhook
            │
            │  1. verify PayMongo's HMAC signature
            │  2. parse the envelope, find OUR reference_number
            │  3. record the event in payment_events (idempotent)
            │  4. settle_payment: amount must MATCH
            │
            ├──► payment    status = 'paid'
            ├──► enrollment status = 'active', activated_at = now()
            └──► notification written
```

**Money is checked, not trusted.** `settle_payment` compares the amount PayMongo
reported against the amount stored, and refuses a mismatch. The browser never
decides whether a payment succeeded — it is told, by the webhook, some time later.

**Why GCash and PayMaya only.** Both resolve inside the checkout session. QR Ph
was dropped for two reasons: it is asynchronous (the learner pays later, in a
banking app), and PayMongo's own documentation warns that **test-mode QR codes
are real and will process a real transaction if scanned**. A live charge during a
classroom demo is not an acceptable risk.

---

## 7. How progress becomes a certificate

```
  complete every lesson  ─┐
  reach the quiz average ─┼──► all requirements met
  hand in + get graded ──┘         │
                                    ▼
                          refresh_enrollment_completion()
                                    │
                            enrollment.status = 'completed'
                                    │
                                    ▼
                            issue_certificate()
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
              first time                      already holds one
                    │                               │
                    ▼                               ▼
          certificate issued              refuses, with the reason
          number ITH-<COURSE>-000001         and the revocation date
```

Completion is stored as **requirements, not a boolean**, so a student who is
blocked can be told exactly what is left — "3 of 5 assignments graded" — rather
than being told they are not finished.

---

## 8. What each role opens

| Role       | First screen after signing in | Sees                                                                  |
| ---------- | ----------------------------- | --------------------------------------------------------------------- |
| Student    | `/student/dashboard`          | Progress, next lesson, recent grades, unread notifications            |
| Instructor | `/instructor/dashboard`       | Their courses, students who need attention, work waiting to be graded |
| Admin      | `/admin/dashboard`            | Platform totals, payments, recent activity                            |

An unauthorised visit to a screen your role cannot use redirects you to your own
home rather than showing an error — the screen is not yours, and saying so would
only confirm it exists.

---

## 9. Verifying this document

Every claim above is checkable against the running system. The evidence for each
was produced by executing it, not by reading the schema:

| Claim                             | How it was verified                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| Students cannot read `is_correct` | `information_schema.column_privileges` → `can_read: false`                                 |
| Short-answer key is unreachable   | 0 readable columns on `quiz_text_answers`                                                  |
| anon cannot reach any of it       | 0 grants across all 28 tables                                                              |
| Grading happens server-side       | Attempt 1: 6/6 · 100% · passed, computed by `submit_quiz_attempt`                          |
| Three attempts, capped            | 4th refused: `no attempts remaining: 3 of 3 used`                                          |
| A marked attempt is final         | Resubmit refused: `attempt already submitted at 2026-10-05 03:16:17+00`                    |
| A grade cannot be erased          | Student UPDATE → 0 rows changed; grade survived at 88.00                                   |
| A grade cannot exceed the maximum | 150 against 100 refused                                                                    |
| Unpublishable quizzes are refused | `cannot publish quiz: "Which is correct?" (multiple_choice): no option is marked correct`  |
| Every table has RLS               | 0 tables without `relrowsecurity`                                                          |
| Both Edge Functions are live      | `create-checkout` → 401 unauthenticated; webhook → `verified: false` on a forged signature |
