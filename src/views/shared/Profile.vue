<template>
  <div>
    <PageHeader
      title="My profile"
      subtitle="Your photo, your name and your contact details — how you appear across the LMS."
      :crumbs="[{ label: 'My profile' }]"
    />

    <!--
      This screen is about identity and nothing else.

      It used to hold the password form and a language picker as well, which made it the
      place people went to for three unrelated things. Those now live on /settings, and
      saying so here is deliberate: a visitor who arrives expecting their password and
      finds no field for it will otherwise assume the feature is gone.

      The security card was genuinely the wrong home for it. A password is not displayed
      beside a person's name or photo anywhere in this LMS, and it is not part of how
      their identity appears - so it was never a profile detail to begin with.
    -->
    <p class="mt-4 max-w-2xl text-sm text-slate">
      Changing your sign-in address or password is in
      <RouterLink
        to="/settings"
        class="font-medium text-brand-600 hover:underline dark:text-brand-400"
      >
        Settings
      </RouterLink>
      , along with how the interface looks.
    </p>

    <!--
      Everything below needs a profile row. The route guard has already proved
      there is a session, so a missing row means the `handle_new_user` trigger
      never ran for this account, and saying so is more useful than rendering
      five empty cards.
    -->
    <ErrorState
      v-if="!profile"
      title="Your profile could not be loaded"
      :message="profileLoadMessage"
      @retry="reloadProfile"
    />

    <template v-else>
      <!--
        Photo on the left, details on the right.

        This used to be a two-thirds column holding both cards stacked, with the other
        third holding security and the language picker. Those have moved to /settings, so
        keeping the two-thirds layout would have left a third of the page permanently
        empty. The photo is the narrow thing and the details are the wide thing, which is
        the same relationship the old layout had between the two columns - just without
        the empty third.
      -->
      <div class="mt-6 grid gap-6 lg:grid-cols-3">
        <div class="lg:col-span-1">
          <ProfileAvatarCard :profile="profile" @updated="applyProfile" />
        </div>

        <div class="lg:col-span-2">
          <ProfileDetailsCard
            :profile="profile"
            :saving="isSavingDetails"
            :saved-message="detailsSaved"
            :error-message="detailsError"
            @submit="saveDetails"
            @truncated="detailsTruncated = true"
          />
        </div>
      </div>

      <section class="mt-8" aria-labelledby="activity-heading">
        <h2 id="activity-heading" class="text-theme-xl text-ink">{{ activityTitle }}</h2>
        <p class="mt-1 text-sm text-slate">{{ activitySubtitle }}</p>

        <LoadingState v-if="isLoadingActivity" class="mt-4" label="Loading your figures" />

        <ErrorState
          v-else-if="activityError"
          class="mt-4"
          :message="activityError"
          @retry="reloadActivity"
        />

        <div
          v-else-if="activityCards.length > 0"
          class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          <StatCard
            v-for="card in activityCards"
            :key="card.label"
            :label="card.label"
            :value="card.value"
            :icon="card.icon"
            :hint="card.hint"
          />
        </div>

        <EmptyState
          v-else
          class="mt-4"
          :icon="ChartColumn"
          title="No figures to show yet"
          description="Once your account has a role and some activity in it, the numbers appear here."
        />
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Component } from 'vue'
import {
  BookOpen,
  ChartColumn,
  GraduationCap,
  Library,
  Target,
  Trophy,
  Users,
  Wallet,
} from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import StatCard from '@/components/common/StatCard.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import ProfileAvatarCard from '@/components/profile/ProfileAvatarCard.vue'
import ProfileDetailsCard from '@/components/profile/ProfileDetailsCard.vue'
import { useAuthStore } from '@/stores/auth'
import { updateOwnProfile } from '@/services/profile.service'
import { loadInstructorDashboard, loadStudentDashboard } from '@/services/dashboard.service'
import { getAdminStats } from '@/services/stats.service'
import { formatPeso } from '@/types'
import { useToast } from '@/composables/useToast'
import type { AdminStats } from '@/services/stats.service'
import type { InstructorDashboard, StudentDashboard } from '@/services/dashboard.service'
import type { Profile } from '@/types'

/**
 * The account page, shared by all three roles.
 *
 * Everything it shows is read from somewhere that exists. There is no invented
 * field on this page: `profiles` has nine columns and they are all on it, and
 * every setting that is not one of them says where it is kept.
 */

const auth = useAuthStore()
const toast = useToast()

/** Narrowed once, so the cards below receive a `Profile` and not a `Profile | null`. */
const profile = computed<Profile | null>(() => auth.profile)

// -- Details form ------------------------------------------------------------

const isSavingDetails = ref(false)
const detailsSaved = ref('')
const detailsError = ref('')
/** Set by the card when a longer introduction had to be cut to save it. */
const detailsTruncated = ref(false)

async function saveDetails(changes: {
  fullName: string
  phone: string | null
  bio: string | null
}): Promise<void> {
  if (!profile.value) return
  detailsSaved.value = ''
  detailsError.value = ''
  detailsTruncated.value = false
  isSavingDetails.value = true
  try {
    const updated = await updateOwnProfile(profile.value.id, changes)
    // Assigned straight into the store rather than re-read, because the write
    // above returned the row the database now holds. A second round trip would
    // only be able to disagree with it.
    auth.profile = updated
    detailsSaved.value = detailsTruncated.value
      ? 'Your details have been updated. Your introduction was longer than this form shows, so it was trimmed to 500 characters.'
      : 'Your details have been updated.'
    toast.success('Profile saved', 'Your changes have been saved.')
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Something went wrong. Please try again.'
    detailsError.value = message
    toast.error('Could not save your profile', message)
  } finally {
    isSavingDetails.value = false
  }
}

/** What the avatar card and the details form both do once their write lands. */
function applyProfile(updated: Profile): void {
  auth.profile = updated
}

const profileLoadMessage = computed(() =>
  auth.user
    ? 'There is a session for this browser, but no profile row for it. An administrator can fix the account.'
    : 'Sign in again to load your profile.',
)

async function reloadProfile(): Promise<void> {
  if (!auth.user) return
  await auth.loadProfile(auth.user.id)
}

// -- Role-appropriate figures -----------------------------------------------

interface Figure {
  label: string
  value: string
  icon: Component
  hint: string
}

const activityCards = ref<Figure[]>([])
const isLoadingActivity = ref(true)
const activityError = ref('')

const activityTitle = computed(() => {
  switch (auth.role) {
    case 'admin':
      return 'Platform at a glance'
    case 'instructor':
      return 'Your teaching at a glance'
    default:
      return 'Your learning at a glance'
  }
})

const activitySubtitle = computed(() => {
  switch (auth.role) {
    case 'admin':
      return 'Whole-school counts, read from the same queries the admin dashboard uses.'
    case 'instructor':
      return 'Scoped to the courses you own. Other instructors’ courses are not counted here.'
    case 'student':
      return 'Your own enrollments, lessons and graded quizzes.'
    default:
      return 'These appear once your account has a role.'
  }
})

/**
 * A figure nobody could read is not a zero.
 *
 * The dashboard loaders answer null for a count that failed and 0 for a count
 * that is genuinely nothing, and the difference matters: a broken query shown
 * as "0 enrolments" is how a student with three enrolments gets told they have
 * none. So null renders as a dash, and the hint says which of the two it is.
 */
function count(value: number | null, label: string, icon: Component, readable: string): Figure {
  return {
    label,
    value: value === null ? '—' : String(value),
    icon,
    hint: value === null ? 'This figure could not be read just now.' : readable,
  }
}

function percent(value: number | null, label: string, icon: Component, readable: string): Figure {
  return {
    label,
    value: value === null ? '—' : `${value}%`,
    icon,
    hint: value === null ? 'This figure could not be read just now.' : readable,
  }
}

function studentFigures(data: StudentDashboard): Figure[] {
  return [
    count(
      data.enrolledCourses,
      'Active enrollments',
      GraduationCap,
      data.completedCourses === null
        ? 'Courses currently running'
        : `${data.completedCourses} finished as well`,
    ),
    count(data.lessonsCompleted, 'Lessons completed', BookOpen, 'Across every enrolled course'),
    percent(
      data.averageQuizScore,
      'Average quiz score',
      Trophy,
      data.averageQuizScore === null
        ? 'No quiz has been graded yet'
        : 'Across every graded attempt',
    ),
  ]
}

function instructorFigures(data: InstructorDashboard): Figure[] {
  return [
    count(data.courses, 'Courses taught', Library, 'Every course you own, published or draft'),
    count(
      data.students,
      'Students',
      GraduationCap,
      'Distinct people across your courses, counted once each',
    ),
    // Labelled "Quizzes", not "Published quizzes". This count is every quiz in
    // the instructor's courses, drafts included, because that is what the loader
    // counts. Naming it after a subset would be a label the number does not
    // match.
    count(data.quizzes, 'Quizzes', Target, 'Drafts and published, in your courses'),
  ]
}

function adminFigures(stats: AdminStats): Figure[] {
  return [
    count(
      stats.students + stats.instructors + stats.admins,
      'Accounts',
      Users,
      `${stats.students} students, ${stats.instructors} instructors, ${stats.admins} admins`,
    ),
    count(
      stats.publishedCourses + stats.draftCourses,
      'Courses',
      Library,
      `${stats.publishedCourses} published, ${stats.draftCourses} draft, ${stats.paidCourses} priced`,
    ),
    {
      label: 'Revenue',
      value: formatPeso(stats.revenueCentavos),
      icon: Wallet,
      hint: 'From confirmed payments only',
    },
  ]
}

async function reloadActivity(): Promise<void> {
  const role = auth.role
  if (!role) return

  isLoadingActivity.value = true
  activityError.value = ''
  try {
    if (role === 'admin') {
      activityCards.value = adminFigures(await getAdminStats())
    } else if (role === 'instructor') {
      activityCards.value = instructorFigures(await loadInstructorDashboard())
    } else {
      activityCards.value = studentFigures(await loadStudentDashboard())
    }
  } catch (error) {
    activityCards.value = []
    activityError.value =
      error instanceof Error ? error.message : 'Could not load your figures. Try again.'
  } finally {
    isLoadingActivity.value = false
  }
}

/**
 * Wait for a role rather than reporting "no figures" against none.
 *
 * `loadProfile` resolves after this view mounts, so `auth.role` is null on the
 * first tick for every signed-in user. Returning early here leaves the panel in
 * its loading state, which is honest; treating the null as an answer would flash
 * an empty state at each account on each page load.
 */
watch(
  () => auth.role,
  (role) => {
    if (!role) return
    void reloadActivity()
  },
  { immediate: true },
)
</script>
