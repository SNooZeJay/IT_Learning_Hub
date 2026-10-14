import {
  Award,
  BadgeCheck,
  BellOff,
  CircleDollarSign,
  CircleX,
  ClipboardCheck,
  GraduationCap,
  Megaphone,
  MessageSquare,
  School,
} from 'lucide-vue-next'
import type { NotificationType } from '@/services/learning.service'

/**
 * Icon and wording per notification type, shared by the notifications board
 * and the header bell.
 *
 * The words matter as much as the icons: colour alone would leave a
 * colour-blind reader, or a screen reader, with no way to tell an enrolment
 * confirmation from a revocation. The bell used to carry its own copy of this
 * map with a note saying to lift it the next time the list was touched - adding
 * the instructor and admin boards is that time.
 */
export const NOTIFICATION_TYPE_META: Record<
  NotificationType,
  { icon: typeof Award; label: string; wrap: string }
> = {
  enrolment_confirmed: {
    icon: School,
    label: 'Enrollment',
    wrap: 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400',
  },
  payment_received: {
    icon: CircleDollarSign,
    label: 'Payment',
    wrap: 'bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-400',
  },
  quiz_graded: {
    icon: ClipboardCheck,
    label: 'Quiz result',
    wrap: 'bg-warning-50 text-warning-600 dark:bg-warning-500/10 dark:text-warning-400',
  },
  assignment_graded: {
    icon: Award,
    label: 'Assignment marked',
    wrap: 'bg-warning-50 text-warning-600 dark:bg-warning-500/10 dark:text-warning-400',
  },
  course_completed: {
    icon: GraduationCap,
    label: 'Course completed',
    wrap: 'bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-400',
  },
  certificate_issued: {
    icon: BadgeCheck,
    label: 'Certificate issued',
    wrap: 'bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-400',
  },
  certificate_revoked: {
    icon: CircleX,
    label: 'Certificate revoked',
    wrap: 'bg-error-50 text-error-600 dark:bg-error-500/10 dark:text-error-400',
  },
  announcement: {
    icon: Megaphone,
    label: 'Announcement',
    wrap: 'bg-surface text-slate dark:bg-white/[0.06]',
  },
  new_message: {
    icon: MessageSquare,
    label: 'Message',
    wrap: 'bg-surface text-slate dark:bg-white/[0.06]',
  },
}

/**
 * Unknown types fall back rather than rendering nothing. The enum in Postgres
 * can gain a value before this map does, and a blank circle beside a real
 * title looks like a rendering bug.
 */
export function notificationMetaFor(type: NotificationType) {
  return (
    NOTIFICATION_TYPE_META[type] ?? {
      icon: BellOff,
      label: 'Update',
      wrap: 'bg-surface text-slate',
    }
  )
}

export function notificationIconFor(type: NotificationType) {
  return notificationMetaFor(type).icon
}

export function notificationTypeLabel(type: NotificationType): string {
  return notificationMetaFor(type).label
}

export function notificationIconWrapClass(type: NotificationType): string {
  return notificationMetaFor(type).wrap
}
