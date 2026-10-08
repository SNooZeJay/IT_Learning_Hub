<template>
  <div>
    <PageHeader
      title="System settings"
      subtitle="What the platform currently holds, and an honest account of what it cannot be told to change."
      :crumbs="[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Settings' }]"
    >
      <template #actions>
        <span
          class="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-slate"
        >
          <Lock class="size-3.5" aria-hidden="true" />
          Read-only
        </span>
      </template>
    </PageHeader>

    <!--
      Said first, and said plainly. There is no settings table in this schema, so
      there is nowhere for a preference to be saved and nothing this page could
      write. A form full of controls that quietly do nothing is worse than no
      form: it looks like configuration and behaves like a lie.
    -->
    <Alert
      variant="info"
      title="This screen reports, it does not change"
      message="Everything here is measured live. Anything that genuinely can be changed is changed on the screen named beside it."
      class="mb-6"
    />

    <LoadingState v-if="isLoading" label="Loading platform facts" />

    <ErrorState
      v-else-if="errorMessage"
      title="Could not load the platform facts"
      :message="errorMessage"
      @retry="load"
    />

    <template v-else-if="overview">
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Accounts"
          :value="String(overview.users.total)"
          :icon="Users"
          :hint="`${suspendedCount} suspended, ${invitedCount} invited`"
        />
        <StatCard
          label="Courses"
          :value="String(overview.catalogue.courses)"
          :icon="Library"
          :hint="`${overview.catalogue.publishedCourses} published, ${overview.catalogue.draftCourses} draft`"
        />
        <StatCard
          label="Enrollments"
          :value="String(overview.learning.enrollments)"
          :icon="BookOpen"
          :hint="`${overview.learning.completedEnrollments} completed, ${overview.learning.certificates} certificates`"
        />
        <StatCard
          label="Collected"
          :value="formatPeso(overview.money.paidCentavos)"
          :icon="Wallet"
          :hint="`${formatPeso(overview.money.refundedCentavos)} refunded of ${overview.money.paidCount + overview.money.refundedCount} attempts that took money`"
        />
      </div>

      <!-- ============================ WHAT CAN CHANGE ============================ -->
      <section class="mt-6 rounded-lg border border-hairline bg-canvas p-6">
        <h2 class="text-title-sm font-semibold text-ink">What can be changed, and where</h2>
        <p class="mt-1 text-sm text-slate">
          This page stores nothing. These are the only settings that exist today, and each one is a
          row in a real table rather than a preference.
        </p>

        <ul class="mt-5 divide-y divide-hairline">
          <li
            v-for="control in editableControls"
            :key="control.to"
            class="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="min-w-0">
              <p class="font-medium text-ink">{{ control.label }}</p>
              <p class="mt-0.5 text-sm text-slate">{{ control.detail }}</p>
            </div>
            <RouterLink
              :to="control.to"
              class="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md border border-hairline-strong px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface sm:self-auto"
            >
              {{ control.action }}
              <ChevronRight class="size-4 rtl:rotate-180" aria-hidden="true" />
            </RouterLink>
          </li>
        </ul>
      </section>

      <!-- ============================ THE NUMBERS ============================ -->
      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <section class="rounded-lg border border-hairline bg-canvas p-6">
          <h2 class="text-title-sm font-semibold text-ink">People</h2>
          <dl class="mt-5 space-y-3">
            <div
              v-for="row in [...overview.users.byRole, ...overview.users.byStatus]"
              :key="row.key"
              class="flex items-baseline justify-between gap-4 border-b border-hairline pb-3 last:border-0 last:pb-0"
            >
              <dt class="text-sm text-slate">{{ row.label }}</dt>
              <dd class="text-theme-xl font-semibold tabular-nums text-ink">{{ row.count }}</dd>
            </div>
          </dl>
        </section>

        <section class="rounded-lg border border-hairline bg-canvas p-6">
          <h2 class="text-title-sm font-semibold text-ink">Catalogue</h2>
          <dl class="mt-5 space-y-3">
            <div
              v-for="row in catalogueRows"
              :key="row.label"
              class="flex items-baseline justify-between gap-4 border-b border-hairline pb-3 last:border-0 last:pb-0"
            >
              <dt class="text-sm text-slate">{{ row.label }}</dt>
              <dd class="text-theme-xl font-semibold tabular-nums text-ink">{{ row.value }}</dd>
            </div>
          </dl>
        </section>

        <section class="rounded-lg border border-hairline bg-canvas p-6">
          <h2 class="text-title-sm font-semibold text-ink">Learning</h2>
          <dl class="mt-5 space-y-3">
            <div
              v-for="row in learningRows"
              :key="row.label"
              class="flex items-baseline justify-between gap-4 border-b border-hairline pb-3 last:border-0 last:pb-0"
            >
              <dt class="text-sm text-slate">{{ row.label }}</dt>
              <dd class="text-theme-xl font-semibold tabular-nums text-ink">{{ row.value }}</dd>
            </div>
          </dl>
          <p class="mt-5 text-sm text-slate">
            A certificate is issued as soon as an enrollment completes. Revoking one is a decision
            about a named learner rather than a platform setting, so it is handled on the learner's
            own record.
          </p>
        </section>

        <section class="rounded-lg border border-hairline bg-canvas p-6">
          <h2 class="text-title-sm font-semibold text-ink">Money</h2>
          <dl class="mt-5 space-y-3">
            <div
              v-for="row in moneyRows"
              :key="row.label"
              class="flex items-baseline justify-between gap-4 border-b border-hairline pb-3 last:border-0 last:pb-0"
            >
              <dt class="text-sm text-slate">{{ row.label }}</dt>
              <dd class="text-theme-xl font-semibold tabular-nums text-ink">{{ row.value }}</dd>
            </div>
          </dl>
          <p class="mt-5 text-sm text-slate">
            Amounts are stored as integer centavos and only formatted at this edge, because floating
            point pesos lose cents. Collected and refunded are the only two that represent money
            that moved.
          </p>
        </section>
      </div>

      <!-- ============================ POSTURE ============================ -->
      <section class="mt-6 rounded-lg border border-hairline bg-canvas p-6">
        <div class="flex items-start gap-3">
          <ShieldCheck
            class="mt-0.5 size-5 shrink-0 text-brand-600 dark:text-brand-400"
            aria-hidden="true"
          />
          <div>
            <h2 class="text-title-sm font-semibold text-ink">How access is decided</h2>
            <p class="mt-1 text-sm text-slate">
              These rules are decided by the system, not stored as a setting, so they cannot be
              edited from this screen. They are listed here so you know exactly what the platform
              enforces on its own.
            </p>
          </div>
        </div>

        <ul class="mt-5 grid gap-4 sm:grid-cols-2">
          <li
            v-for="fact in postureFacts"
            :key="fact.title"
            class="rounded-md border border-hairline bg-surface-soft p-4"
          >
            <h3 class="text-sm font-semibold text-ink">{{ fact.title }}</h3>
            <p class="mt-1 text-sm text-slate">{{ fact.detail }}</p>
          </li>
        </ul>

        <p class="mt-5 text-sm text-slate">
          These counts reflect what this account is entitled to see. Anything outside that is never
          sent to the browser in the first place.
        </p>
      </section>

      <p class="mt-6 text-sm text-slate">
        Refreshed {{ loadedAtLabel }}. Everything on this page is counted at the moment it loads;
        nothing is cached and nothing is written.
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { BookOpen, ChevronRight, Library, Lock, ShieldCheck, Users, Wallet } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import StatCard from '@/components/common/StatCard.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import Alert from '@/components/ui/Alert.vue'
import { getPlatformOverview } from '@/services/admin.service'
import { formatPeso, formatDateTime } from '@/types'
import type { PlatformOverview } from '@/services/admin.service'

const overview = ref<PlatformOverview | null>(null)
const loadedAt = ref<string | null>(null)
const isLoading = ref(true)
const errorMessage = ref('')

const data = computed(() => overview.value)

const suspendedCount = computed(
  () => data.value?.users.byStatus.find((row) => row.key === 'suspended')?.count ?? 0,
)

const invitedCount = computed(
  () => data.value?.users.byStatus.find((row) => row.key === 'invited')?.count ?? 0,
)

const loadedAtLabel = computed(() => (loadedAt.value ? formatDateTime(loadedAt.value) : '—'))

const catalogueRows = computed(() => {
  const catalogue = data.value?.catalogue
  if (!catalogue) return []
  return [
    { label: 'Courses', value: catalogue.courses },
    { label: 'Published', value: catalogue.publishedCourses },
    { label: 'Drafts', value: catalogue.draftCourses },
    { label: 'Archived', value: catalogue.archivedCourses },
    { label: 'Paid', value: catalogue.paidCourses },
    { label: 'Free', value: catalogue.freeCourses },
    { label: 'Categories', value: catalogue.categories },
    { label: 'Modules', value: catalogue.modules },
    { label: 'Lessons', value: catalogue.lessons },
    { label: 'Quizzes', value: catalogue.quizzes },
  ]
})

const learningRows = computed(() => {
  const learning = data.value?.learning
  if (!learning) return []
  return [
    { label: 'Enrollments', value: learning.enrollments },
    { label: 'Active', value: learning.activeEnrollments },
    { label: 'Completed', value: learning.completedEnrollments },
    { label: 'Certificates issued', value: learning.certificates },
  ]
})

const moneyRows = computed(() => {
  const money = data.value?.money
  if (!money) return []
  return [
    { label: 'Collected', value: formatPeso(money.paidCentavos) },
    { label: 'Refunded', value: formatPeso(money.refundedCentavos) },
    { label: 'Awaiting confirmation', value: formatPeso(money.pendingCentavos) },
    { label: 'Failed', value: formatPeso(money.failedCentavos) },
    { label: 'Cancelled', value: formatPeso(money.cancelledCentavos) },
  ]
})

/**
 * The settings that exist, each one a real row in a real table.
 *
 * Listed with the screen that owns the write, because "where do I change this?"
 * is the only question a settings page has to answer when it cannot answer "what
 * can I configure?".
 */
const editableControls = [
  {
    label: 'Roles and account status',
    detail:
      'The last remaining administrator cannot be removed, so the platform always keeps one account with full control. Suspending an account blocks course access without deleting anything.',
    to: '/admin/users',
    action: 'Manage users',
  },
  {
    label: 'Course publication and teaching assignments',
    detail:
      'Publishing, unpublishing and archiving, plus who may edit each course. An instructor with no assignment can change nothing.',
    to: '/admin/courses',
    action: 'Manage courses',
  },
  {
    label: 'Catalogue categories',
    detail:
      'The names, slugs and descriptions the catalogue filters read. A category with courses attached cannot be deleted.',
    to: '/admin/categories',
    action: 'Manage categories',
  },
]

/**
 * How this installation behaves, in terms an administrator acts on.
 *
 * Not settings, and not editable. Each one explains why a control somewhere in the admin
 * surface is absent rather than unfinished, so nobody waits for a button that is never
 * going to appear.
 *
 * Written in product language on purpose. An earlier version of this list described the
 * mechanisms — Row Level Security, `is_admin()`, the service role — and read as a note to
 * whoever deployed the schema rather than as information about the LMS in front of them.
 */
const postureFacts = [
  {
    title: 'People only see what belongs to them',
    detail:
      'A student sees their own work, an instructor sees their own courses, and an administrator sees the whole school. Nothing is filtered after the fact — an account that is not entitled to a record is not sent it.',
  },
  {
    title: 'A role is set by an administrator, never by the person holding it',
    detail:
      'Changing a role in the browser has no effect on what that account can reach. The change has to be made and confirmed here first.',
  },
  {
    title: 'Payments are confirmed by the provider, not by this screen',
    detail:
      'A payment becomes paid when the provider confirms it. That is why payments are read-only here, and why a payment can take a moment to appear as settled.',
  },
  {
    title: 'The last administrator cannot be removed',
    detail:
      'The platform refuses every attempt to remove the final administrator, so it can never be left with nobody able to promote anybody.',
  },
  {
    title: 'Audit rows are written server-side',
    detail:
      'Admin actions are recorded by a security-definer function that stamps the actor itself, so an entry cannot be attributed to somebody else.',
  },
  {
    title: 'Publishing is reversible',
    detail:
      'A course is only a status change, never a delete. Unpublishing hides it from students and keeps the date it first shipped, so nothing is lost by putting it back.',
  },
]

async function load(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  try {
    overview.value = await getPlatformOverview()
    loadedAt.value = new Date().toISOString()
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Could not load the platform facts.'
  } finally {
    isLoading.value = false
  }
}

onMounted(load)
</script>
