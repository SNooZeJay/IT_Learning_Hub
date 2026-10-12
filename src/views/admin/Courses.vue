<template>
  <div>
    <PageHeader
      title="All courses"
      subtitle="Everything in the catalogue, including drafts and archived courses that no student can see."
      :crumbs="[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Courses' }]"
    >
      <template #actions>
        <button type="button" :class="quietButtonClass" :disabled="isLoading" @click="load">
          <RotateCcw class="size-4" :class="{ 'animate-spin': isLoading }" aria-hidden="true" />
          Refresh
        </button>
      </template>
    </PageHeader>

    <LoadingState v-if="isLoading" label="Loading courses" />

    <ErrorState
      v-else-if="errorMessage"
      title="Could not load the course list"
      :message="errorMessage"
      @retry="load"
    />

    <template v-else>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Courses"
          :value="String(courses.length)"
          :icon="Library"
          :hint="`${categoryCount} categor${categoryCount === 1 ? 'y' : 'ies'}`"
        />
        <StatCard
          label="Published"
          :value="String(statusCount('published'))"
          :icon="CircleCheck"
          :hint="`${statusCount('draft')} draft, ${statusCount('archived')} archived`"
        />
        <StatCard
          label="Enrollments"
          :value="String(totalEnrolments)"
          :icon="BookOpen"
          :hint="`${activeEnrolments} active, ${completedEnrolments} completed`"
        />
        <StatCard
          label="Unassigned"
          :value="String(unassignedCourses)"
          :icon="UserX"
          :hint="`${unassignedCourses === 0 ? 'every' : 'these'} course has an instructor`"
        />
      </div>

      <Alert
        v-if="auditWarning"
        variant="warning"
        title="The change was saved, but the activity log was not"
        :message="auditWarning"
        class="mt-6"
      />

      <div class="mt-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div class="relative w-full lg:max-w-xs">
          <Search
            class="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted"
            aria-hidden="true"
          />
          <label for="course-search" class="sr-only">Search course titles</label>
          <Input
            v-model.trim="search"
            type="search"
            aria-label="Search course title"
            placeholder="Search course title"
            class="ps-9"
          />
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <Label for="status-filter" class="mb-1 block text-xs font-medium text-slate">
              Status
            </Label>
            <Select v-model="statusFilter">
              <SelectTrigger id="status-filter" class="w-full">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem v-for="status in COURSE_STATUSES" :key="status" :value="status">
                  {{ COURSE_STATUS_LABELS[status] }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label for="category-filter" class="mb-1 block text-xs font-medium text-slate">
              Category
            </Label>
            <Select v-model="categoryFilter">
              <SelectTrigger id="category-filter" class="w-full">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem v-for="category in categories" :key="category.id" :value="category.id">
                  {{ category.name }} ({{ category.courseCount }})
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <p class="mt-3 text-sm text-slate lg:text-end">
        {{ filtered.length }} of {{ courses.length }}
      </p>

      <EmptyState
        v-if="courses.length === 0"
        class="mt-6"
        title="No courses yet"
        description="Courses are created by instructors from their own screen. Nothing has been drafted here yet."
        :icon="Library"
      />

      <EmptyState
        v-else-if="filtered.length === 0"
        class="mt-6"
        title="No courses match those filters"
        description="Try a different search word, or set the status and category filters back to all."
        :icon="Search"
      />

      <div v-else class="mt-4 surface-card-shell">
        <div class="overflow-x-auto custom-scrollbar">
          <Table class="min-w-full text-start text-sm">
            <TableCaption class="sr-only">
              Every course with its publication status and instructor assignments
            </TableCaption>
            <TableHeader>
              <TableRow
                class="bg-surface text-xs tracking-wide text-slate uppercase hover:bg-surface"
              >
                <TableHead scope="col" class="px-5 py-3 text-start font-medium">Course</TableHead>
                <TableHead scope="col" class="px-5 py-3 text-start font-medium">Status</TableHead>
                <TableHead scope="col" class="px-5 py-3 text-end font-medium">Price</TableHead>
                <TableHead scope="col" class="px-5 py-3 text-end font-medium"
                  >Enrollments</TableHead
                >
                <TableHead scope="col" class="px-5 py-3 text-start font-medium"
                  >Instructors</TableHead
                >
              </TableRow>
            </TableHeader>
            <TableBody class="divide-y divide-hairline">
              <template v-for="course in filtered" :key="course.id">
                <TableRow class="align-top transition-colors hover:bg-surface-soft">
                  <TableCell class="px-5 py-4">
                    <p class="font-medium text-ink">{{ course.title }}</p>
                    <p class="text-slate">
                      {{ course.categoryName ?? 'Uncategorised' }} ·
                      {{ LEVEL_LABELS[course.level] }}
                    </p>
                    <p class="mt-1 text-slate">
                      Created by {{ course.createdByName }} · {{ formatDate(course.createdAt) }}
                    </p>
                    <p v-if="course.publishedAt" class="mt-1 text-slate">
                      Published {{ formatDate(course.publishedAt) }}
                    </p>
                  </TableCell>

                  <TableCell class="px-5 py-4">
                    <Badge :class="COURSE_TONE[course.status]">
                      {{ COURSE_STATUS_LABELS[course.status] }}
                    </Badge>

                    <div class="mt-2 flex flex-wrap gap-1.5">
                      <button
                        v-if="course.status === 'published'"
                        type="button"
                        :disabled="busyId !== null"
                        :class="rowActionClass"
                        @click="onStatusChange(course, 'draft')"
                      >
                        <LoaderCircle
                          v-if="busyId === `${course.id}:draft`"
                          class="size-3.5 animate-spin"
                          aria-hidden="true"
                        />
                        <EyeOff v-else class="size-3.5" aria-hidden="true" />
                        Unpublish
                      </button>

                      <button
                        v-else
                        type="button"
                        :disabled="busyId !== null"
                        :class="[
                          rowActionClass,
                          'hover:border-brand-500 hover:text-brand-700 dark:hover:text-brand-400',
                        ]"
                        @click="onStatusChange(course, 'published')"
                      >
                        <LoaderCircle
                          v-if="busyId === `${course.id}:published`"
                          class="size-3.5 animate-spin"
                          aria-hidden="true"
                        />
                        <CircleCheck v-else class="size-3.5" aria-hidden="true" />
                        Publish
                      </button>

                      <button
                        v-if="course.status !== 'archived'"
                        type="button"
                        :disabled="busyId !== null"
                        :class="rowActionClass"
                        @click="onStatusChange(course, 'archived')"
                      >
                        <LoaderCircle
                          v-if="busyId === `${course.id}:archived`"
                          class="size-3.5 animate-spin"
                          aria-hidden="true"
                        />
                        <Archive v-else class="size-3.5" aria-hidden="true" />
                        Archive
                      </button>

                      <button
                        v-else
                        type="button"
                        :disabled="busyId !== null"
                        :class="rowActionClass"
                        @click="onStatusChange(course, 'draft')"
                      >
                        <RotateCcw class="size-3.5" aria-hidden="true" />
                        Restore to draft
                      </button>
                    </div>
                  </TableCell>

                  <TableCell class="px-5 py-4 text-end tabular-nums text-ink">
                    {{ course.priceCentavos > 0 ? formatPeso(course.priceCentavos) : 'Free' }}
                    <p v-if="course.passingScore" class="text-xs text-slate">
                      {{ course.passingScore }}% to pass
                    </p>
                  </TableCell>

                  <TableCell class="px-5 py-4 text-end tabular-nums text-ink">
                    {{ course.enrolmentCount }}
                    <p class="text-xs text-slate">
                      {{ course.activeEnrolmentCount }} active ·
                      {{ course.completedEnrolmentCount }} done
                    </p>
                  </TableCell>

                  <TableCell class="px-5 py-4">
                    <ul v-if="course.instructors.length" class="flex flex-wrap gap-1.5">
                      <li v-for="instructor in course.instructors" :key="instructor.id">
                        <span
                          class="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong bg-canvas py-1 ps-2.5 pe-1 text-xs text-ink"
                        >
                          {{ instructor.fullName }}
                          <button
                            type="button"
                            :disabled="busyId !== null"
                            :aria-label="`Remove ${instructor.fullName} from ${course.title}`"
                            class="inline-flex min-h-6 min-w-6 items-center justify-center rounded-md p-1 text-slate transition hover:bg-surface hover:text-error-600 dark:hover:text-error-400"
                            @click="onUnassign(course, instructor.id)"
                          >
                            <LoaderCircle
                              v-if="busyId === `${course.id}:${instructor.id}`"
                              class="size-3.5 animate-spin"
                              aria-hidden="true"
                            />
                            <X v-else class="size-3.5" aria-hidden="true" />
                          </button>
                        </span>
                      </li>
                    </ul>

                    <p v-else class="text-sm text-slate">
                      Nobody. Only an assigned instructor can edit this course.
                    </p>

                    <p v-if="assignableInstructors(course).length" class="mt-2">
                      <Select
                        :model-value="undefined"
                        :disabled="busyId !== null"
                        @update:model-value="(id) => onAssign(course, id as string)"
                      >
                        <SelectTrigger
                          size="sm"
                          :aria-label="`Assign an instructor to ${course.title}`"
                          class="py-1.5 text-xs"
                        >
                          <SelectValue placeholder="Assign an instructor…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem
                            v-for="instructor in assignableInstructors(course)"
                            :key="instructor.id"
                            :value="instructor.id"
                          >
                            {{ instructor.fullName }}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </p>
                    <p v-else-if="instructors.length > 0" class="mt-2 text-xs text-slate">
                      Every instructor is already on this course.
                    </p>
                    <p v-else class="mt-2 text-xs text-slate">No instructor accounts exist yet.</p>
                  </TableCell>
                </TableRow>

                <TableRow v-if="rowNotices[course.id]" class="bg-surface-soft">
                  <TableCell colspan="5" class="px-5 py-3">
                    <p
                      class="flex items-start gap-2 text-sm"
                      :class="
                        rowNoticeTone[course.id] === 'success'
                          ? 'text-success-700 dark:text-success-400'
                          : 'text-error-700 dark:text-error-400'
                      "
                    >
                      <CircleCheck
                        v-if="rowNoticeTone[course.id] === 'success'"
                        class="mt-0.5 size-4 shrink-0"
                        aria-hidden="true"
                      />
                      <CircleAlert v-else class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <span>{{ rowNotices[course.id] }}</span>
                    </p>
                  </TableCell>
                </TableRow>
              </template>
            </TableBody>
          </Table>
        </div>
      </div>

      <p class="mt-4 text-sm text-slate">
        Publishing makes a course visible to every signed-in student and stamps its publication
        date. Unpublishing hides it again without deleting anything, and the date it first shipped
        is kept so the catalogue ordering does not jump every time someone edits it.
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Archive,
  BookOpen,
  CircleAlert,
  CircleCheck,
  EyeOff,
  Library,
  LoaderCircle,
  RotateCcw,
  Search,
  UserX,
  X,
} from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import StatCard from '@/components/common/StatCard.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import Alert from '@/components/ui/Alert.vue'
import { TONE, quietButtonClass, rowActionClass } from '@/components/ui/controlClasses'
import { Input } from '@/components/public/ui/input'
import { Label } from '@/components/public/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/public/ui/select'
import { Badge } from '@/components/public/ui/badge'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/public/ui/table'
import {
  AdminError,
  COURSE_STATUSES,
  COURSE_STATUS_LABELS,
  assignInstructor,
  listAdminCategories,
  listAllCourses,
  listAllInstructors,
  logAdminAction,
  removeInstructor,
  setCourseStatus,
} from '@/services/admin.service'
import { LEVEL_LABELS } from '@/services/catalogue.service'
import { useConfirm } from '@/composables/useConfirm'
import { formatDate, formatPeso } from '@/types'
import type { AdminCategory, AdminCourse, AdminInstructor } from '@/services/admin.service'
import type { CourseStatus } from '@/types'

const courses = ref<AdminCourse[]>([])
const instructors = ref<AdminInstructor[]>([])
const categories = ref<AdminCategory[]>([])

const confirm = useConfirm()

/**
 * Seeded from `?q=`, and written back as it changes.
 *
 * The header's search box navigates here with the term in the query. It arrived
 * correctly and this page ignored the parameter, so the box appeared to do nothing.
 *
 * Written back with `router.replace` rather than `push`, so typing does not push a
 * history entry per keystroke - Back should leave the page, not walk through every
 * letter of the word that was typed.
 */
const route = useRoute()
const router = useRouter()
const search = ref(typeof route.query.q === 'string' ? route.query.q : '')

watch(
  () => route.query.q,
  (value) => {
    const next = typeof value === 'string' ? value : ''
    if (next !== search.value) search.value = next
  },
)

watch(search, (value) => {
  const current = typeof route.query.q === 'string' ? route.query.q : ''
  if (value === current) return
  void router.replace({
    query: value ? { ...route.query, q: value } : { ...route.query, q: undefined },
  })
})

const statusFilter = ref<CourseStatus | 'all'>('all')
const categoryFilter = ref<string>('all')

const isLoading = ref(true)
const errorMessage = ref('')
/** `courseId:action`, so two controls on the same row cannot both look busy. */
const busyId = ref<string | null>(null)
const rowNotices = ref<Record<string, string>>({})
const rowNoticeTone = ref<Record<string, 'success' | 'error'>>({})
const auditWarning = ref('')

/**
 * Course status as a badge.
 *
 * The three tones are unchanged from the literals this replaced. Only the source
 * moved, so a draft is still the neutral pill and an archived course is still the
 * brand one — the same three colours on the same three words.
 */
const COURSE_TONE: Record<CourseStatus, string> = {
  published: TONE.good,
  draft: TONE.quiet,
  archived: TONE.info,
}

const filtered = computed(() => {
  const term = search.value.toLowerCase()

  return courses.value.filter((course) => {
    if (statusFilter.value !== 'all' && course.status !== statusFilter.value) return false
    if (categoryFilter.value !== 'all' && course.categoryId !== categoryFilter.value) {
      return false
    }
    if (!term) return true
    return course.title.toLowerCase().includes(term)
  })
})

const categoryCount = computed(() => categories.value.length)

const totalEnrolments = computed(() =>
  courses.value.reduce((total, course) => total + course.enrolmentCount, 0),
)

const activeEnrolments = computed(() =>
  courses.value.reduce((total, course) => total + course.activeEnrolmentCount, 0),
)

const completedEnrolments = computed(() =>
  courses.value.reduce((total, course) => total + course.completedEnrolmentCount, 0),
)

const unassignedCourses = computed(
  () => courses.value.filter((course) => course.instructors.length === 0).length,
)

function statusCount(status: CourseStatus): number {
  return courses.value.filter((course) => course.status === status).length
}

/**
 * Instructors not already on this course.
 *
 * Filtering client-side rather than relying on the composite primary key means
 * the dropdown never offers an assignment the database is going to refuse.
 */
function assignableInstructors(course: AdminCourse): AdminInstructor[] {
  const taken = new Set(course.instructors.map((instructor) => instructor.id))
  return instructors.value.filter((instructor) => !taken.has(instructor.id))
}

function notice(courseId: string, message: string, tone: 'success' | 'error'): void {
  rowNotices.value = { ...rowNotices.value, [courseId]: message }
  rowNoticeTone.value = { ...rowNoticeTone.value, [courseId]: tone }
}

function clearNotice(courseId: string): void {
  const notices = { ...rowNotices.value }
  const tones = { ...rowNoticeTone.value }
  delete notices[courseId]
  delete tones[courseId]
  rowNotices.value = notices
  rowNoticeTone.value = tones
}

/**
 * Re-reads after a change without unmounting the table, so the confirmation the
 * row is about to show survives the reload.
 */
async function refresh(): Promise<void> {
  try {
    const [allCourses, allInstructors, allCategories] = await Promise.all([
      listAllCourses(),
      listAllInstructors(),
      listAdminCategories(),
    ])
    courses.value = allCourses
    instructors.value = allInstructors
    categories.value = allCategories
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Could not refresh the course list.'
  }
}

async function audit(
  action: string,
  entityId: string,
  metadata: Record<string, unknown>,
  succeeded: boolean,
): Promise<void> {
  auditWarning.value =
    (await logAdminAction(
      `${action}.${succeeded ? 'succeeded' : 'refused'}`,
      'course',
      entityId,
      metadata,
    )) ?? ''
}

async function onStatusChange(course: AdminCourse, status: CourseStatus): Promise<void> {
  busyId.value = `${course.id}:${status}`
  clearNotice(course.id)

  try {
    await setCourseStatus(course.id, status)
    await audit('course.status.change', course.id, { from: course.status, to: status }, true)
    await refresh()
    notice(
      course.id,
      status === 'published'
        ? `${course.title} is now visible in the catalogue.`
        : status === 'archived'
          ? `${course.title} is archived and hidden from the catalogue.`
          : `${course.title} is a draft again and hidden from the catalogue.`,
      'success',
    )
  } catch (error) {
    const message =
      error instanceof AdminError ? error.message : 'Could not change this course status.'
    await audit('course.status.change', course.id, { from: course.status, to: status }, false)
    await refresh()
    notice(course.id, message, 'error')
  } finally {
    busyId.value = null
  }
}

async function onAssign(course: AdminCourse, instructorId: string): Promise<void> {
  // No reset needed: the select is bound to `undefined`, so it always shows
  // the placeholder and every choice fires. The native version had to clear
  // `select.value` by hand so picking the same instructor twice still fired.
  if (!instructorId) return

  const instructor = instructors.value.find((person) => person.id === instructorId)
  busyId.value = `${course.id}:${instructorId}`
  clearNotice(course.id)

  try {
    await assignInstructor(course.id, instructorId)
    await audit('course.instructor.assign', course.id, { instructorId }, true)
    await refresh()
    notice(
      course.id,
      `${instructor?.fullName ?? 'That instructor'} can now edit ${course.title}.`,
      'success',
    )
  } catch (error) {
    const message =
      error instanceof AdminError ? error.message : 'Could not assign this instructor.'
    await audit('course.instructor.assign', course.id, { instructorId }, false)
    await refresh()
    notice(course.id, message, 'error')
  } finally {
    busyId.value = null
  }
}

async function onUnassign(course: AdminCourse, instructorId: string): Promise<void> {
  const instructor = course.instructors.find((person) => person.id === instructorId)

  // One question before removing access. The X sits inside a chip barely larger
  // than itself, and a mis-tap costs the instructor their ability to work until
  // somebody re-assigns them. Reversible is not the same as harmless.
  const agreed = await confirm.ask({
    title: `Remove ${instructor?.fullName ?? 'this instructor'}?`,
    message: `${instructor?.fullName ?? 'They'} will lose edit access to ${course.title}. You can re-assign them afterwards.`,
    confirmText: 'Remove',
  })
  if (!agreed) return

  busyId.value = `${course.id}:${instructorId}`
  clearNotice(course.id)

  try {
    await removeInstructor(course.id, instructorId)
    await audit('course.instructor.unassign', course.id, { instructorId }, true)
    await refresh()
    notice(
      course.id,
      `${instructor?.fullName ?? 'That instructor'} no longer has edit access to ${course.title}.`,
      'success',
    )
  } catch (error) {
    const message =
      error instanceof AdminError ? error.message : 'Could not remove this instructor.'
    await audit('course.instructor.unassign', course.id, { instructorId }, false)
    notice(course.id, message, 'error')
  } finally {
    busyId.value = null
  }
}

async function load(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  rowNotices.value = {}
  rowNoticeTone.value = {}
  try {
    await refresh()
  } finally {
    isLoading.value = false
  }
}

onMounted(load)
</script>
