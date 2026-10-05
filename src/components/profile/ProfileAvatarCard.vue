<template>
  <section
    class="rounded-lg border border-hairline bg-canvas p-5 sm:p-6 dark:bg-white/[0.03]"
    aria-labelledby="profile-photo-heading"
  >
    <div class="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
      <UserAvatar
        :name="profile.fullName"
        :src="previewUrl || profile.avatarUrl"
        :version="imageVersion"
        size="xl"
        label=""
      />

      <div class="min-w-0 flex-1">
        <h2 id="profile-photo-heading" class="text-theme-xl text-ink">Profile photo</h2>
        <p class="mt-1 text-sm text-slate">
          {{
            profile.avatarUrl
              ? 'Your photo is served from a public bucket, so anybody who can see your profile can see this image.'
              : 'You have the initials treatment. Add a photo and it appears wherever your name does.'
          }}
        </p>
      </div>
    </div>

    <Alert
      v-if="operationError"
      variant="error"
      :title="operationTitle"
      :message="operationError"
      class="mt-5"
    />

    <div v-if="successMessage" aria-live="polite" class="mt-5">
      <Alert variant="success" title="Photo saved" :message="successMessage" />
    </div>

    <div class="mt-5">
      <!--
        The input is present and focusable rather than `hidden`, and the label is
        painted as the button. A `display:none` input cannot be reached by
        keyboard at all, and a button that calls `.click()` on one leaves the
        label and the control as two separate things for a screen reader to
        reconcile. This way one focusable thing is both the label and the
        target, and `peer-focus-visible` puts the ring where the eye is.
      -->
      <input
        id="avatar-file"
        class="peer sr-only"
        type="file"
        :accept="acceptAttribute"
        :disabled="isBusy"
        :aria-invalid="fieldError ? 'true' : undefined"
        :aria-describedby="`${hintId} ${fieldError ? errorId : ''}`.trim()"
        @change="onFilePicked"
      />

      <label
        for="avatar-file"
        class="inline-flex cursor-pointer items-center gap-2 rounded-md border border-hairline-strong bg-canvas px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-surface peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-canvas peer-disabled:cursor-not-allowed peer-disabled:opacity-50 dark:bg-white/[0.03]"
      >
        <LoaderCircle v-if="busy === 'uploading'" class="size-4 animate-spin" aria-hidden="true" />
        <Upload v-else class="size-4" aria-hidden="true" />
        {{
          busy === 'uploading'
            ? 'Uploading...'
            : profile.avatarUrl
              ? 'Replace photo'
              : 'Choose a photo'
        }}
      </label>

      <p :id="hintId" class="mt-2 text-xs text-slate">
        JPEG, PNG, WebP or GIF, up to {{ formatBytes(AVATAR_MAX_BYTES) }}. The image is shown
        unchanged, cropped to a circle.
      </p>

      <!--
        A rejection of the file itself is tied to the input with
        `aria-describedby`, so the reason arrives with the field rather than
        somewhere else on the card.
      -->
      <p
        v-if="fieldError"
        :id="errorId"
        role="alert"
        class="mt-2 flex items-start gap-2 text-sm text-error-700 dark:text-error-400"
      >
        <CircleAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{{ fieldError }}</span>
      </p>
    </div>

    <!--
      The preview. Nothing is uploaded until "Save photo" is pressed, so a person
      can see the crop they are about to publish instead of discovering it after
      a round trip.
    -->
    <div v-if="pendingFile" class="mt-5 rounded-md border border-hairline bg-surface-soft p-4">
      <div class="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <UserAvatar :name="profile.fullName" :src="previewUrl" size="lg" />

        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-ink">Preview — not saved yet</p>
          <p class="mt-0.5 truncate text-xs text-slate">
            {{ pendingFile.name }} · {{ formatBytes(pendingFile.size) }} · {{ pendingFile.type }}
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <Button :disabled="isBusy" @click="savePhoto">
            <LoaderCircle
              v-if="busy === 'uploading'"
              class="size-4 animate-spin"
              aria-hidden="true"
            />
            {{ busy === 'uploading' ? 'Saving...' : 'Save photo' }}
          </Button>
          <button
            type="button"
            :disabled="isBusy"
            class="inline-flex items-center gap-2 rounded-md border border-hairline-strong bg-canvas px-4 py-3 text-sm font-medium text-ink transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/[0.03]"
            @click="discardPending"
          >
            Discard
          </button>
        </div>
      </div>
    </div>

    <div v-if="profile.avatarUrl" class="mt-5 border-t border-hairline-soft pt-5">
      <button
        type="button"
        :disabled="isBusy"
        class="inline-flex items-center gap-2 rounded-md border border-hairline-strong bg-canvas px-4 py-2.5 text-sm font-medium text-error-700 transition hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/[0.03] dark:text-error-400 dark:hover:bg-error-500/10"
        @click="removePhoto"
      >
        <LoaderCircle v-if="busy === 'removing'" class="size-4 animate-spin" aria-hidden="true" />
        <Trash2 v-else class="size-4" aria-hidden="true" />
        {{ busy === 'removing' ? 'Removing...' : 'Remove photo' }}
      </button>
      <p class="mt-2 text-xs text-slate">
        Clears the photo from your profile and returns you to your initials. Nothing else on the
        platform changes.
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { CircleAlert, LoaderCircle, Trash2, Upload } from 'lucide-vue-next'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import UserAvatar from '@/components/profile/UserAvatar.vue'
import {
  AVATAR_ACCEPTED_MIME_TYPES,
  AVATAR_MAX_BYTES,
  checkAvatarFile,
  formatBytes,
  removeOwnAvatar,
  updateOwnProfile,
  uploadOwnAvatar,
} from '@/services/profile.service'
import type { Profile } from '@/types'

const props = defineProps<{ profile: Profile }>()

/** The card writes; the page decides what a written profile means for the store. */
const emit = defineEmits<{ updated: [profile: Profile] }>()

const hintId = 'avatar-file-hint'
const errorId = 'avatar-file-error'

const pendingFile = ref<File | null>(null)
const previewUrl = ref('')
const busy = ref<'idle' | 'uploading' | 'removing'>('idle')
const fieldError = ref('')
const operationError = ref('')
const operationTitle = ref('Could not save the photo')
const successMessage = ref('')
/** Bumped on every write, so a replaced photo is not served from cache. */
const imageVersion = ref(0)

const isBusy = computed(() => busy.value !== 'idle')

const acceptAttribute = AVATAR_ACCEPTED_MIME_TYPES.join(',')

/** Object URLs live until they are revoked, so every path out of a pending file revokes. */
function releasePreview(): void {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
  pendingFile.value = null
}

function discardPending(): void {
  releasePreview()
  fieldError.value = ''
}

onUnmounted(releasePreview)

function resetMessages(): void {
  fieldError.value = ''
  operationError.value = ''
  successMessage.value = ''
}

/**
 * A file that cannot be used never reaches the network.
 *
 * The input is cleared afterwards so choosing the same file again after fixing
 * the problem still fires `change` — otherwise a second attempt at a rejected
 * file would be silently ignored, which is the exact failure this card exists to
 * avoid.
 */
function onFilePicked(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  resetMessages()
  releasePreview()
  input.value = ''

  if (!file) return

  const rejection = checkAvatarFile(file)
  if (rejection) {
    fieldError.value = rejection.message
    return
  }

  pendingFile.value = file
  previewUrl.value = URL.createObjectURL(file)
}

async function savePhoto(): Promise<void> {
  const file = pendingFile.value
  if (!file || busy.value !== 'idle') return

  resetMessages()
  busy.value = 'uploading'
  try {
    const publicUrl = await uploadOwnAvatar(props.profile.id, file)
    try {
      const updated = await updateOwnProfile(props.profile.id, { avatarUrl: publicUrl })
      imageVersion.value += 1
      releasePreview()
      successMessage.value = 'Your new photo is live.'
      emit('updated', updated)
    } catch (saveError) {
      // The bytes are in the bucket but the column is not pointing at them, so
      // the profile is unchanged and still shows whatever it showed before.
      // Saying which half failed is the useful part; a generic failure would
      // leave somebody believing their photo was saved.
      operationTitle.value = 'The photo uploaded, but your profile was not updated'
      operationError.value =
        saveError instanceof Error
          ? `${saveError.message} Press Save photo again to finish — it will not upload a second copy.`
          : 'Press Save photo again to finish.'
    }
  } catch (uploadError) {
    operationTitle.value = 'The photo did not upload'
    operationError.value =
      uploadError instanceof Error ? uploadError.message : 'Try again in a moment.'
  } finally {
    busy.value = 'idle'
  }
}

async function removePhoto(): Promise<void> {
  if (busy.value !== 'idle') return
  resetMessages()
  releasePreview()
  busy.value = 'removing'
  try {
    const updated = await removeOwnAvatar(props.profile.id)
    imageVersion.value += 1
    successMessage.value = 'Your photo has been removed.'
    emit('updated', updated)
  } catch (error) {
    operationTitle.value = 'The photo could not be removed'
    operationError.value = error instanceof Error ? error.message : 'Try again in a moment.'
  } finally {
    busy.value = 'idle'
  }
}
</script>
