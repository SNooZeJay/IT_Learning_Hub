<template>
  <section class="surface-card p-5 sm:p-6" aria-labelledby="details-heading">
    <h2 id="details-heading" class="text-theme-xl text-ink">Details</h2>
    <p class="mt-1 text-sm text-slate">
      How your name and contact details appear to instructors and other learners.
    </p>

    <Alert
      v-if="savedMessage"
      class="mt-4"
      variant="success"
      title="Details saved"
      :message="savedMessage"
    />
    <Alert
      v-if="errorMessage"
      class="mt-4"
      variant="error"
      title="Could not save your details"
      :message="errorMessage"
    />

    <form class="mt-5" novalidate :aria-busy="saving" @submit.prevent="onSubmit">
      <div class="grid gap-5 sm:grid-cols-2">
        <div>
          <label for="fullName" class="mb-1.5 block text-sm font-medium text-ink">Full name</label>
          <input
            id="fullName"
            v-model.trim="fullName"
            type="text"
            autocomplete="name"
            :class="[inputClass, nameError ? 'border-error-500' : '']"
            :aria-invalid="nameError ? 'true' : undefined"
            :aria-describedby="nameError ? 'fullName-error' : undefined"
          />
          <p
            v-if="nameError"
            id="fullName-error"
            role="alert"
            class="mt-1.5 text-xs text-error-700 dark:text-error-400"
          >
            {{ nameError }}
          </p>
        </div>

        <div>
          <label for="email" class="mb-1.5 block text-sm font-medium text-ink">Email address</label>
          <!--
            Read only, and the reason is specific rather than decorative.

            `profiles.email` is a mirror of the address in `auth.users`. Nothing
            keeps the two in step — there is no sync trigger — and `authenticated`
            has no grant on `auth.users`, so this page could not even read the
            real one. A field here that "saved" would write the mirror and leave
            somebody showing an address they can no longer sign in with, which is
            a lockout rather than a preference.
          -->
          <input
            id="email"
            :value="profile.email"
            type="email"
            readonly
            :class="[inputClass, 'cursor-not-allowed bg-surface-soft text-slate']"
            aria-describedby="email-note"
          />
          <p id="email-note" class="mt-1.5 text-xs text-slate">
            The address you sign in with. To change it, ask an administrator.
          </p>
        </div>

        <div>
          <label for="phone" class="mb-1.5 block text-sm font-medium text-ink">Phone</label>
          <input
            id="phone"
            v-model.trim="phone"
            type="tel"
            autocomplete="tel"
            placeholder="+63 900 000 0000"
            :class="inputClass"
          />
        </div>

        <div>
          <label for="role" class="mb-1.5 block text-sm font-medium text-ink">Role</label>
          <input
            id="role"
            :value="roleLabel"
            type="text"
            readonly
            :class="[inputClass, 'cursor-not-allowed bg-surface-soft text-slate']"
            aria-describedby="role-note"
          />
          <p id="role-note" class="mt-1.5 text-xs text-slate">
            Set by an administrator, and what decides what you can reach.
          </p>
        </div>

        <div class="sm:col-span-2">
          <label for="bio" class="mb-1.5 block text-sm font-medium text-ink">About you</label>
          <textarea
            id="bio"
            v-model="bio"
            rows="4"
            :maxlength="bioLimit"
            :class="[inputClass, 'resize-y']"
            aria-describedby="bio-hint"
            placeholder="A short introduction shown to your instructors."
          ></textarea>
          <!--
            A `maxlength` plus a live counter, not a submit-time refusal.

            Refusing the save when the bio is long would mean somebody who
            already has a long one — written before this limit existed — could
            not change their phone number without first rewriting their own
            introduction. So the paste is stopped at 500, the counter says where
            they stand, and anything that still arrives over the line is trimmed
            by `onSubmit` with the page saying so afterwards.
          -->
          <p
            id="bio-hint"
            class="mt-1.5 text-xs"
            :class="isBioNearLimit ? 'text-warning-700 dark:text-warning-400' : 'text-slate'"
          >
            {{ bio.length }} of {{ bioLimit }} characters.<span v-if="isBioNearLimit">
              Close to the limit.</span
            >
          </p>
        </div>
      </div>

      <div class="mt-6">
        <Button type="submit" :disabled="saving || !isDirty">
          <LoaderCircle v-if="saving" class="size-4 animate-spin" aria-hidden="true" />
          {{ saving ? 'Saving...' : 'Save changes' }}
        </Button>
        <p v-if="!isDirty && !saving" class="mt-2 text-xs text-slate">Nothing has changed yet.</p>
      </div>
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { LoaderCircle } from 'lucide-vue-next'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import type { Profile } from '@/types'

/**
 * The editable half of a profile, and only that half.
 *
 * The read-only fields live here rather than beside the editable ones on
 * purpose: a person looking for their email should find it on this card, and
 * should not have to work out that it moved.
 *
 * The outcome of a save arrives as props rather than through a slot, so the
 * messages sit inside the card's own margin rhythm instead of hanging off a
 * wrapper that would be an empty box on the many visits that change nothing.
 */

const props = defineProps<{
  profile: Profile
  saving: boolean
  savedMessage?: string
  errorMessage?: string
}>()

const emit = defineEmits<{
  submit: [changes: { fullName: string; phone: string | null; bio: string | null }]
  truncated: []
}>()

/**
 * A cap on the introduction, and the reason it is 500 rather than unlimited.
 *
 * `profiles.bio` is unconstrained `text`, so the only thing stopping somebody
 * pasting a novel into a field shown next to their name is this. 500 characters
 * is about four sentences, which is what an instructor actually reads.
 */
const bioLimit = 500

const fullName = ref(props.profile.fullName)
const phone = ref(props.profile.phone ?? '')
// Clamped on the way in: `maxlength` stops a paste but does not shorten a
// stored value that already predates the limit.
const bio = ref((props.profile.bio ?? '').slice(0, bioLimit))
const nameError = ref('')

/**
 * Seed once, then only when the account changes.
 *
 * Watching the whole profile object and re-seeding on every change would throw
 * away half-typed edits the moment the avatar card saved a new photo and pushed
 * a fresh profile into the store.
 */
watch(
  () => props.profile.id,
  () => {
    fullName.value = props.profile.fullName
    phone.value = props.profile.phone ?? ''
    bio.value = (props.profile.bio ?? '').slice(0, bioLimit)
    nameError.value = ''
  },
)

const isDirty = computed(
  () =>
    fullName.value !== props.profile.fullName ||
    phone.value !== (props.profile.phone ?? '') ||
    bio.value !== (props.profile.bio ?? ''),
)

/** Warn before the limit is hit, not after. */
const isBioNearLimit = computed(() => bio.value.length > bioLimit - 80)

const roleLabel = computed(() => {
  switch (props.profile.role) {
    case 'admin':
      return 'Administrator'
    case 'instructor':
      return 'Instructor'
    default:
      return 'Student'
  }
})

const inputClass =
  'w-full rounded-md border border-hairline-strong bg-canvas px-4 py-3 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden read-only:cursor-not-allowed dark:bg-white/[0.03]'

function onSubmit(): void {
  nameError.value = ''

  // `full_name` is NOT NULL, but the database happily stores an empty string,
  // which would render as a nameless avatar chip everywhere. That is a bug this
  // check is cheaper than.
  if (!fullName.value) {
    nameError.value = 'A name is required — it is what shows on your enrollments and certificates.'
    return
  }

  // Belt and braces against the `maxlength`, which a browser without support can
  // still get past. The text is trimmed rather than the save refused, so nobody
  // with an old long bio is locked out of changing their phone number — and the
  // page says afterwards that it happened, because a silent truncation is worse
  // than a visible one.
  let wasTrimmed = false
  const trimmedBio = bio.value.length > bioLimit ? bio.value.slice(0, bioLimit) : bio.value
  if (trimmedBio !== bio.value) wasTrimmed = true

  emit('submit', {
    fullName: fullName.value,
    phone: phone.value || null,
    bio: trimmedBio || null,
  })
  if (wasTrimmed) emit('truncated')
}
</script>
