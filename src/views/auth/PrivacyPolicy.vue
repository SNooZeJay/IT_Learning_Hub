<template>
  <LegalDocument
    title="Privacy Policy"
    subtitle="What this platform records about you, and who can read it."
    :sections="sections"
  />
</template>

<script setup lang="ts">
import LegalDocument from './LegalDocument.vue'

/**
 * Privacy Policy.
 *
 * Written from the actual schema rather than from a template. Every "what is recorded"
 * item below is a real table, every "who can see" item is a real access rule, and where the
 * platform does not do something this document says so instead of implying a capability
 * that is not there.
 *
 * A demonstration template. It says so, because text that reads as reviewed school policy
 * and is not would be worse than nothing.
 */
const sections = [
  {
    id: 'who',
    heading: 'Who is responsible for your data',
    body: [
      'Your school is the organisation that decides what is recorded and why, and how long it is kept.',
      'This platform stores that data and enforces who may read it. Where this document says a limit is enforced, it is enforced by the platform and not by convention or by a setting somebody can change.',
    ],
  },
  {
    id: 'account-data',
    heading: 'Your account',
    body: [
      'Recorded: your name, email address, role, and whether your account is active, invited or suspended. Your email address is the one you sign in with, and it is stored in two places that are not automatically kept in step — if they ever disagree, the sign-in address is the one that works.',
      'Optional, and yours to add or remove: a profile photo and a short biography. Neither is required, and both are removed on request.',
      'Your sign-in times are recorded, so your school can answer a question about who used an account and when.',
    ],
  },
  {
    id: 'learning-record',
    heading: 'Your learning record',
    body: [
      'Recorded for every course you are enrolled in: which courses you joined and when, which lessons you have started and which you have completed, and how far through you are.',
      'Recorded when you do assessment work: every quiz attempt with its answers, score, pass mark and whether it passed; every assignment submission with its file or written answer, its grade and the feedback written on it.',
      'A course that reaches every requirement issues a certificate automatically, carrying your name, the course, the date, the instructor, the administrator and a certificate number.',
      'Payments: the amount, the course, the status and a payment reference. Your card details are not here — they stay with the payment provider, which sends back only a confirmation.',
    ],
  },
  {
    id: 'who-can-see',
    heading: 'Who can read it',
    body: [
      'You can read your own learning record in full: your progress, your quiz results, your grades and feedback, your certificates, your messages.',
      'The instructors who teach your courses can read your progress, your submissions and your grades. They need to in order to teach and to mark, and they cannot see the records of students in courses they do not teach.',
      'Administrators can read account information, enrollments, payments and platform-wide figures, and can revoke a certificate.',
      'Other students cannot read your grades, your submissions, your certificates or your messages. This is enforced on every read, not decided by the interface.',
    ],
  },
  {
    id: 'sign-in-codes',
    heading: 'Sign-in codes',
    body: [
      'If you turn on a sign-in code, a six-digit code is emailed to you each time you sign in. The code is never stored in a form anyone could read back: only a keyed fingerprint of it is kept, so a copy of that data still does not reveal the code.',
      'The code works once and expires after fifteen minutes. Wrong guesses are counted and the code is burned after five.',
      'Turning the code off is one switch in Settings and applies to your next sign-in.',
      'This platform keeps no copy of your email. Codes go out through the school’s mailer and are not filed.',
    ],
  },
  {
    id: 'files',
    heading: 'Files',
    body: [
      'A profile photo is stored so it can appear beside your name. Files you attach to an assignment are stored privately and are not publicly reachable; a link is generated only for the people allowed to open it, and those links expire after a short time rather than staying valid forever.',
      'Course reference files are served the same way, to enrolled students and to the instructors teaching them.',
    ],
  },
  {
    id: 'messages',
    heading: 'Messages and announcements',
    body: [
      'Messages are visible to the people in the conversation: the instructors of your courses, the students sharing them with you, and administrators.',
      'Announcements posted to everybody are visible to every signed-in account. Announcements scoped to one course are visible to the people on that course.',
      'Announcements that have not been published are visible only to their author and to administrators.',
    ],
  },
  {
    id: 'keeping',
    heading: 'How long records are kept',
    body: [
      'Learning records are kept so that your progress, your grades and any certificate you earn remain available to you. Closing an account does not by itself erase them.',
      'Suspended and closed accounts keep their records. A withdrawn enrollment is kept for reporting but no longer grants access to the course.',
      'Your school decides the retention period and when records are deleted.',
    ],
  },
  {
    id: 'your-choices',
    heading: 'What you can change yourself',
    body: [
      'You can change your name, phone number, profile photo and biography yourself, on your profile.',
      'You can turn a sign-in code on and off yourself, in Settings. You can send yourself a password reset link from the same screen.',
      'Everything else is not yours to change: your role, your enrollments, your grades, and whether a certificate has been revoked. Ask your instructor or your administrator.',
    ],
  },
  {
    id: 'contact',
    heading: 'Questions',
    body: [
      'Questions about your data go to your school administrator, who is the organisation responsible for it. They can see the record in question and explain it to you.',
    ],
  },
]
</script>
