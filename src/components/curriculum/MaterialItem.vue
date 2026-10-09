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
import { computed, ref, watch } from 'vue'
import {
  BookOpen,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  Play,
  TriangleAlert,
} from 'lucide-vue-next'
import type { LessonMaterial } from '@/types'
import { formatDate } from '@/types'
import { formatFileSize, materialTypeLabel, safeExternalHref } from '@/services/curriculum.service'
import { createMaterialUrl, materialFileName } from '@/services/material.service'
import type { MaterialUrlState } from '@/services/material.service'

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

const fileName = computed(() => materialFileName(props.material.filePath, props.material.title))

/**
 * The link, or null when it is not one this app will follow.
 *
 * Null covers three cases the template treats differently: no URL at all, a URL
 * that is only whitespace, and a URL whose scheme is not http or https. The
 * first renders nothing; the second and third render the refusal instead of an
 * anchor.
 */
const safeHref = computed(() => safeExternalHref(props.material.externalUrl))

/**
 * The signed URL for this file, resolved for whoever is looking at it.
 *
 * Minted on mount and re-minted if the key changes, because the signature expires and
 * because the read policy is evaluated per viewer: a URL that worked for an enrolled
 * student must not be handed to somebody who has since lost access, and vice versa.
 *
 * `idle` is the state before the first resolve. It is distinct from `loading` so the
 * row does not flash "Preparing the download…" on every render of a non-file
 * material, which never needs a URL at all.
 */
const urlState = ref<MaterialUrlState>({ status: 'idle' })

async function resolveUrl(path: string): Promise<void> {
  urlState.value = { status: 'loading' }
  urlState.value = await createMaterialUrl(path)
}

watch(
  () => (isFile.value ? props.material.filePath : null),
  (path) => {
    if (!path) {
      urlState.value = { status: 'idle' }
      return
    }
    void resolveUrl(path)
  },
  { immediate: true },
)
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
        <span class="text-xs text-slate">
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

      <!--
        Link body.

        `safeHref` is the check, not a nicety. This string comes out of the
        database and was written by an instructor; rendering it into `:href`
        unchecked made a stored `javascript:` URL a clickable script for every
        student who opened the lesson. A value that fails the check is shown as
        plain text with the reason, never as a link - an anchor that cannot be
        made safe must not be rendered as an anchor at all, or the next person to
        edit this template puts the raw value back.
      -->
      <a
        v-if="isLink && safeHref"
        :href="safeHref"
        target="_blank"
        rel="noopener noreferrer"
        class="mt-2 inline-flex min-h-11 max-w-full items-center gap-1.5 break-all text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
      >
        <ExternalLink class="size-3.5 shrink-0" aria-hidden="true" />
        <span>{{ safeHref }}</span>
        <span class="sr-only">(opens in a new tab)</span>
      </a>

      <p
        v-else-if="isLink && material.externalUrl"
        class="mt-2 inline-flex min-h-11 max-w-full items-start gap-1.5 break-all text-sm text-error-600 dark:text-error-400"
      >
        <TriangleAlert class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          This link is not shown because its address is not an http or https URL.
          <span class="font-mono text-xs">{{ material.externalUrl }}</span>
        </span>
      </p>

      <!--
        File body.

        The link is a signed URL minted for this viewer, not the stored object key:
        the bucket is private and `file_path` is a key, so binding it straight to
        `href` asked the SPA host for a path that does not exist and the rewrite
        answered 200 with `index.html`. All three outcomes are shown honestly -
        preparing, ready, and refused - because refusal is a real outcome here and not
        an edge case: it is what a learner who has lost access to the course sees.
      -->
      <div v-if="isFile && material.filePath" class="mt-2">
        <p v-if="urlState.status === 'loading'" class="text-xs text-slate">
          Preparing the download…
        </p>

        <p
          v-else-if="urlState.status === 'unavailable'"
          class="text-xs text-warning-700 dark:text-warning-400"
        >
          {{ urlState.message }}
        </p>

        <a
          v-else-if="urlState.status === 'ready'"
          :href="urlState.url"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          <Download class="size-3.5 shrink-0" aria-hidden="true" />
          Download {{ fileName }}
          <span class="sr-only">(opens in a new tab)</span>
        </a>
      </div>

      <!-- Metadata line. When the instructor added it, which is useful and is
           deliberately not what organises the page. -->
      <p class="mt-2 text-xs text-slate">
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
