<script setup lang="ts">
/**
 * Create or edit a module, inline.
 *
 * The old system kept the create form in a `<details>` disclosure at the bottom of
 * the course page so adding a module never meant navigating away. This is that
 * form, lifted into a component because there are now two of it per page (create
 * and edit) and one shape rather than two.
 *
 * Status is a deliberate field rather than an implied default. An instructor
 * building a course wants to stage work and publish it deliberately, which is the
 * behaviour the old system had with its `ContentStatus` enum and which this port
 * restores.
 */
import { ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import { formSelectClass } from '@/components/ui/controlClasses'
import type { ContentStatus, Module } from '@/types'

const props = defineProps<{
  /** Null when creating. */
  module: Module | null
  saving: boolean
  error: string | null
}>()

const emit = defineEmits<{
  cancel: []
  submit: [draft: { title: string; description: string | null; status: ContentStatus }]
}>()

const title = ref('')
const description = ref('')
const status = ref<ContentStatus>('draft')
const titleError = ref('')

watch(
  () => props.module,
  (value) => {
    title.value = value?.title ?? ''
    description.value = value?.description ?? ''
    // Editing an already-published module defaults to keeping it published.
    // Defaulting an edit to draft would silently unpublish live content, which is
    // the sort of surprise that erodes trust in an editing screen.
    status.value = value?.status ?? 'draft'
    titleError.value = ''
  },
  { immediate: true },
)

function submit(): void {
  const trimmed = title.value.trim()
  if (trimmed === '') {
    titleError.value = 'Give the module a name.'
    return
  }
  emit('submit', {
    title: trimmed,
    description: description.value.trim() === '' ? null : description.value.trim(),
    status: status.value,
  })
}
</script>

<template>
  <form
    class="rounded-lg border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-white/[0.02]"
    novalidate
    @submit.prevent="submit"
  >
    <h3 class="text-theme-sm text-gray-900 dark:text-white/90">
      {{ module ? 'Edit module' : 'New module' }}
    </h3>
    <p class="mt-1 section-subheading">
      A module is one section of the course. Order it by adding modules in the sequence you want
      learners to work through them.
    </p>

    <div class="mt-4 flex flex-col gap-4">
      <div>
        <label for="module-title" class="text-sm font-medium text-gray-700 dark:text-gray-300">
          Name
        </label>
        <input
          id="module-title"
          v-model="title"
          type="text"
          maxlength="255"
          placeholder="Getting started"
          class="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90"
          :aria-invalid="Boolean(titleError)"
          :aria-describedby="titleError ? 'module-title-error' : undefined"
        />
        <p
          v-if="titleError"
          id="module-title-error"
          class="mt-1.5 text-sm text-error-600 dark:text-error-400"
        >
          {{ titleError }}
        </p>
      </div>

      <div>
        <label
          for="module-description"
          class="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          What this module covers
          <span class="font-normal text-gray-400">(optional)</span>
        </label>
        <textarea
          id="module-description"
          v-model="description"
          rows="2"
          maxlength="2000"
          placeholder="One line so learners know what they are about to start."
          class="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90"
        />
      </div>

      <div>
        <label for="module-status" class="text-sm font-medium text-gray-700 dark:text-gray-300">
          Visibility
        </label>
        <select id="module-status" v-model="status" class="formSelectClass">
          <option value="draft">Draft — only you can see this</option>
          <option value="published">Published — students can see this</option>
          <option value="archived">Archived — hidden from everyone</option>
        </select>
      </div>
    </div>

    <p v-if="error" class="mt-4 text-sm text-error-600 dark:text-error-400">{{ error }}</p>

    <div class="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" :disabled="saving" @click="emit('cancel')">
        Cancel
      </Button>
      <Button type="submit" variant="primary" :disabled="saving">
        {{ module ? 'Save module' : 'Add module' }}
      </Button>
    </div>
  </form>
</template>
