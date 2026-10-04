<template>
  <div>
    <PageHeader
      title="My profile"
      subtitle="Your name, contact details and account."
      :crumbs="[{ label: 'Profile' }]"
    />

    <div class="grid gap-6 lg:grid-cols-3">
      <div class="lg:col-span-2">
        <form
          class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]"
          novalidate
          @submit.prevent="handleSubmit"
        >
          <h2 class="text-title-sm text-gray-900 dark:text-white/90">Details</h2>

          <Alert
            v-if="savedMessage"
            variant="success"
            title="Profile saved"
            :message="savedMessage"
            class="mt-4"
          />
          <Alert
            v-if="errorMessage"
            variant="error"
            title="Could not save your profile"
            :message="errorMessage"
            class="mt-4"
          />

          <div class="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <label for="fullName" class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Full name
              </label>
              <input id="fullName" v-model.trim="fullName" type="text" :class="inputClass" />
            </div>

            <div>
              <label for="email" class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email address
              </label>
              <!--
                Read only on purpose. The email is the Supabase auth identity;
                changing it needs a separate verification flow. Letting it look
                editable here would promise something the form cannot deliver.
              -->
              <input
                id="email"
                :value="auth.profile?.email ?? ''"
                type="email"
                :class="[inputClass, 'cursor-not-allowed bg-gray-50 dark:bg-gray-800/60']"
                disabled
              />
              <p class="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                Your sign-in email cannot be changed here.
              </p>
            </div>

            <div>
              <label for="phone" class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Phone
              </label>
              <input
                id="phone"
                v-model.trim="phone"
                type="tel"
                placeholder="+63 900 000 0000"
                :class="inputClass"
              />
            </div>

            <div>
              <label for="role" class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Role
              </label>
              <input
                id="role"
                :value="roleLabel"
                type="text"
                :class="[inputClass, 'cursor-not-allowed bg-gray-50 dark:bg-gray-800/60']"
                disabled
              />
              <p class="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                Only an administrator can change your role.
              </p>
            </div>

            <div class="sm:col-span-2">
              <label for="bio" class="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                About you
              </label>
              <textarea
                id="bio"
                v-model.trim="bio"
                rows="4"
                :class="[inputClass, 'resize-y']"
                placeholder="A short introduction shown to your instructors."
              ></textarea>
            </div>
          </div>

          <div class="mt-6">
            <Button type="submit" :disabled="isSaving || !auth.profile">
              <LoaderCircle v-if="isSaving" class="size-4 animate-spin" />
              {{ isSaving ? 'Saving...' : 'Save changes' }}
            </Button>
          </div>
        </form>
      </div>

      <div>
        <div class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 class="text-title-sm text-gray-900 dark:text-white/90">Security</h2>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Your password is managed by Supabase Auth.
          </p>
          <router-link
            to="/auth/forgot-password"
            class="mt-4 inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            Send a password reset link
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { LoaderCircle } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import { useAuthStore } from '@/stores/auth'
import { updateOwnProfile } from '@/services/profile.service'

const auth = useAuthStore()

const fullName = ref('')
const phone = ref('')
const bio = ref('')
const isSaving = ref(false)
const savedMessage = ref('')
const errorMessage = ref('')

// Seed the form once the profile arrives; the guard can resolve the session after
// this component mounts, so an initial ref() would capture empty values.
watch(
  () => auth.profile,
  (profile) => {
    if (!profile) return
    fullName.value = profile.fullName
    phone.value = profile.phone ?? ''
    bio.value = profile.bio ?? ''
  },
  { immediate: true },
)

const roleLabel = computed(() => {
  switch (auth.role) {
    case 'admin':
      return 'Administrator'
    case 'instructor':
      return 'Instructor'
    default:
      return 'Student'
  }
})

const inputClass =
  'w-full rounded border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden disabled:opacity-70 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90 dark:placeholder:text-gray-500'

async function handleSubmit(): Promise<void> {
  if (!auth.profile) return
  savedMessage.value = ''
  errorMessage.value = ''
  isSaving.value = true
  try {
    const updated = await updateOwnProfile(auth.profile.id, {
      fullName: fullName.value,
      phone: phone.value || null,
      bio: bio.value || null,
    })
    auth.profile = updated
    savedMessage.value = 'Your details have been updated.'
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Something went wrong. Please try again.'
  } finally {
    isSaving.value = false
  }
}
</script>