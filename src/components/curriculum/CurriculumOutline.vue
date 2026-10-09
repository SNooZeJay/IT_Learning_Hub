<script setup lang="ts">
/**
 * The Course -> Module -> Lesson outline, shared by both sides.
 *
 * One component for the student course page and the instructor course page, so
 * the two cannot drift apart. They differ in exactly what they pass in:
 *
 *   student    `editable` false, so no drafts, no edit buttons, and a progress
 *              marker per lesson when progress is attached
 *   instructor `editable` true and `includeUnpublished`, so drafts appear with a
 *              status and the inline create/edit forms are available
 *
 * Structure follows the old system deliberately: a flat, always-expanded list of
 * modules, each an `<ol>` of lessons. The old system's blade comment calls out
 * that it is not an accordion, and the reason applies here too - a learner
 * reviewing what they have covered should see the shape of the course without
 * clicking six times, and a collapsed module hides whether a lesson inside it is
 * already done.
 *
 * Upload timestamps appear as quiet metadata on each material. They are never the
 * organising principle, which is the specific thing being fixed: a course ordered
 * by when files arrived reads as a feed, not as a course.
 */
import { computed, ref } from 'vue'
import {
  BookOpen,
  Check,
  ChevronRight,
  Clock,
  FileText,
  Lock,
  PlayCircle,
  Plus,
} from 'lucide-vue-next'
import MaterialItem from './MaterialItem.vue'
import type { CurriculumModule, CurriculumSummary } from '@/types'
import { contentStatusLabel } from '@/services/curriculum.service'

const props = withDefaults(
  defineProps<{
    modules: CurriculumModule[]
    summary?: CurriculumSummary | null
    /** Number of required lessons; derived here rather than duplicated on the summary. */
    /** The instructor's view: drafts shown, edit and remove available. */
    editable?: boolean
    /** The current lesson, so the outline can mark where the learner is. */
    activeLessonId?: string | null
  }>(),
  { editable: false, activeLessonId: null, summary: null },
)

const emit = defineEmits<{
  addModule: []
  addLesson: [moduleId: string]
  addMaterial: [lessonId: string]
  editModule: [moduleId: string]
  editLesson: [lessonId: string]
  removeModule: [moduleId: string]
  removeLesson: [lessonId: string]
  editMaterial: [materialId: string]
  removeMaterial: [materialId: string]
}>()

/**
 * Which modules are open.
 *
 * A student gets everything open: the point of an outline is to be scannable at
 * a glance. An instructor gets them open too, so the shape of the course is
 * visible while editing. Collapsing is opt-in from the click, never the default.
 */
const collapsed = ref<Set<string>>(new Set())

function toggle(moduleId: string): void {
  const next = new Set(collapsed.value)
  if (next.has(moduleId)) next.delete(moduleId)
  else next.add(moduleId)
  collapsed.value = next
}

function isCollapsed(moduleId: string): boolean {
  return collapsed.value.has(moduleId)
}

/**
 * Whether this viewer has progress to show at all.
 *
 * True only for an enrolled student. An instructor sees the same outline but has
 * no enrolment, so every marker would read "0 of 1 complete" - a confident
 * statement about somebody's progress, made to somebody who has none. That is
 * what the instructor's own course page was showing.
 *
 * A prospective student is in the same position: `completionPercent` stays null
 * until they enrol, so the markers stay hidden there too.
 */
const showProgress = computed(
  () => props.summary !== null && props.summary.completionPercent !== null,
)

/** A lesson's marker. Progress is only meaningful to someone enrolled. */
function lessonState(
  lesson: CurriculumModule['lessons'][number],
): 'done' | 'active' | 'locked' | 'open' {
  if (props.editable) return 'open'
  if (lesson.progress?.status === 'completed') return 'done'
  if (props.activeLessonId === lesson.id) return 'active'
  return 'open'
}

function moduleProgress(module: CurriculumModule): { done: number; total: number } | null {
  if (!showProgress.value) return null
  const required = module.lessons.filter((l) => l.isRequired)
  if (required.length === 0) return null
  return {
    done: required.filter((l) => l.progress?.status === 'completed').length,
    total: required.length,
  }
}

const hasDrafts = computed(
  () => props.editable && props.modules.some((m) => m.status !== 'published'),
)

/**
 * How many lessons the learner is expected to complete.
 *
 * Computed here rather than carried on the summary because it is only needed to
 * phrase the "n of m" line next to the percentage, and duplicating it on the
 * summary would be a second place for the two to disagree.
 */
const requiredLessonTotal = computed(() =>
  props.modules.reduce((n, m) => n + m.lessons.filter((l) => l.isRequired).length, 0),
)

/**
 * Where a lesson title goes.
 *
 * Students have a lesson page; instructors do not. There is no
 * `/instructor/lessons/:id` route, so linking there sent every lesson title in
 * every instructor's course outline to the 404 page. Instructors edit a lesson
 * from the Edit button on the row itself, which is where the controls they need
 * already are - so the title is not a link for them at all.
 */
function linkTo(lessonId: string): string | null {
  return props.editable ? null : `/student/lessons/${lessonId}`
}

function onRemoveMaterial(materialId: string): void {
  emit('removeMaterial', materialId)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Outline header. Counts only; the progress figure is separate because a
         course with no required lessons has nothing to complete and showing 0%
         there would be a claim the data does not support. -->
    <div
      v-if="summary"
      class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4 dark:border-gray-800"
    >
      <p class="section-subheading">
        <span class="font-medium text-gray-900 dark:text-white/90">{{ summary.moduleCount }}</span>
        {{ summary.moduleCount === 1 ? 'module' : 'modules' }}
        <span aria-hidden="true">·</span>
        <span class="font-medium text-gray-900 dark:text-white/90">{{ summary.lessonCount }}</span>
        {{ summary.lessonCount === 1 ? 'lesson' : 'lessons' }}
        <template v-if="summary.materialCount > 0">
          <span aria-hidden="true">·</span>
          {{ summary.materialCount }}
          {{ summary.materialCount === 1 ? 'material' : 'materials' }}
        </template>
      </p>

      <p
        v-if="summary.completionPercent !== null"
        class="flex items-center gap-2 section-subheading"
      >
        <span class="text-xs tracking-wide text-slate uppercase">Progress</span>
        <span class="font-medium text-gray-900 dark:text-white/90"
          >{{ summary.completionPercent }}%</span
        >
        <span class="text-xs">
          ({{ summary.completedLessonCount }} of {{ requiredLessonTotal }} required)
        </span>
      </p>
    </div>

    <!-- A draft warning, stated once, rather than a badge on every draft row.
         An instructor who has left three things in draft should be able to see
         that in one glance. -->
    <p
      v-if="hasDrafts"
      class="rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400"
    >
      Some content here is still a draft. Students cannot see it until it is published.
    </p>

    <section
      v-for="module in modules"
      :key="module.id"
      class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800"
    >
      <!-- Module header. Numbered, because the position is the point: this is a
           sequence, not a set of folders. -->
      <div class="flex items-start gap-3 bg-gray-50 px-5 py-4 dark:bg-white/[0.02]">
        <button
          type="button"
          class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
          :aria-expanded="!isCollapsed(module.id)"
          :aria-label="
            (isCollapsed(module.id) ? 'Expand' : 'Collapse') + ' module ' + module.position
          "
          @click="toggle(module.id)"
        >
          {{ module.position }}
        </button>

        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 class="text-base font-semibold text-gray-900 dark:text-white/90">
              {{ module.title }}
            </h3>
            <span
              v-if="editable && module.status !== 'published'"
              class="rounded px-1.5 py-0.5 text-xs font-medium text-warning-700 dark:text-warning-400"
            >
              {{ contentStatusLabel(module.status) }}
            </span>
          </div>

          <p v-if="module.description" class="mt-1 section-subheading">
            {{ module.description }}
          </p>

          <p class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate">
            <span>
              {{ module.lessons.length }}
              {{ module.lessons.length === 1 ? 'lesson' : 'lessons' }}
            </span>
            <span
              v-if="moduleProgress(module)"
              class="font-medium text-gray-600 dark:text-gray-300"
            >
              {{ moduleProgress(module)?.done }} of {{ moduleProgress(module)?.total }} complete
            </span>
          </p>
        </div>

        <div v-if="editable" class="flex shrink-0 flex-wrap items-center gap-1">
          <button
            type="button"
            class="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-white/[0.06]"
            @click="emit('editModule', module.id)"
          >
            Edit
          </button>
          <button
            type="button"
            class="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-white/[0.06]"
            @click="emit('addLesson', module.id)"
          >
            + Lesson
          </button>
          <button
            type="button"
            class="rounded px-2 py-1 text-xs font-medium text-slate hover:bg-white hover:text-error-600 dark:hover:bg-white/[0.06] dark:hover:text-error-400"
            @click="emit('removeModule', module.id)"
          >
            Remove
          </button>
        </div>
      </div>

      <ol
        v-show="!isCollapsed(module.id)"
        role="list"
        class="divide-y divide-gray-200 dark:divide-gray-800"
      >
        <li v-if="module.lessons.length === 0" class="px-5 py-5">
          <p class="section-subheading">
            <template v-if="editable">No lessons in this module yet.</template>
            <template v-else>No published lessons in this module yet.</template>
          </p>
        </li>

        <li v-for="lesson in module.lessons" :key="lesson.id" class="px-5 py-4">
          <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
            <!-- Position and marker. The number is the lesson's place in the
                 module, matching the old system's "Lesson {{ position }}". -->
            <span
              class="mt-0.5 flex size-6 shrink-0 items-center justify-center text-xs font-medium text-slate"
            >
              <Check
                v-if="lessonState(lesson) === 'done'"
                class="size-4 text-success-600 dark:text-success-500"
              />
              <Lock v-else-if="lessonState(lesson) === 'locked'" class="size-3.5" />
              <template v-else>{{ lesson.position }}</template>
            </span>

            <div class="min-w-0 flex-1">
              <router-link
                v-if="linkTo(lesson.id)"
                :to="linkTo(lesson.id)!"
                class="font-medium text-gray-900 hover:text-brand-600 hover:underline dark:text-white/90 dark:hover:text-brand-400"
                :class="activeLessonId === lesson.id ? 'text-brand-600 dark:text-brand-400' : ''"
              >
                {{ lesson.title }}
              </router-link>
              <span
                v-else
                class="font-medium text-gray-900 dark:text-white/90"
                title="Use Edit to change this lesson"
              >
                {{ lesson.title }}
              </span>

              <span
                v-if="editable && lesson.status !== 'published'"
                class="ms-2 rounded px-1.5 py-0.5 text-xs font-medium text-warning-700 dark:text-warning-400"
              >
                {{ contentStatusLabel(lesson.status) }}
              </span>

              <!-- The summary is what makes an outline scannable. The old
                   system had this column for exactly that reason. -->
              <p v-if="lesson.summary" class="mt-1 text-sm leading-6 text-slate">
                {{ lesson.summary }}
              </p>

              <p class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate">
                <span class="inline-flex items-center gap-1">
                  <PlayCircle
                    v-if="lesson.lessonType === 'video'"
                    class="size-3.5"
                    aria-hidden="true"
                  />
                  <FileText v-else class="size-3.5" aria-hidden="true" />
                  {{ lesson.lessonType === 'video' ? 'Video' : 'Reading' }}
                </span>
                <span v-if="lesson.durationMinutes" class="inline-flex items-center gap-1">
                  <Clock class="size-3.5" aria-hidden="true" />
                  {{ lesson.durationMinutes }} min
                </span>
                <span v-if="!lesson.isRequired">Optional</span>
                <span
                  v-if="lesson.progress?.status === 'completed'"
                  class="font-medium text-success-600 dark:text-success-500"
                >
                  Completed
                </span>
                <span
                  v-else-if="lesson.progress?.status === 'in_progress'"
                  class="font-medium text-gray-500 dark:text-gray-400"
                >
                  In progress
                </span>
                <span v-if="lesson.materials.length > 0">
                  {{ lesson.materials.length }}
                  {{ lesson.materials.length === 1 ? 'material' : 'materials' }}
                </span>
              </p>

              <!-- Materials sit under the lesson they belong to. This is the
                   nesting the brief asks for: a material is never a top-level
                   item that has to be matched back to its lesson by eye. -->
              <ul v-if="lesson.materials.length > 0" role="list" class="mt-3 flex flex-col gap-2">
                <MaterialItem
                  v-for="material in lesson.materials"
                  :key="material.id"
                  :material="material"
                  :editable="editable"
                  @edit="emit('editMaterial', $event)"
                  @remove="onRemoveMaterial"
                />
              </ul>
            </div>

            <div v-if="editable" class="flex shrink-0 items-center gap-1">
              <button
                type="button"
                class="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                @click="emit('addMaterial', lesson.id)"
              >
                + Material
              </button>
              <button
                type="button"
                class="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                @click="emit('editLesson', lesson.id)"
              >
                Edit
              </button>
              <button
                type="button"
                class="rounded px-2 py-1 text-xs font-medium text-slate hover:bg-gray-50 hover:text-error-600 dark:hover:bg-white/[0.06] dark:hover:text-error-400"
                @click="emit('removeLesson', lesson.id)"
              >
                Remove
              </button>
            </div>
          </div>
        </li>
      </ol>

      <div v-if="editable" class="border-t border-gray-200 px-5 py-3 dark:border-gray-800">
        <button
          type="button"
          class="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
          @click="emit('addLesson', module.id)"
        >
          <Plus class="size-4" aria-hidden="true" />
          Add a lesson to this module
        </button>
      </div>
    </section>

    <div
      v-if="modules.length === 0"
      class="rounded-lg border border-dashed border-gray-300 px-5 py-10 text-center dark:border-gray-700"
    >
      <BookOpen class="mx-auto size-8 text-gray-300 dark:text-gray-600" aria-hidden="true" />
      <p class="mt-3 text-sm font-medium text-gray-900 dark:text-white/90">
        {{ editable ? 'No modules yet' : 'No modules published yet' }}
      </p>
      <p class="mx-auto mt-1 max-w-md section-subheading">
        <template v-if="editable">
          A module is a section of the course. Add one, then fill it with lessons.
        </template>
        <template v-else>
          The instructor has not published any modules for this course yet. Your enrollment is kept,
          and the content appears here as soon as it is ready.
        </template>
      </p>
      <button
        v-if="editable"
        type="button"
        class="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
        @click="emit('addModule')"
      >
        <Plus class="size-4" aria-hidden="true" />
        Add the first module
      </button>
    </div>

    <button
      v-if="editable && modules.length > 0"
      type="button"
      class="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 py-3 text-sm font-medium text-gray-600 hover:border-brand-400 hover:text-brand-600 dark:border-gray-700 dark:text-gray-300 dark:hover:border-brand-500"
      @click="emit('addModule')"
    >
      <Plus class="size-4" aria-hidden="true" />
      Add a module
      <ChevronRight class="size-4" aria-hidden="true" />
    </button>
  </div>
</template>
