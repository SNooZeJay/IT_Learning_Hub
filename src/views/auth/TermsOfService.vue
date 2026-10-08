<template>
  <LegalDocument
    title="Terms of Service"
    subtitle="What you agree to when you use IT Learning Hub."
    :sections="sections"
  />
</template>

<script setup lang="ts">
import LegalDocument from './LegalDocument.vue'

/**
 * Terms of Service.
 *
 * Every claim below describes something this platform actually does. Where a sentence
 * would have been easier if it stayed general - "we may collect information to improve our
 * services" - it names the tables, the roles and the rules instead, because a document
 * that could describe any product is not a privacy agreement, it is a decoy.
 *
 * A demonstration template. It says so, because text that reads as reviewed school policy
 * and is not would be worse than nothing.
 */
const sections = [
  {
    id: 'acceptance',
    heading: 'Accepting these terms',
    body: [
      'These terms apply to everyone using IT Learning Hub: students, instructors and administrators. Using the platform means you accept them.',
      'Your school is the operator. It decides which accounts exist, what each person may reach and how long records are kept. This platform stores the learning data and enforces who may read it; it does not decide what is collected.',
    ],
  },
  {
    id: 'accounts',
    heading: 'Accounts and roles',
    body: [
      'An account belongs to one person and cannot be transferred. Your school issues it, and your administrator can suspend it.',
      'Every account has exactly one role: student, instructor or administrator. You cannot change your own role. A student who enrolled in a course is not thereby an instructor of it; teaching is assigned separately by an administrator.',
      'An administrator cannot remove the last administrator account, so the school always keeps one person with full control.',
    ],
  },
  {
    id: 'sign-in',
    heading: 'Signing in and sign-in codes',
    body: [
      'Signing in takes your email address and password. Password rules are set by the platform, not by this document.',
      'You can turn on a sign-in code in Settings. When it is on, signing in asks for your password and then a six-digit code emailed to your address. The code works once, expires after fifteen minutes, and five wrong guesses burn it.',
      'No member of staff will ever ask you for that code. Someone who does is not who they say they are.',
      'If you think someone else has your password, change it in Settings. Changing it does not sign out a device that is already open, so also sign out from the account menu on any device you do not recognise.',
    ],
  },
  {
    id: 'enrolment',
    heading: 'Enrolling in a course',
    body: [
      'A free course is joined directly, and your place is recorded straight away.',
      'A paid course sends you to a checkout. Your place is created only once the payment provider confirms the money arrived, so an abandoned or failed checkout leaves no place behind and nothing charged.',
      'Leaving a course records that you left. Your completed lessons and any grades you earned are kept, and joining again does not erase them.',
    ],
  },
  {
    id: 'materials',
    heading: 'Lessons, readings and video',
    body: [
      'Lessons are grouped into modules. Most are written readings; some carry a link to a video hosted elsewhere. Where there is no video, the lesson is a reading and shows no video.',
      'Course material belongs to your school and to the instructors who wrote it. Use it for your own learning.',
      'Reference links point to material maintained elsewhere. Those sites are outside this platform and outside these terms.',
    ],
  },
  {
    id: 'assignments',
    heading: 'Assignments and submissions',
    body: [
      'An assignment carries instructions and a deadline. You answer in writing, attach a file, or both. Either is enough; an assignment with no answer and no file cannot be submitted.',
      'Submitted work is visible to the instructors who teach that course, and to administrators. It is not visible to other students.',
      'An instructor may grade a submission and write feedback. Graded work cannot be replaced afterwards, so read it before you close the screen.',
    ],
  },
  {
    id: 'quizzes',
    heading: 'Quizzes, attempts and scores',
    body: [
      'A quiz has a pass mark, a number of allowed attempts and, where set, a time limit. Attempting starts the clock; leaving the tab warns you, and repeated warnings end the attempt.',
      'Answers are marked on the server. The correct answer never reaches your browser, so it cannot be read out of the page or changed from it.',
      'The score and whether you passed are recorded against your account and count toward finishing the course. Each attempt is kept.',
    ],
  },
  {
    id: 'completion',
    heading: 'Completion and certificates',
    body: [
      'A course is complete when every required lesson is finished and every required quiz has been passed. Opening a lesson does not complete it, and a quiz you did not pass does not count.',
      'A certificate is issued the moment those requirements are met, without anyone having to approve it. It carries your name, the course, the date, the instructor who taught it, the platform administrator and a unique certificate number.',
      'You can open it and save it as a PDF at any time. An administrator may revoke a certificate, for instance if it was issued in error, and a revoked certificate cannot be replaced.',
      'A certificate records what you completed here. It is not an academic credential and carries no credit.',
    ],
  },
  {
    id: 'payments',
    heading: 'Payments',
    body: [
      'Payments are made on the provider’s checkout, not on this site. The platform never sees or stores your card details; it receives only the confirmation that a payment succeeded.',
      'A receipt is emailed when a payment settles. A cancelled or abandoned checkout is recorded so you and your school can see what happened, and is not a charge.',
    ],
  },
  {
    id: 'messages',
    heading: 'Messages and announcements',
    body: [
      'You can message the instructors of your courses and the other students on them. Those people can reply. Your messages are visible to administrators.',
      'Announcements are posted either to everybody or to one course. An administrator may post to everyone, including about maintenance or closures; an instructor may post only to a course they teach.',
    ],
  },
  {
    id: 'conduct',
    heading: 'Acceptable use',
    body: [
      'Do not try to reach another student’s records, submissions, grades or messages. Those limits are enforced by the platform rather than left to trust, and deliberately probing them is a breach of these terms.',
      'Submitting work that is not your own is academic misconduct and may be reported.',
      'Do not disrupt the service for others or send automated traffic against it.',
    ],
  },
  {
    id: 'ending',
    heading: 'Ending access',
    body: [
      'Your school may suspend an account when your enrolment ends or when an investigation is open. Your learning record is kept either way.',
      'You can ask your administrator to close your account.',
    ],
  },
  {
    id: 'changes',
    heading: 'Changes to these terms',
    body: [
      'These terms may change. The date at the top shows when they last changed, and a change is announced on the announcements screen before it takes effect.',
    ],
  },
]
</script>
