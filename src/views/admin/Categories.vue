<template>
  <div>
    <PageHeader
      title="Categories"
      subtitle="How the catalogue is organised. Every field on this page is stored in course_categories."
      :crumbs="[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Categories' }]"
    >
      <template #actions>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-md border border-hairline-strong bg-canvas px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface"
          :disabled="isLoading"
          @click="load"
        >
          <RotateCcw class="size-4" :class="{ 'animate-spin': isLoading }" aria-hidden="true" />
          Refresh
        </button>
      </template>
    </PageHeader>

    <LoadingState v-if="isLoading" label="Loading categories" />

    <ErrorState
      v-else-if="errorMessage"
      title="Could not load categories"
      :message="errorMessage"
      @retry="load"
    />

    <template v-else>
      <div class="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Categories"
          :value="String(categories.length)"
          :icon="FolderTree"
          hint="Used by the catalogue filters"
        />
        <StatCard
          label="In use"
          :value="String(usedCount)"
          :hint="`${usedCount} in use · ${emptyCount} empty`"
          :icon="CircleCheck"
        />
        <StatCard
          label="Largest category"
          :value="String(largest.courseCount)"
          :hint="
            largest.name ? `${largest.name} — the most courses filed under it` : 'No categories yet'
          "
          :icon="CircleHelp"
        />
      </div>

      <!--
        One form for create and edit rather than two screens. They write the same
        columns through the same policies, so splitting them would duplicate the
        validation and the error handling for no benefit.
      -->
      <form
        class="mt-6 rounded-lg border border-hairline bg-canvas p-5"
        novalidate
        @submit.prevent="submit"
      >
        <h2 class="text-theme-xl font-semibold text-ink">
          {{ editingId ? `Edit “${editingName}”` : 'New category' }}
        </h2>

        <div class="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <label for="category-name" class="mb-1 block text-sm font-medium text-ink">Name</label>
            <input
              id="category-name"
              v-model.trim="form.name"
              type="text"
              maxlength="80"
              placeholder="Networking and Security"
              :class="inputClass"
            />
            <p class="mt-1 text-xs text-slate">
              Unique. The database refuses a duplicate name, and says so.
            </p>
          </div>

          <div>
            <label for="category-slug" class="mb-1 block text-sm font-medium text-ink">Slug</label>
            <input
              id="category-slug"
              v-model.trim="form.slug"
              type="text"
              maxlength="80"
              placeholder="networking-and-security"
              :class="inputClass"
            />
            <p class="mt-1 text-xs text-slate">
              Also unique. Left blank it is derived from the name.
            </p>
          </div>

          <div class="lg:col-span-2">
            <label for="category-description" class="mb-1 block text-sm font-medium text-ink">
              Description
            </label>
            <textarea
              id="category-description"
              v-model.trim="form.description"
              rows="2"
              maxlength="300"
              placeholder="One line about what belongs in this category."
              :class="[inputClass, 'resize-y']"
            ></textarea>
          </div>

          <div>
            <label for="category-icon" class="mb-1 block text-sm font-medium text-ink">Icon</label>
            <input
              id="category-icon"
              v-model.trim="form.icon"
              type="text"
              maxlength="60"
              placeholder="ShieldCheck"
              :class="inputClass"
            />
            <p class="mt-1 text-xs text-slate">
              Free text, stored exactly as written. Nothing in this app resolves it to an icon yet.
            </p>
          </div>
        </div>

        <!-- The database's refusal, in place. A duplicate slug or a name already
             in use comes back as raised text, and it is the only useful thing in
             the response. -->
        <Alert
          v-if="formError"
          variant="error"
          title="The category was not saved"
          :message="formError"
          class="mt-4"
        />

        <Alert
          v-if="savedMessage"
          variant="success"
          title="Saved"
          :message="savedMessage"
          class="mt-4"
        />

        <div class="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            :disabled="isSaving || !canSubmit"
            class="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-canvas transition hover:bg-charcoal disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LoaderCircle v-if="isSaving" class="size-4 animate-spin" aria-hidden="true" />
            {{ editingId ? 'Save changes' : 'Create category' }}
          </button>

          <button
            v-if="editingId"
            type="button"
            class="inline-flex items-center gap-2 rounded-md border border-hairline-strong px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-surface"
            @click="cancelEdit"
          >
            Cancel
          </button>
        </div>
      </form>

      <h2 class="mt-8 text-theme-xl font-semibold text-ink">All categories</h2>

      <EmptyState
        v-if="categories.length === 0"
        class="mt-4"
        title="No categories yet"
        description="Create one above. Instructors pick a category when they draft a course, so an empty list just means nothing has been filed yet."
        :icon="FolderTree"
      />

      <ul v-else class="mt-4 space-y-3">
        <li
          v-for="category in categories"
          :key="category.id"
          class="rounded-lg border border-hairline bg-canvas p-5"
        >
          <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0">
              <h3 class="text-theme-xl font-semibold text-ink">{{ category.name }}</h3>
              <p class="mt-0.5 font-mono text-xs text-slate">{{ category.slug }}</p>
              <p v-if="category.description" class="mt-2 text-sm text-slate">
                {{ category.description }}
              </p>
              <p v-else class="mt-2 text-sm text-stone">No description.</p>
              <p class="mt-2 text-sm text-slate">
                {{ category.icon ? `Icon: ${category.icon} · ` : '' }}
                {{ category.courseCount }}
                {{ category.courseCount === 1 ? 'course' : 'courses' }} · added
                {{ formatDate(category.createdAt) }}
              </p>
            </div>

            <div class="flex shrink-0 gap-2">
              <button
                type="button"
                :disabled="isSaving || confirmingDeleteId !== null"
                :class="actionButtonClass"
                @click="startEdit(category)"
              >
                <Pencil class="size-3.5" aria-hidden="true" />
                Edit
              </button>

              <!--
                Two-step rather than a modal: the destructive action sits next to the
                row it destroys and takes a second deliberate press, which is
                enough for a category and one less dialog to get wrong.
              -->
              <button
                v-if="confirmingDeleteId !== category.id"
                type="button"
                :disabled="isSaving"
                :class="[
                  actionButtonClass,
                  'hover:border-error-500 hover:text-error-600 dark:hover:text-error-400',
                ]"
                @click="confirmingDeleteId = category.id"
              >
                <Trash2 class="size-3.5" aria-hidden="true" />
                Delete
              </button>

              <template v-else>
                <button
                  type="button"
                  :disabled="isSaving"
                  class="inline-flex items-center gap-1.5 rounded-md border border-error-500 bg-canvas px-2.5 py-1.5 text-xs font-medium text-error-600 transition hover:bg-error-50 disabled:opacity-50 dark:text-error-400 dark:hover:bg-error-500/10"
                  @click="confirmDelete(category)"
                >
                  <LoaderCircle v-if="isSaving" class="size-3.5 animate-spin" aria-hidden="true" />
                  Confirm
                </button>
                <button
                  type="button"
                  :disabled="isSaving"
                  :class="actionButtonClass"
                  @click="confirmingDeleteId = null"
                >
                  Keep
                </button>
              </template>
            </div>
          </div>

          <p
            v-if="rowNotices[category.id]"
            class="mt-3 text-sm"
            :class="
              rowNoticeTone[category.id] === 'success'
                ? 'text-success-700 dark:text-success-400'
                : 'text-error-700 dark:text-error-400'
            "
          >
            {{ rowNotices[category.id] }}
          </p>
        </li>
      </ul>

      <p
        v-if="usedCount === 0 && categories.length > 0"
        class="mt-6 rounded border border-hairline bg-surface px-4 py-3 text-sm text-slate"
      >
        No course is filed under any of these categories, so the catalogue filters have nothing to
        narrow. A category is chosen when a course is edited, not from here.
      </p>

      <p class="mt-6 text-sm text-slate">
        A category that still has courses attached cannot be deleted. The foreign key refuses the
        delete and names the constraint, rather than quietly detaching the courses from it.
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  CircleCheck,
  CircleHelp,
  FolderTree,
  LoaderCircle,
  Pencil,
  RotateCcw,
  Trash2,
} from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import StatCard from '@/components/common/StatCard.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import Alert from '@/components/ui/Alert.vue'
import {
  AdminError,
  createCategory,
  deleteCategory,
  listAdminCategories,
  logAdminAction,
  slugify,
  updateCategory,
} from '@/services/admin.service'
import { formatDate } from '@/types'
import type { AdminCategory } from '@/services/admin.service'

const categories = ref<AdminCategory[]>([])
const isLoading = ref(true)
const isSaving = ref(false)
const errorMessage = ref('')
const formError = ref('')
const savedMessage = ref('')

const editingId = ref<string | null>(null)
const editingName = ref('')
const confirmingDeleteId = ref<string | null>(null)
const rowNotices = ref<Record<string, string>>({})
const rowNoticeTone = ref<Record<string, 'success' | 'error'>>({})

const form = ref({ name: '', slug: '', description: '', icon: '' })
/** Whether the slug was last typed by hand, so it stops following the name. */
const slugTouched = ref(false)

const inputClass =
  'w-full rounded border border-hairline-strong bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden'

const actionButtonClass =
  'inline-flex items-center gap-1.5 rounded-md border border-hairline-strong bg-canvas px-2.5 py-1.5 text-xs font-medium text-ink transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50'

const usedCount = computed(() => categories.value.filter((c) => c.courseCount > 0).length)

const emptyCount = computed(() => categories.value.length - usedCount.value)

/** The category with the most courses on it, or an empty placeholder. */
const largest = computed<{ name: string; courseCount: number }>(() => {
  let best: AdminCategory | null = null
  for (const category of categories.value) {
    if (!best || category.courseCount > best.courseCount) best = category
  }
  return best ? { name: best.name, courseCount: best.courseCount } : { name: '', courseCount: 0 }
})

const canSubmit = computed(() => form.value.name.length > 0)

function notice(id: string, message: string, tone: 'success' | 'error'): void {
  rowNotices.value = { ...rowNotices.value, [id]: message }
  rowNoticeTone.value = { ...rowNoticeTone.value, [id]: tone }
}

function resetForm(): void {
  form.value = { name: '', slug: '', description: '', icon: '' }
  slugTouched.value = false
  editingId.value = null
  editingName.value = ''
  formError.value = ''
  savedMessage.value = ''
}

function startEdit(category: AdminCategory): void {
  editingId.value = category.id
  editingName.value = category.name
  form.value = {
    name: category.name,
    slug: category.slug,
    description: category.description ?? '',
    icon: category.icon ?? '',
  }
  slugTouched.value = true
  formError.value = ''
  savedMessage.value = ''
  confirmingDeleteId.value = null
}

function cancelEdit(): void {
  resetForm()
}

async function submit(): Promise<void> {
  const name = form.value.name.trim()
  if (!name) {
    formError.value = 'A category needs a name.'
    return
  }

  const slug = slugTouched.value ? form.value.slug.trim() : slugify(name)
  if (!slug) {
    formError.value =
      'That name has no letters or numbers in it, so it cannot produce a slug. Type a slug directly.'
    return
  }

  isSaving.value = true
  formError.value = ''
  savedMessage.value = ''

  const payload = {
    name,
    slug,
    description: form.value.description.trim() || null,
    icon: form.value.icon.trim() || null,
  }

  try {
    if (editingId.value) {
      await updateCategory(editingId.value, payload)
      await logAdminAction('category.update', 'course_category', editingId.value, { name, slug })
      savedMessage.value = `“${name}” has been saved.`
    } else {
      const created = await createCategory(payload)
      await logAdminAction('category.create', 'course_category', created.id, { name, slug })
      savedMessage.value = `“${name}” has been created.`
    }
    await refresh()
    resetForm()
  } catch (error) {
    // Deliberately the raw service message: a duplicate slug arrives as Postgres
    // constraint text, and that sentence is the whole answer.
    formError.value = error instanceof AdminError ? error.message : 'Could not save this category.'
  } finally {
    isSaving.value = false
  }
}

async function confirmDelete(category: AdminCategory): Promise<void> {
  isSaving.value = true
  try {
    await deleteCategory(category.id)
    await logAdminAction('category.delete', 'course_category', category.id, {
      name: category.name,
    })
    await refresh()
    if (editingId.value === category.id) resetForm()
    notice(category.id, `“${category.name}” has been deleted.`, 'success')
  } catch (error) {
    notice(
      category.id,
      error instanceof AdminError ? error.message : 'Could not delete this category.',
      'error',
    )
  } finally {
    confirmingDeleteId.value = null
    isSaving.value = false
  }
}

/** Re-reads the list without the loading skeleton, so notices survive. */
async function refresh(): Promise<void> {
  categories.value = await listAdminCategories()
}

async function load(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  try {
    categories.value = await listAdminCategories()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not load categories.'
  } finally {
    isLoading.value = false
  }
}

onMounted(load)
</script>
