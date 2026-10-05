import { supabase } from './supabase/client'
import type { Database } from './supabase/types'
import type {
  AccountStatus,
  CourseCategoryRow,
  CourseInstructorRow,
  CourseLevel,
  CourseRow,
  CourseStatus,
  EnrollmentRow,
  EnrollmentStatus,
  PaymentRow,
  PaymentStatus,
  ProfileRow,
  QuizAttemptRow,
  Role,
} from '@/types'

/**
 * Everything the admin surfaces read from the platform, and the four writes an
 * administrator genuinely has.
 *
 * Four rules this file exists to keep.
 *
 * 1. Row Level Security is the authority, not this file. Nothing here asks "is
 *    this admin?" - the policies answer that from `auth.uid()`. Every function
 *    below therefore behaves identically for a caller who is not an admin,
 *    except that it returns nothing, which is the correct answer rather than an
 *    error to hide.
 *
 * 2. Every write goes through a path the database actually grants. Roles change
 *    through `set_user_role`; account status, course status, categories and
 *    instructor assignments go through the RLS policies on their own tables.
 *    No write here is one a browser session could not perform.
 *
 * 3. Postgres owns the refusals. `set_user_role` raises "Cannot demote the last
 *    administrator.", a duplicate category slug raises the unique-violation text,
 *    and a category still in use raises the foreign-key text. Those messages are
 *    the useful part of the response, so they pass through rather than being
 *    replaced with a generic failure. See `AdminError`.
 *
 * 4. Payments are read-only here, and that is a fact about grants rather than a
 *    missing feature. `payments` grants `authenticated` SELECT and DELETE but no
 *    UPDATE, and the functions that settle or fail a payment (`settle_payment`,
 *    `fail_payment`) are SECURITY DEFINER with EXECUTE granted to `service_role`
 *    only. No browser session can mark money as moved, so this file does not
 *    pretend to offer it.
 */

// ---------------------------------------------------------------------------
// Column lists. Named constants so a `.select()` shape is reviewable in one place
// and a schema change is a one-line edit here rather than a hunt through views.
// ---------------------------------------------------------------------------

const PROFILE_COLUMNS =
  'id, role, full_name, email, avatar_url, phone, bio, status, created_at, updated_at'

/** Enough to render a name next to a foreign key, and nothing else. */
const NAME_COLUMNS = 'id, full_name'

/** `thumbnail_url` is deliberately absent: no admin table shows artwork. */
const ADMIN_COURSE_COLUMNS =
  'id, category_id, title, slug, status, level, duration_minutes, passing_score, price_centavos, created_by, published_at, created_at, updated_at'

const CATEGORY_COLUMNS = 'id, name, slug, description, icon, created_at, updated_at'
const CATEGORY_REF_COLUMNS = 'id, name'
const ENROLLMENT_COLUMNS = 'id, course_id, student_id, status, enrolled_at, completed_at'
const ASSIGNMENT_COLUMNS = 'course_id, instructor_id, assigned_at'
const PAYMENT_COLUMNS =
  'id, student_id, course_id, amount_centavos, currency, status, provider, provider_payment_id, provider_checkout_id, reference_number, paid_at, created_at'
const ATTEMPT_COLUMNS = 'id, quiz_id, course_id, percentage, passed, status, submitted_at'

/**
 * `payment_events` and `certificates` are real tables with admin-visible rows,
 * but neither is in the hand-written `Database` type in
 * `services/supabase/types.ts`, which is deliberately maintained in its own
 * change. Rather than widen the shared client for every caller in the app, the
 * two untyped surfaces this file needs are given the narrowest shape that still
 * lets Postgres answer, and their error is surfaced untouched.
 *
 * It is an adapter, not an escape hatch: nothing crosses it un-narrowed, and both
 * readers below validate the shape they were handed.
 */
const PAYMENT_EVENT_COLUMNS =
  'id, event_id, provider, event_type, resource_id, payment_id, signature_verified, processing_status, reported_amount_centavos, reported_currency, livemode, failure_code, failure_message, received_at, processed_at'

interface QueryResponse {
  data: unknown
  count: number | null
  error: { message: string } | null
}

interface UntypedQuery extends PromiseLike<QueryResponse> {
  select(columns: string, options?: { count?: 'exact'; head?: boolean }): UntypedQuery
  eq(column: string, value: string): UntypedQuery
  order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): UntypedQuery
  limit(count: number): UntypedQuery
  then<TResult1 = QueryResponse, TResult2 = never>(
    onfulfilled?: ((value: QueryResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>
}

const untypedTables = supabase as unknown as { from(table: string): UntypedQuery }

const callRpc = supabase.rpc as unknown as (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<QueryResponse>

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * A database failure, carrying the message Postgres chose.
 *
 * Views surface this at the control that caused it rather than at the top of the
 * page, because the refusals worth reading are specific and local: "Cannot
 * demote the last administrator.", "permission denied for function set_user_role",
 * "update or delete on table course_categories violates foreign key constraint".
 * Replacing any of those with "Something went wrong" throws away the only
 * sentence in the response.
 */
export class AdminError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdminError'
  }
}

/**
 * Postgres error text, made presentable.
 *
 * The same narrow strip `quiz.service` uses: it removes a leading `ERROR: ` and a
 * five-character SQLSTATE and nothing else. A broader pattern also ate the first
 * colon of a timestamp, which cost the explanation along with the prefix.
 */
function messageOf(error: { message: string } | null, fallback: string): string {
  if (!error) return fallback
  return error.message.replace(/^(?:ERROR:\s*|[A-Z]{5}:\s*)/, '').trim() || fallback
}

function fail(error: { message: string } | null, fallback: string): AdminError {
  return new AdminError(messageOf(error, fallback))
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The live `payment_status` enum carries `cancelled`, which the app's
 * `PaymentStatus` union does not. Widening it here rather than editing
 * `types/enums.ts` keeps this change inside its own files, and it means a
 * cancelled payment renders as the real state it is rather than falling into a
 * catch-all bucket that pretends the value does not exist.
 */
export type AdminPaymentStatus = PaymentStatus | 'cancelled'

/** In database enum order, which is also the order a status filter should offer. */
export const PAYMENT_STATUSES: readonly AdminPaymentStatus[] = [
  'pending',
  'paid',
  'failed',
  'refunded',
  'cancelled',
] as const

export const ROLES: readonly Role[] = ['admin', 'instructor', 'student'] as const
export const ACCOUNT_STATUSES: readonly AccountStatus[] = ['active', 'invited', 'suspended']
export const COURSE_STATUSES: readonly CourseStatus[] = ['draft', 'published', 'archived']
export const ENROLLMENT_STATUSES: readonly EnrollmentStatus[] = [
  'pending',
  'active',
  'completed',
  'dropped',
] as const

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  instructor: 'Instructor',
  student: 'Student',
}

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  active: 'Active',
  invited: 'Invited',
  suspended: 'Suspended',
}

export const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
}

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  pending: 'Pending',
  active: 'Active',
  completed: 'Completed',
  dropped: 'Dropped',
}

export const PAYMENT_STATUS_LABELS: Record<AdminPaymentStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
}

/** A person, as the admin roster needs them: the profile plus `created_at`. */
export interface AdminUser {
  id: string
  role: Role
  fullName: string
  email: string
  avatarUrl: string | null
  phone: string | null
  bio: string | null
  status: AccountStatus
  createdAt: string
}

export interface AdminStudent extends AdminUser {
  /** Every enrolment row, whatever its status. */
  enrolmentCount: number
  activeCount: number
  completedCount: number
  pendingCount: number
  lastEnrolledAt: string | null
}

export interface AdminInstructorCourse {
  courseId: string
  title: string
  slug: string
  status: CourseStatus
  assignedAt: string
}

export interface AdminInstructor extends AdminUser {
  courseCount: number
  publishedCourseCount: number
  courses: AdminInstructorCourse[]
}

export interface AdminCourseInstructor {
  id: string
  fullName: string
}

export interface AdminCourse {
  id: string
  title: string
  slug: string
  categoryId: string | null
  categoryName: string | null
  status: CourseStatus
  level: CourseLevel
  durationMinutes: number | null
  passingScore: number | null
  priceCentavos: number
  createdBy: string
  createdByName: string
  publishedAt: string | null
  createdAt: string
  instructors: AdminCourseInstructor[]
  enrolmentCount: number
  activeEnrolmentCount: number
  completedEnrolmentCount: number
}

export interface AdminCategory {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  courseCount: number
  createdAt: string
}

export interface AdminCategoryInput {
  name: string
  slug: string
  description?: string | null
  icon?: string | null
}

export interface AdminPayment {
  id: string
  studentId: string
  studentName: string
  courseId: string
  courseTitle: string
  amountCentavos: number
  currency: string
  status: AdminPaymentStatus
  provider: string
  providerPaymentId: string | null
  providerCheckoutId: string | null
  referenceNumber: string
  paidAt: string | null
  createdAt: string
}

export type PaymentEventStatus = 'received' | 'processed' | 'ignored' | 'failed'

/**
 * One webhook the payment provider delivered.
 *
 * Read alongside a payment because it is the evidence for the read-only decision:
 * `signatureVerified` and `processingStatus` show what the Edge Function
 * concluded, and `failureMessage` is why a payment sits in the state it is in.
 * Nothing in the browser can add a row here - `payment_events` has no INSERT
 * policy for `authenticated` at all.
 */
export interface AdminPaymentEvent {
  id: string
  eventId: string
  provider: string
  eventType: string
  resourceId: string | null
  paymentId: string | null
  signatureVerified: boolean
  processingStatus: PaymentEventStatus
  reportedAmountCentavos: number | null
  reportedCurrency: string | null
  livemode: boolean
  failureCode: string | null
  failureMessage: string | null
  receivedAt: string
  processedAt: string | null
}

export interface CountByLabel {
  key: string
  label: string
  count: number
}

export interface MonthBucket {
  /** `YYYY-MM`. The stable key the data is bucketed by. */
  key: string
  label: string
  count: number
  /** centavos, meaningful only on the revenue series. */
  centavos: number
}

/**
 * Everything the analytics page plots.
 *
 * Counts are derived from rows or from `head: true` counts, never from a stored
 * aggregate, so every number on that page can be traced back to a query.
 */
export interface PlatformAnalytics {
  usersByRole: CountByLabel[]
  userStatus: CountByLabel[]
  coursesByStatus: CountByLabel[]
  enrollmentsByStatus: CountByLabel[]
  paymentsByStatus: CountByLabel[]
  revenue: {
    paidCentavos: number
    refundedCentavos: number
    pendingCentavos: number
    failedCentavos: number
    cancelledCentavos: number
    paidCount: number
    refundedCount: number
  }
  enrollment: {
    total: number
    active: number
    completed: number
    dropped: number
    pending: number
    /**
     * completed / (active + completed). Dropped rows are excluded: a student who
     * left is neither a success nor a failure, and counting them would move the
     * rate for reasons that have nothing to do with teaching.
     */
    completionRate: number
  }
  quizzes: {
    quizCount: number
    submittedAttempts: number
    attemptsInProgress: number
    averagePercentage: number | null
    passRate: number | null
  }
  revenueByMonth: MonthBucket[]
  enrollmentsByMonth: MonthBucket[]
}

/** The read-only facts the settings screen is allowed to show. */
export interface PlatformOverview {
  users: {
    total: number
    byRole: CountByLabel[]
    byStatus: CountByLabel[]
  }
  catalogue: {
    courses: number
    publishedCourses: number
    draftCourses: number
    archivedCourses: number
    paidCourses: number
    freeCourses: number
    categories: number
    modules: number
    lessons: number
    quizzes: number
  }
  learning: {
    enrollments: number
    activeEnrollments: number
    completedEnrollments: number
    certificates: number
  }
  money: {
    paidCentavos: number
    refundedCentavos: number
    pendingCentavos: number
    failedCentavos: number
    cancelledCentavos: number
    paidCount: number
    refundedCount: number
  }
}

/**
 * How many months the two time series on the analytics page show.
 *
 * Six is chosen because that is the point at which every month label still fits
 * under its column unrotated, and a chart you have to tilt your head to read is
 * not a chart.
 */
const MONTH_WINDOW = 6

/**
 * Payment and webhook history is capped so a page load cannot be unbounded.
 *
 * Capped rather than paginated because these are audit views: the newest rows are
 * the ones being read. When the cap is hit the views say so, because a silently
 * truncated ledger that looks complete is the worst outcome on a money screen.
 */
const PAYMENT_LIMIT = 500
const PAYMENT_EVENT_LIMIT = 200

export const ADMIN_PAYMENT_LIMIT = PAYMENT_LIMIT
export const ADMIN_PAYMENT_EVENT_LIMIT = PAYMENT_EVENT_LIMIT

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

interface CountResponse {
  count: number | null
  error: { message: string } | null
}

/**
 * `head: true` with an exact count, so the payload is empty no matter how many
 * rows exist. RLS still applies to the count itself.
 */
async function readCount(query: PromiseLike<CountResponse>, fallback: string): Promise<number> {
  const { count, error } = await query
  if (error) throw fail(error, fallback)
  return count ?? 0
}

/** The same count, for the two tables the hand-written `Database` type omits. */
async function readUntypedCount(table: string, fallback: string): Promise<number> {
  const { count, error } = await untypedTables
    .from(table)
    .select('id', { count: 'exact', head: true })
  if (error) throw fail(error, fallback)
  return count ?? 0
}

function toProfile(row: ProfileRow): AdminUser {
  return {
    id: row.id,
    role: row.role,
    fullName: row.full_name,
    email: row.email,
    avatarUrl: row.avatar_url,
    phone: row.phone,
    bio: row.bio,
    status: row.status,
    createdAt: row.created_at,
  }
}

function toCategory(row: CourseCategoryRow): AdminCategory {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    icon: row.icon,
    courseCount: 0,
    createdAt: row.created_at,
  }
}

/**
 * `status` is widened to `AdminPaymentStatus` because the live enum is wider than
 * the app's `PaymentStatus` union. The cast is confined to this one line rather
 * than spread across the view models.
 */
function toPayment(row: PaymentRow): AdminPayment {
  return {
    id: row.id,
    studentId: row.student_id,
    studentName: '',
    courseId: row.course_id,
    courseTitle: '',
    amountCentavos: row.amount_centavos,
    currency: row.currency,
    status: row.status as AdminPaymentStatus,
    provider: row.provider,
    providerPaymentId: row.provider_payment_id,
    providerCheckoutId: row.provider_checkout_id,
    referenceNumber: row.reference_number,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  }
}

function textOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

function toPaymentEvent(raw: unknown): AdminPaymentEvent {
  const row = (raw ?? {}) as Record<string, unknown>
  const reported = row.reported_amount_centavos
  return {
    id: String(row.id ?? ''),
    eventId: String(row.event_id ?? ''),
    provider: String(row.provider ?? ''),
    eventType: String(row.event_type ?? ''),
    resourceId: textOrNull(row.resource_id),
    paymentId: textOrNull(row.payment_id),
    signatureVerified: row.signature_verified === true,
    processingStatus: String(row.processing_status ?? 'received') as PaymentEventStatus,
    reportedAmountCentavos: reported === null || reported === undefined ? null : Number(reported),
    reportedCurrency: textOrNull(row.reported_currency),
    livemode: row.livemode === true,
    failureCode: textOrNull(row.failure_code),
    failureMessage: textOrNull(row.failure_message),
    receivedAt: String(row.received_at ?? ''),
    processedAt: textOrNull(row.processed_at),
  }
}

/** Buckets for the last `count` calendar months, oldest first, current month last. */
function monthWindow(count: number): MonthBucket[] {
  const formatter = new Intl.DateTimeFormat('en-PH', { month: 'short' })
  const buckets: MonthBucket[] = []
  const now = new Date()

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    buckets.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: formatter.format(date),
      count: 0,
      centavos: 0,
    })
  }

  return buckets
}

function monthKeyOf(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Turns a name into the slug the unique index on `course_categories` expects.
 *
 * Generated in the browser rather than by a database default, because the column
 * has no default: a category with a name but no slug cannot be inserted, and
 * deriving it here is the one rule the form needs.
 */
export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/**
 * One row per enum value, so a status with a count of zero still appears.
 *
 * A chart or a filter that silently omits "0 refunded" reads as "no refunds
 * happen" rather than "no refunds have happened yet", and the two are different
 * facts. Every value in the enum is listed, zero included.
 */
function countBy<T extends string>(
  keys: readonly T[],
  labels: Record<T, string>,
  tally: (key: T) => number,
): CountByLabel[] {
  return keys.map((key) => ({ key, label: labels[key], count: tally(key) }))
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

/**
 * Every account, whatever the role or status.
 *
 * Ordered by name. `can_view_profile` decides the rows, so a caller who is not an
 * administrator receives only the profiles it is entitled to rather than an error,
 * which is the correct answer for the wrong caller.
 */
export async function listAllUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .order('full_name', { ascending: true })

  if (error) throw fail(error, 'Could not load the user list.')
  return ((data ?? []) as ProfileRow[]).map(toProfile)
}

/**
 * Students with their enrolment counts.
 *
 * Enrolments are fetched whole and aggregated here rather than with one count
 * query per student: PostgREST has no count-by-group, and a page that issued one
 * query per row to draw a single table would be slow for the wrong reason.
 */
export async function listAllStudents(): Promise<AdminStudent[]> {
  const [{ data: profileRows, error: profileError }, { data: enrollmentRows, error: enrollError }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('role', 'student')
        .order('full_name', { ascending: true }),
      supabase.from('enrollments').select(ENROLLMENT_COLUMNS),
    ])

  if (profileError) throw fail(profileError, 'Could not load the student list.')
  if (enrollError) throw fail(enrollError, 'Could not load enrolments.')

  const byStudent = new Map<
    string,
    { total: number; active: number; completed: number; pending: number; latest: string | null }
  >()

  for (const row of (enrollmentRows ?? []) as EnrollmentRow[]) {
    const entry = byStudent.get(row.student_id) ?? {
      total: 0,
      active: 0,
      completed: 0,
      pending: 0,
      latest: null,
    }
    entry.total += 1
    if (row.status === 'active') entry.active += 1
    if (row.status === 'completed') entry.completed += 1
    if (row.status === 'pending') entry.pending += 1
    if (!entry.latest || row.enrolled_at > entry.latest) entry.latest = row.enrolled_at
    byStudent.set(row.student_id, entry)
  }

  return ((profileRows ?? []) as ProfileRow[]).map((row) => {
    const counts = byStudent.get(row.id)
    return {
      ...toProfile(row),
      enrolmentCount: counts?.total ?? 0,
      activeCount: counts?.active ?? 0,
      completedCount: counts?.completed ?? 0,
      pendingCount: counts?.pending ?? 0,
      lastEnrolledAt: counts?.latest ?? null,
    }
  })
}

/**
 * Instructors with the courses each of them teaches.
 *
 * `course_instructors` is the table that decides what an instructor can see -
 * `is_instructor_of` reads it, not `courses.created_by` - so this join follows the
 * same relationship the database uses rather than an approximation of it.
 */
export async function listAllInstructors(): Promise<AdminInstructor[]> {
  const [
    { data: profileRows, error: profileError },
    { data: assignmentRows, error: assignmentError },
    { data: courseRows, error: courseError },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('role', 'instructor')
      .order('full_name', { ascending: true }),
    supabase.from('course_instructors').select(ASSIGNMENT_COLUMNS),
    supabase.from('courses').select('id, title, slug, status'),
  ])

  if (profileError) throw fail(profileError, 'Could not load the instructor list.')
  if (assignmentError) throw fail(assignmentError, 'Could not load course assignments.')
  if (courseError) throw fail(courseError, 'Could not load courses.')

  const coursesById = new Map<string, { title: string; slug: string; status: CourseStatus }>()
  for (const row of (courseRows ?? []) as Array<{
    id: string
    title: string
    slug: string
    status: CourseStatus
  }>) {
    coursesById.set(row.id, { title: row.title, slug: row.slug, status: row.status })
  }

  const coursesByInstructor = new Map<string, AdminInstructorCourse[]>()
  for (const row of (assignmentRows ?? []) as CourseInstructorRow[]) {
    const course = coursesById.get(row.course_id)
    // Skipping an unmatched assignment is right rather than defensive: the
    // instructor did not teach something that is not visible, and rendering an
    // untitled row would claim otherwise.
    if (!course) continue
    const list = coursesByInstructor.get(row.instructor_id) ?? []
    list.push({ courseId: row.course_id, assignedAt: row.assigned_at, ...course })
    coursesByInstructor.set(row.instructor_id, list)
  }

  return ((profileRows ?? []) as ProfileRow[]).map((row) => {
    const courses = (coursesByInstructor.get(row.id) ?? []).sort((a, b) =>
      a.title.localeCompare(b.title),
    )
    return {
      ...toProfile(row),
      courseCount: courses.length,
      publishedCourseCount: courses.filter((course) => course.status === 'published').length,
      courses,
    }
  })
}

// ---------------------------------------------------------------------------
// Roles and account status
// ---------------------------------------------------------------------------

/**
 * Change a person's role.
 *
 * `set_user_role` is the only supported path, and it is used rather than an
 * `update` on `profiles` for two reasons that both matter. It sets
 * `app.allow_role_change` for the transaction, which is what the
 * `prevent_role_self_change` trigger honours, so the change goes through the
 * database's own door rather than around it. And that trigger still refuses to
 * demote the final administrator, on this path and every other; the refusal
 * arrives here as raised exception text and is shown verbatim.
 *
 * If the function is not granted to `authenticated`, PostgREST answers with
 * "permission denied for function set_user_role". That is reported unchanged
 * rather than dressed up as a transient failure, because it is a statement about
 * the deployment and not about the row being edited.
 */
export async function changeUserRole(userId: string, role: Role): Promise<void> {
  const { error } = await callRpc('set_user_role', { target_id: userId, new_role: role })
  if (error) throw fail(error, 'Could not change this role.')
}

/**
 * Suspend or reactivate an account.
 *
 * A direct update, because `profiles` grants admins UPDATE and the
 * `prevent_role_self_change` trigger re-checks that the caller is an admin before
 * letting a status change through. The payload carries `status` and nothing else:
 * `role` is not in it, so this function cannot become a role-escalation path even
 * if it is called with the wrong id.
 */
export async function changeUserStatus(userId: string, status: AccountStatus): Promise<void> {
  const payload: Database['public']['Tables']['profiles']['Update'] = { status }
  const { error } = await supabase.from('profiles').update(payload).eq('id', userId)
  if (error) throw fail(error, 'Could not change this account status.')
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

/**
 * Every course, including drafts and archived rows.
 *
 * Deliberately not the published-only catalogue: an administrator has to be able
 * to see what has not shipped yet, which is the whole job of this screen.
 */
export async function listAllCourses(): Promise<AdminCourse[]> {
  const [
    { data: courseRows, error: courseError },
    { data: categoryRows, error: categoryError },
    { data: assignmentRows, error: assignmentError },
    { data: nameRows, error: nameError },
    { data: enrollmentRows, error: enrollError },
  ] = await Promise.all([
    supabase.from('courses').select(ADMIN_COURSE_COLUMNS).order('title', { ascending: true }),
    supabase.from('course_categories').select(CATEGORY_REF_COLUMNS),
    supabase.from('course_instructors').select(ASSIGNMENT_COLUMNS),
    supabase.from('profiles').select(NAME_COLUMNS),
    supabase.from('enrollments').select(ENROLLMENT_COLUMNS),
  ])

  if (courseError) throw fail(courseError, 'Could not load the course list.')
  if (categoryError) throw fail(categoryError, 'Could not load categories.')
  if (assignmentError) throw fail(assignmentError, 'Could not load course assignments.')
  if (nameError) throw fail(nameError, 'Could not load people.')
  if (enrollError) throw fail(enrollError, 'Could not load enrolments.')

  const namesById = new Map<string, string>()
  for (const row of (nameRows ?? []) as Array<{ id: string; full_name: string }>) {
    namesById.set(row.id, row.full_name)
  }

  const categoryNames = new Map<string, string>()
  for (const row of (categoryRows ?? []) as Array<{ id: string; name: string }>) {
    categoryNames.set(row.id, row.name)
  }

  const enrollmentsByCourse = new Map<
    string,
    { total: number; active: number; completed: number }
  >()
  for (const row of (enrollmentRows ?? []) as EnrollmentRow[]) {
    const entry = enrollmentsByCourse.get(row.course_id) ?? { total: 0, active: 0, completed: 0 }
    entry.total += 1
    if (row.status === 'active') entry.active += 1
    if (row.status === 'completed') entry.completed += 1
    enrollmentsByCourse.set(row.course_id, entry)
  }

  const assignmentsByCourse = new Map<string, AdminCourseInstructor[]>()
  for (const row of (assignmentRows ?? []) as CourseInstructorRow[]) {
    const list = assignmentsByCourse.get(row.course_id) ?? []
    const fullName = namesById.get(row.instructor_id)
    if (fullName) list.push({ id: row.instructor_id, fullName })
    assignmentsByCourse.set(row.course_id, list)
  }

  return ((courseRows ?? []) as CourseRow[]).map((row) => {
    const counts = enrollmentsByCourse.get(row.id)
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      categoryId: row.category_id,
      categoryName: row.category_id ? (categoryNames.get(row.category_id) ?? null) : null,
      status: row.status,
      level: row.level,
      durationMinutes: row.duration_minutes,
      passingScore: row.passing_score,
      priceCentavos: row.price_centavos,
      createdBy: row.created_by,
      createdByName: namesById.get(row.created_by) ?? 'Unknown account',
      publishedAt: row.published_at,
      createdAt: row.created_at,
      instructors: (assignmentsByCourse.get(row.id) ?? []).sort((a, b) =>
        a.fullName.localeCompare(b.fullName),
      ),
      enrolmentCount: counts?.total ?? 0,
      activeEnrolmentCount: counts?.active ?? 0,
      completedEnrolmentCount: counts?.completed ?? 0,
    }
  })
}

/**
 * Publish, unpublish or archive a course.
 *
 * `published_at` is stamped when a course enters `published` and left alone
 * afterwards. Clearing it on unpublish would throw away when the course first
 * shipped, which is the only date the catalogue sorts by; leaving it means an
 * unpublished course keeps its place in the ordering rather than jumping to the
 * bottom for having been edited.
 *
 * There is no readiness gate here. A course can legitimately be published with no
 * lessons - a coming-soon listing is a real thing - so any check would be a
 * guess, and a guess that blocks a legitimate publish is worse than none.
 */
export async function setCourseStatus(courseId: string, status: CourseStatus): Promise<void> {
  const payload: Database['public']['Tables']['courses']['Update'] = { status }
  if (status === 'published') payload.published_at = new Date().toISOString()

  const { error } = await supabase.from('courses').update(payload).eq('id', courseId)
  if (error) throw fail(error, 'Could not change this course status.')
}

/**
 * Put an instructor on a course.
 *
 * `course_instructors` has a composite primary key, so a second assignment for
 * the same pair is refused by the database with the duplicate-key text rather than
 * quietly creating a duplicate row.
 */
export async function assignInstructor(courseId: string, instructorId: string): Promise<void> {
  const { error } = await supabase
    .from('course_instructors')
    .insert({ course_id: courseId, instructor_id: instructorId })

  if (error) throw fail(error, 'Could not assign this instructor.')
}

export async function removeInstructor(courseId: string, instructorId: string): Promise<void> {
  const { error } = await supabase
    .from('course_instructors')
    .delete()
    .eq('course_id', courseId)
    .eq('instructor_id', instructorId)

  if (error) throw fail(error, 'Could not remove this instructor.')
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/**
 * Categories with the number of courses pointing at each one.
 *
 * The count is the whole catalogue, not just published courses: an administrator
 * deciding whether to delete a category needs to know a draft also uses it,
 * because the foreign key does not care whether a course shipped.
 */
export async function listAdminCategories(): Promise<AdminCategory[]> {
  const [{ data: categoryRows, error: categoryError }, { data: courseRows, error: courseError }] =
    await Promise.all([
      supabase
        .from('course_categories')
        .select(CATEGORY_COLUMNS)
        .order('name', { ascending: true }),
      supabase.from('courses').select('id, category_id'),
    ])

  if (categoryError) throw fail(categoryError, 'Could not load categories.')
  if (courseError) throw fail(courseError, 'Could not load courses.')

  const counts = new Map<string, number>()
  for (const row of (courseRows ?? []) as Array<{ id: string; category_id: string | null }>) {
    if (!row.category_id) continue
    counts.set(row.category_id, (counts.get(row.category_id) ?? 0) + 1)
  }

  return ((categoryRows ?? []) as CourseCategoryRow[]).map((row) => ({
    ...toCategory(row),
    courseCount: counts.get(row.id) ?? 0,
  }))
}

export async function createCategory(input: AdminCategoryInput): Promise<AdminCategory> {
  const { data, error } = await supabase
    .from('course_categories')
    .insert({
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      icon: input.icon ?? null,
    })
    .select(CATEGORY_COLUMNS)
    .single()

  if (error) throw fail(error, 'Could not create this category.')
  return toCategory(data as CourseCategoryRow)
}

export async function updateCategory(
  categoryId: string,
  input: AdminCategoryInput,
): Promise<AdminCategory> {
  const { data, error } = await supabase
    .from('course_categories')
    .update({
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      icon: input.icon ?? null,
    })
    .eq('id', categoryId)
    .select(CATEGORY_COLUMNS)
    .single()

  if (error) throw fail(error, 'Could not save this category.')
  return toCategory(data as CourseCategoryRow)
}

/**
 * Delete a category.
 *
 * Only possible when nothing points at it. `courses.category_id` is a foreign key
 * with no `ON DELETE` action, so an in-use category raises the constraint text,
 * and that text is the useful answer: it names the relationship that blocked it.
 * Quietly nulling the reference instead would reorganise the catalogue behind the
 * administrator's back.
 */
export async function deleteCategory(categoryId: string): Promise<void> {
  const { error } = await supabase.from('course_categories').delete().eq('id', categoryId)
  if (error) throw fail(error, 'Could not delete this category.')
}

// ---------------------------------------------------------------------------
// Payments (read-only)
// ---------------------------------------------------------------------------

/**
 * Every payment an administrator can see, newest first.
 *
 * At most `PAYMENT_LIMIT` rows. Callers report the limit when it is hit, because
 * a ledger that looks complete and is not is the failure mode that matters on a
 * money screen.
 */
export async function listAdminPayments(): Promise<{
  payments: AdminPayment[]
  truncated: boolean
}> {
  const [
    { data: paymentRows, error: paymentError },
    { data: nameRows, error: nameError },
    { data: courseRows, error: courseError },
  ] = await Promise.all([
    supabase
      .from('payments')
      .select(PAYMENT_COLUMNS)
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(PAYMENT_LIMIT + 1),
    supabase.from('profiles').select(NAME_COLUMNS),
    supabase.from('courses').select('id, title'),
  ])

  if (paymentError) throw fail(paymentError, 'Could not load payments.')
  if (nameError) throw fail(nameError, 'Could not load people.')
  if (courseError) throw fail(courseError, 'Could not load courses.')

  const namesById = new Map<string, string>()
  for (const row of (nameRows ?? []) as Array<{ id: string; full_name: string }>) {
    namesById.set(row.id, row.full_name)
  }

  const titlesById = new Map<string, string>()
  for (const row of (courseRows ?? []) as Array<{ id: string; title: string }>) {
    titlesById.set(row.id, row.title)
  }

  const rows = (paymentRows ?? []) as PaymentRow[]

  const payments = rows.slice(0, PAYMENT_LIMIT).map((row) => {
    const payment = toPayment(row)
    return {
      ...payment,
      studentName: namesById.get(payment.studentId) ?? 'Unknown account',
      courseTitle: titlesById.get(payment.courseId) ?? 'Unknown course',
    }
  })

  return { payments, truncated: rows.length > PAYMENT_LIMIT }
}

/**
 * Recent webhook deliveries, newest first.
 *
 * Read-only by construction: `payment_events` grants admins SELECT and nobody
 * INSERT, so there is no browser path that could fabricate a receipt.
 */
export async function listAdminPaymentEvents(): Promise<{
  events: AdminPaymentEvent[]
  truncated: boolean
}> {
  const { data, error } = await untypedTables
    .from('payment_events')
    .select(PAYMENT_EVENT_COLUMNS)
    .order('received_at', { ascending: false })
    .limit(PAYMENT_EVENT_LIMIT + 1)

  if (error) throw fail(error, 'Could not load payment events.')

  const rows = (data ?? []) as unknown[]
  return {
    events: rows.slice(0, PAYMENT_EVENT_LIMIT).map(toPaymentEvent),
    truncated: rows.length > PAYMENT_EVENT_LIMIT,
  }
}

// ---------------------------------------------------------------------------
// Analytics and the settings facts
// ---------------------------------------------------------------------------

/** The whole revenue picture, summed from rows because Postgres has no money type. */
function emptyMoney() {
  return {
    paidCentavos: 0,
    refundedCentavos: 0,
    pendingCentavos: 0,
    failedCentavos: 0,
    cancelledCentavos: 0,
    paidCount: 0,
    refundedCount: 0,
  }
}

function tallyMoney(
  payments: Array<{ amount_centavos: number; status: AdminPaymentStatus }>,
): ReturnType<typeof emptyMoney> {
  const money = emptyMoney()

  for (const payment of payments) {
    switch (payment.status) {
      case 'paid':
        money.paidCentavos += payment.amount_centavos
        money.paidCount += 1
        break
      case 'refunded':
        money.refundedCentavos += payment.amount_centavos
        money.refundedCount += 1
        break
      case 'pending':
        money.pendingCentavos += payment.amount_centavos
        break
      case 'failed':
        money.failedCentavos += payment.amount_centavos
        break
      case 'cancelled':
        money.cancelledCentavos += payment.amount_centavos
        break
    }
  }

  return money
}

/**
 * Platform-wide counts, aggregations and two monthly series.
 *
 * The series are built from rows and the totals from `head: true` counts, so the
 * payload stays proportional to what is plotted rather than to how many people
 * are registered.
 */
export async function getPlatformAnalytics(): Promise<PlatformAnalytics> {
  const [
    adminCount,
    instructorCount,
    studentCount,
    activeUsers,
    invitedUsers,
    suspendedUsers,
    publishedCourses,
    draftCourses,
    archivedCourses,
    quizCount,
    { data: paymentRows, error: paymentError },
    { data: enrollmentRows, error: enrollError },
    { data: attemptRows, error: attemptError },
  ] = await Promise.all([
    readCount(
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin'),
      'Could not count administrators.',
    ),
    readCount(
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'instructor'),
      'Could not count instructors.',
    ),
    readCount(
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'),
      'Could not count students.',
    ),
    readCount(
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      'Could not count active accounts.',
    ),
    readCount(
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'invited'),
      'Could not count invited accounts.',
    ),
    readCount(
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'suspended'),
      'Could not count suspended accounts.',
    ),
    readCount(
      supabase
        .from('courses')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'published'),
      'Could not count published courses.',
    ),
    readCount(
      supabase.from('courses').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
      'Could not count draft courses.',
    ),
    readCount(
      supabase
        .from('courses')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'archived'),
      'Could not count archived courses.',
    ),
    readCount(
      supabase.from('quizzes').select('id', { count: 'exact', head: true }),
      'Could not count quizzes.',
    ),
    supabase.from('payments').select('amount_centavos, status, created_at, paid_at'),
    supabase.from('enrollments').select('id, status, enrolled_at'),
    supabase.from('quiz_attempts').select(ATTEMPT_COLUMNS),
  ])

  if (paymentError) throw fail(paymentError, 'Could not read payment history.')
  if (enrollError) throw fail(enrollError, 'Could not read enrolments.')
  if (attemptError) throw fail(attemptError, 'Could not read quiz attempts.')

  const payments = (paymentRows ?? []) as Array<{
    amount_centavos: number
    status: AdminPaymentStatus
    created_at: string
    paid_at: string | null
  }>

  const revenueByMonth = monthWindow(MONTH_WINDOW)
  const revenueIndex = new Map(revenueByMonth.map((bucket) => [bucket.key, bucket]))
  const paymentsByStatus = new Map<AdminPaymentStatus, number>()

  for (const payment of payments) {
    paymentsByStatus.set(payment.status, (paymentsByStatus.get(payment.status) ?? 0) + 1)

    // Revenue belongs to the month the money arrived, which is `paid_at` and not
    // the day the row was created: a payment started on the 30th and settled on
    // the 2nd is this month's income.
    const bucket = revenueIndex.get(monthKeyOf(payment.paid_at ?? payment.created_at))
    if (bucket && payment.status === 'paid') bucket.centavos += payment.amount_centavos
  }

  const enrollments = (enrollmentRows ?? []) as Array<{
    id: string
    status: EnrollmentStatus
    enrolled_at: string
  }>

  const enrollmentsByStatusMap = new Map<EnrollmentStatus, number>()
  const enrollmentsByMonth = monthWindow(MONTH_WINDOW)
  const enrollmentIndex = new Map(enrollmentsByMonth.map((bucket) => [bucket.key, bucket]))

  for (const enrollment of enrollments) {
    enrollmentsByStatusMap.set(
      enrollment.status,
      (enrollmentsByStatusMap.get(enrollment.status) ?? 0) + 1,
    )
    const bucket = enrollmentIndex.get(monthKeyOf(enrollment.enrolled_at))
    if (bucket) bucket.count += 1
  }

  const attempts = (attemptRows ?? []) as QuizAttemptRow[]
  let submittedAttempts = 0
  let attemptsInProgress = 0
  let percentageSum = 0
  let percentageCount = 0
  let passedCount = 0
  let gradedCount = 0

  for (const attempt of attempts) {
    if (attempt.status === 'submitted') submittedAttempts += 1
    else attemptsInProgress += 1

    if (attempt.percentage !== null) {
      percentageSum += Number(attempt.percentage)
      percentageCount += 1
    }
    if (attempt.passed !== null) {
      gradedCount += 1
      if (attempt.passed) passedCount += 1
    }
  }

  const active = enrollmentsByStatusMap.get('active') ?? 0
  const completed = enrollmentsByStatusMap.get('completed') ?? 0
  const decided = active + completed

  return {
    usersByRole: [
      { key: 'student', label: ROLE_LABELS.student, count: studentCount },
      { key: 'instructor', label: ROLE_LABELS.instructor, count: instructorCount },
      { key: 'admin', label: ROLE_LABELS.admin, count: adminCount },
    ],
    userStatus: [
      { key: 'active', label: ACCOUNT_STATUS_LABELS.active, count: activeUsers },
      { key: 'invited', label: ACCOUNT_STATUS_LABELS.invited, count: invitedUsers },
      { key: 'suspended', label: ACCOUNT_STATUS_LABELS.suspended, count: suspendedUsers },
    ],
    coursesByStatus: [
      { key: 'published', label: COURSE_STATUS_LABELS.published, count: publishedCourses },
      { key: 'draft', label: COURSE_STATUS_LABELS.draft, count: draftCourses },
      { key: 'archived', label: COURSE_STATUS_LABELS.archived, count: archivedCourses },
    ],
    enrollmentsByStatus: countBy(
      ENROLLMENT_STATUSES,
      ENROLLMENT_STATUS_LABELS,
      (status) => enrollmentsByStatusMap.get(status) ?? 0,
    ),
    paymentsByStatus: countBy(
      PAYMENT_STATUSES,
      PAYMENT_STATUS_LABELS,
      (status) => paymentsByStatus.get(status) ?? 0,
    ),
    revenue: tallyMoney(payments),
    enrollment: {
      total: enrollments.length,
      active,
      completed,
      dropped: enrollmentsByStatusMap.get('dropped') ?? 0,
      pending: enrollmentsByStatusMap.get('pending') ?? 0,
      completionRate: decided === 0 ? 0 : Math.round((completed / decided) * 100),
    },
    quizzes: {
      quizCount,
      submittedAttempts,
      attemptsInProgress,
      averagePercentage: percentageCount === 0 ? null : Math.round(percentageSum / percentageCount),
      passRate: gradedCount === 0 ? null : Math.round((passedCount / gradedCount) * 100),
    },
    revenueByMonth,
    enrollmentsByMonth,
  }
}

/**
 * The counts the settings screen reports.
 *
 * Nothing here is stored. Every field is derived from a live count or a live sum
 * at the moment the page loads, which is the only honest way to present platform
 * configuration when there is no settings table to configure.
 */
export async function getPlatformOverview(): Promise<PlatformOverview> {
  const [
    adminCount,
    instructorCount,
    studentCount,
    activeUsers,
    invitedUsers,
    suspendedUsers,
    totalCourses,
    publishedCourses,
    draftCourses,
    archivedCourses,
    paidCourses,
    categoryCount,
    moduleCount,
    lessonCount,
    quizCount,
    totalEnrollments,
    activeEnrollments,
    completedEnrollments,
    { data: paymentRows, error: paymentError },
  ] = await Promise.all([
    readCount(
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin'),
      'Could not count administrators.',
    ),
    readCount(
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'instructor'),
      'Could not count instructors.',
    ),
    readCount(
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'),
      'Could not count students.',
    ),
    readCount(
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      'Could not count active accounts.',
    ),
    readCount(
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'invited'),
      'Could not count invited accounts.',
    ),
    readCount(
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'suspended'),
      'Could not count suspended accounts.',
    ),
    readCount(
      supabase.from('courses').select('id', { count: 'exact', head: true }),
      'Could not count courses.',
    ),
    readCount(
      supabase
        .from('courses')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'published'),
      'Could not count published courses.',
    ),
    readCount(
      supabase.from('courses').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
      'Could not count draft courses.',
    ),
    readCount(
      supabase
        .from('courses')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'archived'),
      'Could not count archived courses.',
    ),
    readCount(
      supabase.from('courses').select('id', { count: 'exact', head: true }).gt('price_centavos', 0),
      'Could not count paid courses.',
    ),
    readCount(
      supabase.from('course_categories').select('id', { count: 'exact', head: true }),
      'Could not count categories.',
    ),
    readCount(
      supabase.from('modules').select('id', { count: 'exact', head: true }),
      'Could not count modules.',
    ),
    readCount(
      supabase.from('lessons').select('id', { count: 'exact', head: true }),
      'Could not count lessons.',
    ),
    readCount(
      supabase.from('quizzes').select('id', { count: 'exact', head: true }),
      'Could not count quizzes.',
    ),
    readCount(
      supabase.from('enrollments').select('id', { count: 'exact', head: true }),
      'Could not count enrolments.',
    ),
    readCount(
      supabase
        .from('enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active'),
      'Could not count active enrolments.',
    ),
    readCount(
      supabase
        .from('enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed'),
      'Could not count completed enrolments.',
    ),
    supabase.from('payments').select('amount_centavos, status'),
  ])

  if (paymentError) throw fail(paymentError, 'Could not read payment history.')

  const certificateCount = await readUntypedCount('certificates', 'Could not count certificates.')

  return {
    users: {
      total: adminCount + instructorCount + studentCount,
      byRole: [
        { key: 'student', label: ROLE_LABELS.student, count: studentCount },
        { key: 'instructor', label: ROLE_LABELS.instructor, count: instructorCount },
        { key: 'admin', label: ROLE_LABELS.admin, count: adminCount },
      ],
      byStatus: [
        { key: 'active', label: ACCOUNT_STATUS_LABELS.active, count: activeUsers },
        { key: 'invited', label: ACCOUNT_STATUS_LABELS.invited, count: invitedUsers },
        { key: 'suspended', label: ACCOUNT_STATUS_LABELS.suspended, count: suspendedUsers },
      ],
    },
    catalogue: {
      courses: totalCourses,
      publishedCourses,
      draftCourses,
      archivedCourses,
      paidCourses,
      freeCourses: totalCourses - paidCourses,
      categories: categoryCount,
      modules: moduleCount,
      lessons: lessonCount,
      quizzes: quizCount,
    },
    learning: {
      enrollments: totalEnrollments,
      activeEnrollments,
      completedEnrollments,
      certificates: certificateCount,
    },
    money: tallyMoney(
      (paymentRows ?? []) as Array<{ amount_centavos: number; status: AdminPaymentStatus }>,
    ),
  }
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

/**
 * Write one row to `activity_logs`.
 *
 * Returns the database's message on failure instead of throwing. The action being
 * logged has already happened by the time this runs, so throwing would report a
 * successful change as a failed one, which is a worse lie than a missing audit
 * row the caller has been told about. Returning the reason lets the view show a
 * warning beside the control that did succeed.
 *
 * `activity_logs` grants nobody INSERT, so this SECURITY DEFINER RPC is the only
 * door. It writes `auth.uid()` as the actor, so an entry cannot be attributed to
 * somebody else.
 */
export async function logAdminAction(
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown> = {},
): Promise<string | null> {
  const { error } = await callRpc('record_activity', {
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_metadata: metadata,
  })

  return error ? messageOf(error, 'Could not write to the activity log.') : null
}
