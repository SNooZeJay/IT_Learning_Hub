<script setup lang="ts">
/**
 * One learning material, rendered according to its type.
 *
 * The old system rendered a material as a card with a title, a type badge, and
 * then whichever of three bodies existed: a `<pre>` for inline content, a full
 * link for a URL, or a download button for a file. That structure is kept, and the
 * branch is driven by `materialType` rather than by "is this field null", so a
 * missing body is a data problem that shows up as an empty region rather than
 * silently rendering the wrong kind of thing.
 *
 * Upload time is shown as metadata on the quiet line, never as the thing that
 * organises the list. Organising by upload time is what turns a course into a
 * feed; the outline above already provides the structure.
 */
import { computed } from 'vue'
import {
  BookOpen,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  Play,
} from 'lucide-vue-next'
import type { LessonMaterial } from '@/types'
import { formatDate } from '@/types'
import { formatFileSize, materialTypeLabel } from '@/services/curriculum.service'

const props = defineProps<{
  material: LessonMaterial
  /** Instructors see remove/edit affordances and the type as a control. */
  editable?: boolean
}>()

const emit = defineEmits<{
  edit: [materialId: string]
  remove: [materialId: string]
}>()

const icon = computed(() => {
  switch (props.material.materialType) {
    case 'image':
      return ImageIcon
    case 'pdf':
    case 'document':
      return FileText
    case 'code':
      return BookOpen
    case 'video_link':
      return Play
    case 'external_link':
      return LinkIcon
    default:
      return BookOpen
  }
})

const isLink = computed(
  () =>
    props.material.materialType === 'video_link' || props.material.materialType === 'external_link',
)

const isFile = computed(
  () =>
    props.material.materialType === 'image' ||
    props.material.materialType === 'pdf' ||
    props.material.materialType === 'document',
)

const fileName = computed(() => {
  const path = props.material.filePath
  if (!path) return props.material.title
  return path.split('/').pop() ?? props.material.title
})
</script>

<template>
  <li
    class="group flex gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3.5 dark:border-gray-800 dark:bg-white/[0.03]"
  >
    <span
      class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400"
    >
      <component :is="icon" class="size-4" aria-hidden="true" />
    </span>

    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p class="font-medium text-gray-900 dark:text-white/90">{{ material.title }}</p>
        <span class="text-xs text-gray-400 dark:text-gray-500">
          {{ materialTypeLabel(material.materialType) }}
          <template v-if="isFile && material.fileSize !== null">
            · {{ formatFileSize(material.fileSize) }}
          </template>
        </span>
      </div>

      <!-- Inline body: prose for a reading, monospace for a code sample. -->
      <p
        v-if="material.contentText"
        class="mt-2 whitespace-pre-line text-sm leading-6 text-gray-600 dark:text-gray-300"
        :class="material.materialType === 'code' ? 'font-mono text-xs' : ''"
      >
        {{ material.contentText }}
      </p>

      <!-- Link body. The URL is shown in full, breakable, because a learner
           deciding whether to trust a link wants to see where it goes. -->
      <a
        v-if="isLink && material.externalUrl"
        :href="material.externalUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="mt-2 inline-flex min-h-11 max-w-full items-center gap-1.5 break-all text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
      >
        <ExternalLink class="size-3.5 shrink-0" aria-hidden="true" />
        <span>{{ material.externalUrl }}</span>
        <span class="sr-only">(opens in a new tab)</span>
      </a>

      <!-- File body. The link is a signed request through the storage API, so a
           learner who has lost access gets a refusal rather than a dead anchor. -->
      <a
        v-if="isFile && material.filePath"
        :href="material.filePath"
        target="_blank"
        rel="noopener noreferrer"
        class="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
      >
        <Download class="size-3.5 shrink-0" aria-hidden="true" />
        Download {{ fileName }}
      </a>

      <!-- Metadata line. When the instructor added it, which is useful and is
           deliberately not what organises the page. -->
      <p class="mt-2 text-xs text-gray-400 dark:text-gray-500">
        Added {{ formatDate(material.createdAt) }}
      </p>
    </div>

    <div v-if="editable" class="flex shrink-0 items-start gap-1">
      <button
        type="button"
        class="rounded px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
        @click="emit('edit', material.id)"
      >
        Edit
      </button>
      <button
        type="button"
        class="rounded px-2 py-1 text-xs font-medium text-error-600 hover:bg-error-50 dark:text-error-400 dark:hover:bg-error-500/10"
        @click="emit('remove', material.id)"
      >
        Remove
      </button>
    </div>
  </li>
</template>
