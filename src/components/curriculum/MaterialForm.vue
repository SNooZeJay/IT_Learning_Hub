<script setup lang="ts">
/**
 * Create or edit a learning material, inline.
 *
 * The type drives which fields matter, and the form says so rather than showing
 * every field and letting the database refuse the combination. The old system did
 * exactly this: its type dropdown rejected image/pdf/document in the create form
 * when no file was being uploaded, and its `withValidator` enforced the matrix in
 * both directions.
 *
 * Here the form shows the relevant field immediately - text box, link box, or file
 * input - so the instructor never assembles something the schema will not accept.
 * `check_material_shape()` still enforces it in the database, because a form is not
 * a security control.
 */
import { computed, ref, watch } from 'vue'
import { FileUp, Link2, Type } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import type { LessonMaterial, MaterialType } from '@/types'
import { formSelectClass } from '@/components/ui/controlClasses'
import { materialIsInlineText, materialIsLink, materialNeedsFile } from '@/types'
import {
  materialTypeLabel,
  safeExternalHref,
  UNSAFE_URL_REASON,
} from '@/services/curriculum.service'

const props = defineProps<{
  /** Null when creating. */
  material: LessonMaterial | null
  lessonTitle: string
  saving: boolean
  error: string | null
}>()

const emit = defineEmits<{
  cancel: []
  submit: [
    draft: {
      title: string
      materialType: MaterialType
      contentText: string | null
      externalUrl: string | null
      file: File | null
    },
  ]
}>()

const title = ref('')
const materialType = ref<MaterialType>('text')
const contentText = ref('')
const externalUrl = ref('')
const file = ref<File | null>(null)
const titleError = ref('')
const bodyError = ref('')

/**
 * The types offered, split so the label reads as a choice rather than as a
 * storage value. Order is the order a person would pick in: prose first, then a
 * file, then a link.
 */
const OPTIONS: Array<{ value: MaterialType; hint: string }> = [
  { value: 'text', hint: 'A reading or a note, written on the lesson page' },
  { value: 'code', hint: 'A code sample, shown in a fixed-width block' },
  { value: 'document', hint: 'A file learners download, such as a worksheet' },
  { value: 'pdf', hint: 'A PDF learners download' },
  { value: 'image', hint: 'A diagram learners download' },
  { value: 'video_link', hint: 'A video to watch' },
  { value: 'external_link', hint: 'A link to somewhere else' },
]

watch(
  () => props.material,
  (value) => {
    title.value = value?.title ?? ''
    materialType.value = value?.materialType ?? 'text'
    contentText.value = value?.contentText ?? ''
    externalUrl.value = value?.externalUrl ?? ''
    file.value = null
    titleError.value = ''
    bodyError.value = ''
  },
  { immediate: true },
)

const bodyLabel = computed(() => {
  switch (materialType.value) {
    case 'code':
      return 'The code'
    case 'video_link':
    case 'external_link':
      return 'The link'
    default:
      return 'The content'
  }
})

const bodyHint = computed(() => {
  if (materialType.value === 'code') {
    return 'Shown in a fixed-width block with spacing preserved.'
  }
  if (materialIsLink(materialType.value)) {
    return 'Learners see the whole link, so they can see where it goes before clicking.'
  }
  return 'Leave a blank line between paragraphs.'
})

const icon = computed(() => {
  if (materialIsLink(materialType.value)) return Link2
  if (materialNeedsFile(materialType.value)) return FileUp
  return Type
})

/**
 * Files are capped at 10 MB, the same limit the old system's
 * `MaterialFileRules::MAX_KILOBYTES` used.
 */
const MAX_BYTES = 10 * 1024 * 1024

function onFile(event: Event): void {
  const input = event.target as HTMLInputElement
  file.value = input.files?.[0] ?? null
  bodyError.value = ''
}

function submit(): void {
  const trimmed = title.value.trim()
  if (trimmed === '') {
    titleError.value = 'Give the material a name.'
    return
  }

  const type = materialType.value

  // Checked here so the instructor gets a sentence rather than a constraint
  // violation from the database.
  if (materialNeedsFile(type)) {
    // An edit that already has a stored file does not need a new one.
    if (!file.value && !props.material?.filePath) {
      bodyError.value = `A ${materialTypeLabel(type).toLowerCase()} material needs a file.`
      return
    }
    if (file.value && file.value.size > MAX_BYTES) {
      bodyError.value = 'That file is larger than 10 MB.'
      return
    }
  }

  if (
    materialIsInlineText(type) &&
    contentText.value.trim() === '' &&
    !props.material?.contentText
  ) {
    bodyError.value = `A ${materialTypeLabel(type).toLowerCase()} material needs its content.`
    return
  }

  if (materialIsLink(type)) {
    const typed = externalUrl.value.trim()
    if (typed === '' && !props.material?.externalUrl) {
      bodyError.value = `A ${materialTypeLabel(type).toLowerCase()} material needs a link.`
      return
    }

    // The scheme is checked here rather than by `type="url"`.
    //
    // Two reasons. The form carries `novalidate`, so the browser's own URL check
    // never runs - which is correct, because a browser bubble is not a message
    // this app can style or translate, but it does mean nothing else is checking.
    // And even without `novalidate`, `type="url"` accepts any scheme it can
    // parse, including `javascript:`, so it would not have refused the value that
    // matters.
    const safe = safeExternalHref(typed)
    if (typed !== '' && safe === null) {
      bodyError.value = `That link cannot be saved. ${UNSAFE_URL_REASON}`
      return
    }
    externalUrl.value = safe ?? externalUrl.value.trim()
  }

  emit('submit', {
    title: trimmed,
    materialType: type,
    contentText: materialIsInlineText(type) ? contentText.value : null,
    externalUrl: materialIsLink(type) ? externalUrl.value.trim() : null,
    file: materialNeedsFile(type) ? file.value : null,
  })
}

const isTextType = computed(() => materialIsInlineText(materialType.value))
</script>

<template>
  <form
    class="rounded-lg border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-white/[0.02]"
    novalidate
    @submit.prevent="submit"
  >
    <h3 class="text-theme-sm text-gray-900 dark:text-white/90">
      {{ material ? 'Edit material' : 'New material' }}
      <span v-if="lessonTitle" class="font-normal text-gray-500 dark:text-gray-400">
        on {{ lessonTitle }}
      </span>
    </h3>
    <p class="mt-1 section-subheading">
      Materials belong to one lesson and stay there, so a learner reading that lesson finds it
      without hunting.
    </p>

    <div class="mt-4 flex flex-col gap-4">
      <div>
        <label for="material-title" class="text-sm font-medium text-gray-700 dark:text-gray-300">
          Name
        </label>
        <input
          id="material-title"
          v-model="title"
          type="text"
          maxlength="255"
          placeholder="Starter file"
          class="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90"
          :aria-invalid="Boolean(titleError)"
        />
        <p v-if="titleError" class="mt-1.5 text-sm text-error-600 dark:text-error-400">
          {{ titleError }}
        </p>
      </div>

      <div>
        <label for="material-type" class="text-sm font-medium text-gray-700 dark:text-gray-300">
          What kind of thing is it
        </label>
        <select id="material-type" v-model="materialType" class="formSelectClass">
          <option v-for="option in OPTIONS" :key="option.value" :value="option.value">
            {{ materialTypeLabel(option.value) }} — {{ option.hint }}
          </option>
        </select>
      </div>

      <!-- One body field, chosen by the type. Showing all three at once and
           ignoring two of them is how people end up wondering why their notes
           did not appear. -->
      <div v-if="isTextType || materialIsLink(materialType)">
        <label
          for="material-body"
          class="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          <component
            :is="materialIsLink(materialType) ? Link2 : Type"
            class="size-4"
            aria-hidden="true"
          />
          {{ bodyLabel }}
        </label>
        <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{{ bodyHint }}</p>
        <textarea
          v-if="isTextType"
          id="material-body"
          v-model="contentText"
          rows="6"
          :placeholder="materialType === 'code' ? 'def greet(name):' : 'Write the reading here.'"
          class="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90"
          :class="materialType === 'code' ? 'font-mono text-xs' : ''"
        />
        <input
          v-else
          id="material-body"
          v-model="externalUrl"
          type="url"
          placeholder="https://docs.python.org/3/"
          class="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90"
        />
      </div>

      <div v-else>
        <label
          for="material-file"
          class="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          <component :is="icon" class="size-4" aria-hidden="true" />
          File
        </label>
        <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          Up to 10 MB. Stored privately and served only to enrolled learners.
          <template v-if="material?.filePath">
            Currently: {{ material.filePath.split('/').pop() }}. Choosing a new file replaces it.
          </template>
        </p>
        <input
          id="material-file"
          type="file"
          class="mt-1.5 block w-full cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-700 file:me-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-300"
          @change="onFile"
        />
      </div>
    </div>

    <p v-if="bodyError" class="mt-4 text-sm text-error-600 dark:text-error-400">{{ bodyError }}</p>
    <p v-if="error" class="mt-4 text-sm text-error-600 dark:text-error-400">{{ error }}</p>

    <div class="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" :disabled="saving" @click="emit('cancel')">
        Cancel
      </Button>
      <Button type="submit" variant="primary" :disabled="saving">
        {{ material ? 'Save material' : 'Add material' }}
      </Button>
    </div>
  </form>
</template>
