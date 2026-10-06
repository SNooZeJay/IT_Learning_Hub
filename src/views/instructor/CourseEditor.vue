<template>
  <div>
    <LoadingState v-if="isLoading" :label="isNew ? 'Preparing the editor' : 'Loading course'" />

    <ErrorState
      v-else-if="fatalError"
      :title="isNew ? 'Could not open the editor' : 'Could not open this course'"
      :message="fatalError"
      @retry="load"
    />

    <template v-else>
      <PageHeader
        :title="isNew ? 'New course' : form.title || 'Edit course'"
        :subtitle="
          isNew
            ? 'This starts as a private draft. Nobody sees it until you publish.'
            : 'Course details, curriculum and status.'
        "
        :crumbs="
          isNew
            ? [
                { label: 'Instructor', to: '/instructor/dashboard' },
                { label: 'Courses', to: '/instructor/courses' },
                { label: 'New course' },
              ]
            : [
                { label: 'Instructor', to: '/instructor/dashboard' },
                { label: 'Courses', to: '/instructor/courses' },
                { label: form.title || 'Edit', to: `/instructor/courses/${courseId}` },
                { label: 'Edit' },
              ]
        "
      />

      <form class="grid gap-6 lg:grid-cols-3" @submit.prevent="save">
        <!-- ======================= DETAILS ======================= -->
        <div class="space-y-6 lg:col-span-2">
          <div
            class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <h2 class="text-title-sm text-gray-900 dark:text-white/90">Course details</h2>

            <Alert
              v-if="saveError"
              variant="error"
              title="Could not save"
              :message="saveError"
              class="mt-5"
            />

            <Alert
              v-if="canClaim === false"
              variant="warning"
              title="You cannot create a course yet"
              :message="CLAIM_REFUSED_MESSAGE"
              class="mt-5"
            />

            <div class="mt-5 space-y-5">
              <div>
                <label
                  for="title"
                  class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Title
                </label>
                <input
                  id="title"
                  v-model.trim="form.title"
                  type="text"
                  required
                  maxlength="200"
                  placeholder="Introduction to Web Development"
                  :class="inputClass"
                />
              </div>

              <div>
                <label
                  for="slug"
                  class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Slug
                </label>
                <input
                  id="slug"
                  v-model.trim="form.slug"
                  @input="markSlugTouched"
                  type="text"
                  required
                  maxlength="200"
                  placeholder="introduction-to-web-development"
                  :class="inputClass"
                />
                <!--
                  The slug is the public address. It says so here rather than
                  being a silent identifier, because changing it after
                  publication breaks the link a student already has.
                -->
                <p class="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  Lowercase letters, numbers and hyphens. Becomes
                  <span class="break-all">/courses/{{ form.slug || '…' }}</span>
                </p>
                <p
                  v-if="slugTouched && form.slug !== derivedSlug"
                  class="mt-1 text-xs text-warning-600 dark:text-warning-400"
                >
                  Edited by hand. If that was not intended, it will not match the title.
                </p>
              </div>

              <div>
                <label
                  for="description"
                  class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Description
                </label>
                <textarea
                  id="description"
                  v-model.trim="form.description"
                  rows="5"
                  placeholder="What a student will be able to do by the end."
                  class="w-full rounded border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-white/90 dark:placeholder:text-gray-500"
                ></textarea>
              </div>

              <div class="grid gap-5 sm:grid-cols-2">
                <div>
                  <label
                    for="category"
                    class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Category
                  </label>
                  <select id="category" v-model="form.categoryId" :class="selectClass">
                    <option value="">No category</option>
                    <option v-for="category in categories" :key="category.id" :value="category.id">
                      {{ category.name }}
                    </option>
                  </select>
                </div>

                <div>
                  <label
                    for="level"
                    class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Level
                  </label>
                  <select id="level" v-model="form.level" :class="selectClass">
                    <option v-for="level in LEVELS" :key="level" :value="level">
                      {{ LEVEL_LABELS[level] }}
                    </option>
                  </select>
                </div>
              </div>

              <div class="grid gap-5 sm:grid-cols-3">
                <div>
                  <label
                    for="price"
                    class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Price (₱)
                  </label>
                  <!--
                    Pesos in the field, centavos in the database. The conversion
                    is one direction at one place: `pesoInput` reads, and the
                    submit handler writes. Storing what was typed would make
                    ₱1,500 into 1500 centavos, which is ₱15.
                  -->
                  <input
                    id="price"
                    v-model="pesoInput"
                    type="number"
                    min="0"
                    step="0.01"
                    inputmode="decimal"
                    placeholder="0"
                    :class="inputClass"
                  />
                  <p class="mt-1.5 text-xs text-gray-500 dark:text-gray-400">0 means free.</p>
                </div>

                <div>
                  <label
                    for="duration"
                    class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Duration (minutes)
                  </label>
                  <input
                    id="duration"
                    v-model.number="form.durationMinutes"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Leave blank to decide later"
                    :class="inputClass"
                  />
                </div>

                <div>
                  <label
                    for="passing"
                    class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Pass mark (%)
                  </label>
                  <input
                    id="passing"
                    v-model.number="form.passingScore"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    placeholder="70"
                    :class="inputClass"
                  />
                </div>
              </div>

              <div>
                <span class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Status
                </span>
                <div class="mt-2 flex flex-wrap gap-2">
                  <label
                    v-for="option in STATUS_OPTIONS"
                    :key="option.value"
                    class="flex cursor-pointer items-center gap-2 rounded-md border px-3.5 py-2.5 text-sm transition-colors has-checked:border-brand-500 has-checked:bg-brand-50 dark:has-checked:bg-brand-500/10"
                    :class="
                      form.status === option.value
                        ? 'border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10'
                        : 'border-gray-300 dark:border-gray-700'
                    "
                  >
                    <input
                      v-model="form.status"
                      type="radio"
                      name="status"
                      :value="option.value"
                      class="size-4 text-brand-600 focus:ring-brand-500"
                    />
                    <span class="text-gray-700 dark:text-gray-300">{{ option.label }}</span>
                  </label>
                </div>
                <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {{ STATUS_HINTS[form.status] }}
                </p>
              </div>
            </div>

            <div class="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                class="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-brand-500 px-5 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
                :disabled="isSaving"
              >
                <LoaderCircle v-if="isSaving" class="size-4 animate-spin" />
                {{ isNew ? 'Create draft course' : 'Save changes' }}
              </button>

              <router-link
                v-if="!isNew"
                :to="`/instructor/courses/${courseId}`"
                class="inline-flex h-11 items-center justify-center rounded-md border border-gray-300 px-5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.06]"
              >
                Cancel
              </router-link>

              <p class="text-xs text-gray-500 dark:text-gray-400">{{ FIELD_HELP }}</p>
            </div>
          </div>

          <!-- ======================= CURRICULUM ======================= -->
          <div
            class="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <div
              class="flex items-baseline justify-between gap-3 border-b border-gray-200 px-6 py-4 dark:border-gray-800"
            >
              <div>
                <h2 class="text-title-sm text-gray-900 dark:text-white/90">Curriculum</h2>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {{ modules.length }} module{{ modules.length === 1 ? '' : 's' }} ·
                  {{ lessonCount }} lesson{{ lessonCount === 1 ? '' : 's' }}
                </p>
              </div>
              <button
                type="button"
                class="inline-flex shrink-0 items-center gap-2 rounded-md border border-gray-300 px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                :disabled="!courseId || isSavingModule"
                @click="startModule()"
              >
                <Plus class="size-4" />
                Add module
              </button>
            </div>

            <div v-if="!courseId" class="p-6">
              <!--
                The curriculum needs a saved course, because a module row
                references a course id that does not exist until the first save.
                Said plainly rather than shown as an empty list, which would read
                as "this course has no modules".
              -->
              <p
                class="rounded border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300"
              >
                Save the course once to create it, then add modules and lessons here.
              </p>
            </div>

            <div v-else-if="isLoadingModules" class="p-6">
              <LoadingState label="Loading the curriculum" />
            </div>

            <ErrorState
              v-else-if="moduleError"
              title="Could not load the curriculum"
              :message="moduleError"
              @retry="loadModules"
            />

            <EmptyState
              v-else-if="modules.length === 0"
              title="No modules yet"
              description="A module is a chapter of the course. Add one, then fill it with lessons."
              :icon="FolderTree"
            />

            <div v-else class="divide-y divide-gray-200 dark:divide-gray-800">
              <section v-for="module in modules" :key="module.id" class="px-6 py-5">
                <!-- Editing an existing module -->
                <div
                  v-if="editingModuleId === module.id"
                  class="rounded border border-brand-200 bg-brand-50/40 p-4 dark:border-brand-500/30 dark:bg-brand-500/[0.06]"
                >
                  <Alert
                    v-if="moduleFormError"
                    variant="error"
                    title="Could not save the module"
                    :message="moduleFormError"
                    class="mb-4"
                  />

                  <div class="space-y-4">
                    <div>
                      <label
                        :for="`module-title-${module.id}`"
                        class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                      >
                        Module title
                      </label>
                      <input
                        :id="`module-title-${module.id}`"
                        v-model.trim="moduleDraft.title"
                        type="text"
                        maxlength="200"
                        :class="inputClass"
                      />
                    </div>
                    <div>
                      <label
                        :for="`module-description-${module.id}`"
                        class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                      >
                        Description
                      </label>
                      <textarea
                        :id="`module-description-${module.id}`"
                        v-model.trim="moduleDraft.description"
                        rows="2"
                        :class="textAreaClass"
                      ></textarea>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <button
                        type="button"
                        class="inline-flex items-center gap-2 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
                        :disabled="isSavingModule"
                        @click="saveModule(module.id)"
                      >
                        <LoaderCircle v-if="isSavingModule" class="size-4 animate-spin" />
                        Save module
                      </button>
                      <button
                        type="button"
                        class="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                        @click="cancelModuleEdit"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Read view -->
                <div v-else>
                  <div class="flex items-baseline justify-between gap-3">
                    <h3 class="text-theme-sm font-medium text-gray-900 dark:text-white/90">
                      {{ module.position }}. {{ module.title }}
                    </h3>
                    <div class="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        class="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
                        :aria-label="`Edit ${module.title}`"
                        @click="startModuleEdit(module)"
                      >
                        <Pencil class="size-4" />
                      </button>
                      <button
                        type="button"
                        class="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
                        :aria-label="`Delete ${module.title}`"
                        @click="removeModule(module)"
                      >
                        <Trash2 class="size-4" />
                      </button>
                    </div>
                  </div>
                  <p
                    v-if="module.description"
                    class="mt-1 text-sm text-gray-500 dark:text-gray-400"
                  >
                    {{ module.description }}
                  </p>

                  <ul class="mt-3 space-y-1">
                    <li
                      v-for="lesson in module.lessons"
                      :key="lesson.id"
                      class="flex items-center gap-2.5 rounded px-2 py-2 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.06]"
                    >
                      <PlayCircle
                        v-if="lesson.lessonType === 'video'"
                        class="size-4 shrink-0 text-gray-400"
                      />
                      <FileText v-else class="size-4 shrink-0 text-gray-400" />
                      <span class="text-gray-700 dark:text-gray-300">{{ lesson.title }}</span>
                      <span
                        v-if="lesson.isPreview"
                        class="rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-400"
                      >
                        Preview
                      </span>
                      <span v-if="lesson.durationMinutes" class="text-xs text-gray-400">
                        {{ lesson.durationMinutes }}m
                      </span>
                      <span class="ms-auto flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          class="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.06]"
                          :aria-label="`Edit ${lesson.title}`"
                          @click="startLessonEdit(module, lesson)"
                        >
                          <Pencil class="size-3.5" />
                        </button>
                        <button
                          type="button"
                          class="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-error-600 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-error-400"
                          :aria-label="`Delete ${lesson.title}`"
                          @click="removeLesson(lesson)"
                        >
                          <Trash2 class="size-3.5" />
                        </button>
                      </span>
                    </li>
                  </ul>

                  <p
                    v-if="module.lessons.length === 0"
                    class="mt-3 rounded border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400"
                  >
                    No lessons yet.
                  </p>

                  <button
                    type="button"
                    class="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 disabled:opacity-60 dark:text-brand-400 dark:hover:text-brand-300"
                    :disabled="isSavingLesson"
                    @click="startLesson(module.id)"
                  >
                    <Plus class="size-4" />
                    Add lesson
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>

        <!-- ======================= SIDEBAR FORMS ======================= -->
        <div class="space-y-6">
          <!-- New / edit module -->
          <div
            v-if="moduleMode === 'new'"
            class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <h2 class="text-title-sm text-gray-900 dark:text-white/90">New module</h2>

            <Alert
              v-if="moduleFormError"
              variant="error"
              title="Could not add the module"
              :message="moduleFormError"
              class="mt-5"
            />

            <div class="mt-5 space-y-4">
              <div>
                <label
                  for="new-module-title"
                  class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Title
                </label>
                <input
                  id="new-module-title"
                  v-model.trim="moduleDraft.title"
                  type="text"
                  maxlength="200"
                  placeholder="Getting started"
                  :class="inputClass"
                />
              </div>
              <div>
                <label
                  for="new-module-description"
                  class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Description
                </label>
                <textarea
                  id="new-module-description"
                  v-model.trim="moduleDraft.description"
                  rows="3"
                  placeholder="Optional."
                  :class="textAreaClass"
                ></textarea>
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  class="inline-flex items-center gap-2 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
                  :disabled="isSavingModule"
                  @click="createNewModule"
                >
                  <LoaderCircle v-if="isSavingModule" class="size-4 animate-spin" />
                  Add module
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                  @click="cancelModuleEdit"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>

          <!-- Lesson form, for both adding and editing -->
          <div
            v-if="lessonMode"
            class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <h2 class="text-title-sm text-gray-900 dark:text-white/90">
              {{ lessonMode === 'new' ? 'New lesson' : 'Edit lesson' }}
            </h2>

            <Alert
              v-if="lessonFormError"
              variant="error"
              :title="
                lessonMode === 'new' ? 'Could not add the lesson' : 'Could not save the lesson'
              "
              :message="lessonFormError"
              class="mt-5"
            />

            <div class="mt-5 space-y-4">
              <div>
                <label
                  for="lesson-title"
                  class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Title
                </label>
                <input
                  id="lesson-title"
                  v-model.trim="lessonDraft.title"
                  type="text"
                  maxlength="200"
                  :class="inputClass"
                />
              </div>

              <div>
                <span class="block text-sm font-medium text-gray-700 dark:text-gray-300">Type</span>
                <div class="mt-2 flex gap-2">
                  <label
                    v-for="option in LESSON_TYPES"
                    :key="option.value"
                    class="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm transition-colors"
                    :class="
                      lessonDraft.lessonType === option.value
                        ? 'border-brand-500 bg-brand-50 text-gray-900 dark:border-brand-500 dark:bg-brand-500/10 dark:text-white/90'
                        : 'border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300'
                    "
                  >
                    <input
                      v-model="lessonDraft.lessonType"
                      type="radio"
                      name="lesson-type"
                      :value="option.value"
                      class="size-4 text-brand-600 focus:ring-brand-500"
                    />
                    <component :is="option.icon" class="size-4" />
                    {{ option.label }}
                  </label>
                </div>
              </div>

              <!--
                The video field only exists for a video lesson. Hiding it rather
                than disabling it keeps the form short, and the service clears a
                video URL when the type is an article anyway - so switching type
                mid-edit cannot leave a stray URL on an article.
              -->
              <div v-if="lessonDraft.lessonType === 'video'">
                <label
                  for="video-url"
                  class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Video URL
                </label>
                <input
                  id="video-url"
                  v-model.trim="lessonDraft.videoUrl"
                  type="url"
                  placeholder="https://…"
                  :class="inputClass"
                />
              </div>

              <div>
                <label
                  for="lesson-content"
                  class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Content
                </label>
                <textarea
                  id="lesson-content"
                  v-model="lessonDraft.content"
                  rows="8"
                  placeholder="The lesson body."
                  class="w-full rounded border border-gray-300 bg-white px-3 py-2.5 font-mono text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-white/90 dark:placeholder:text-gray-500"
                ></textarea>
              </div>

              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    for="lesson-duration"
                    class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Duration (minutes)
                  </label>
                  <input
                    id="lesson-duration"
                    v-model.number="lessonDraft.durationMinutes"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="10"
                    :class="inputClass"
                  />
                </div>

                <div class="flex items-end">
                  <label
                    class="flex cursor-pointer items-center gap-2.5 pb-2.5 text-sm text-gray-700 dark:text-gray-300"
                  >
                    <input
                      v-model="lessonDraft.isPreview"
                      type="checkbox"
                      class="size-4 rounded-sm text-brand-600 focus:ring-brand-500"
                    />
                    Free preview
                  </label>
                </div>
              </div>

              <p class="text-xs text-gray-500 dark:text-gray-400">
                A preview lesson is readable without enrolling.
              </p>

              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  class="inline-flex items-center gap-2 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
                  :disabled="isSavingLesson"
                  @click="submitLesson"
                >
                  <LoaderCircle v-if="isSavingLesson" class="size-4 animate-spin" />
                  {{ lessonMode === 'new' ? 'Add lesson' : 'Save lesson' }}
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                  @click="cancelLessonEdit"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>

          <!-- Summary -->
          <div
            class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <h2 class="text-title-sm text-gray-900 dark:text-white/90">Summary</h2>
            <dl class="mt-4 space-y-2.5 text-sm">
              <div class="flex items-center justify-between gap-3">
                <dt class="text-gray-500 dark:text-gray-400">Status</dt>
                <dd class="font-medium text-gray-900 dark:text-white/90">{{ form.status }}</dd>
              </div>
              <div class="flex items-center justify-between gap-3">
                <dt class="text-gray-500 dark:text-gray-400">Price</dt>
                <dd class="font-medium text-gray-900 dark:text-white/90">
                  {{ pesoPreview }}
                </dd>
              </div>
              <div class="flex items-center justify-between gap-3">
                <dt class="text-gray-500 dark:text-gray-400">Modules</dt>
                <dd class="font-medium text-gray-900 dark:text-white/90">{{ modules.length }}</dd>
              </div>
              <div class="flex items-center justify-between gap-3">
                <dt class="text-gray-500 dark:text-gray-400">Lessons</dt>
                <dd class="font-medium text-gray-900 dark:text-white/90">{{ lessonCount }}</dd>
              </div>
            </dl>

            <p class="mt-5 text-xs text-gray-500 dark:text-gray-400">
              Changes to modules and lessons save immediately. Course details save with the button
              above.
            </p>
          </div>

          <!-- Destructive actions -->
          <div
            v-if="!isNew && courseId"
            class="rounded-lg border border-error-200 bg-white p-6 dark:border-error-500/20 dark:bg-white/[0.03]"
          >
            <h2 class="text-title-sm text-gray-900 dark:text-white/90">Remove course</h2>
            <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
              Deleting a course removes its modules, lessons and every student's progress record.
              This cannot be undone.
            </p>
            <button
              type="button"
              class="mt-4 inline-flex items-center gap-2 rounded-md bg-error-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-error-700 disabled:opacity-60"
              :disabled="isDeleting"
              @click="confirmDelete = true"
            >
              <Trash2 class="size-4" />
              Delete this course
            </button>
          </div>
        </div>
      </form>

      <!-- Delete confirmation -->
      <Modal v-if="confirmDelete" full-screen-backdrop @close="confirmDelete = false">
        <template #body>
          <div
            class="relative w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-theme-lg dark:bg-gray-900"
            role="dialog"
            aria-modal="true"
          >
            <h3 class="text-title-sm text-gray-900 dark:text-white/90">
              Delete “{{ form.title }}”?
            </h3>
            <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
              {{ modules.length }} module{{ modules.length === 1 ? '' : 's' }},
              {{ lessonCount }} lesson{{ lessonCount === 1 ? '' : 's' }} and all enrolled students'
              progress will be removed. This cannot be undone.
            </p>
            <Alert
              v-if="deleteError"
              variant="error"
              title="Could not delete"
              :message="deleteError"
              class="mt-4"
            />
            <div class="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-md bg-error-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-error-700 disabled:opacity-60"
                :disabled="isDeleting"
                @click="removeCourse"
              >
                <LoaderCircle v-if="isDeleting" class="size-4 animate-spin" />
                Delete permanently
              </button>
              <button
                type="button"
                class="inline-flex items-center justify-center rounded-md border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                @click="confirmDelete = false"
              >
                Keep the course
              </button>
            </div>
          </div>
        </template>
      </Modal>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  FileText,
  FolderTree,
  LoaderCircle,
  Pencil,
  PlayCircle,
  Plus,
  Trash2,
  Video,
} from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import Alert from '@/components/ui/Alert.vue'
import Modal from '@/components/ui/Modal.vue'
import {
  canClaimNewCourses,
  createInstructorCourse,
  createLesson,
  createModule,
  deleteInstructorCourse,
  deleteLesson,
  deleteModule,
  getInstructorCourse,
  listCategories,
  listCourseCurriculum,
  updateInstructorCourse,
  updateLesson,
  updateModule,
} from '@/services/instructor.service'
import type { CourseModule } from '@/services/instructor.service'
// Invalidated on module writes: the student dashboard caches module ids per
// course, so a new or removed module is otherwise invisible until a reload.
import { forgetModuleCache } from '@/services/dashboard.service'
import type { CourseLevel, CourseStatus, Lesson, LessonType } from '@/types'
import { formatPeso } from '@/types'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

/**
 * One component, two routes.
 *
 * `courses/create` has no `id` and `courses/:id/edit` has one, so the route
 * decides whether this is a create or an edit rather than a second page
 * duplicating every field.
 *
 * `isNew` is a ref rather than a constant for one reason: the first save on
 * `/courses/create` creates the course and replaces the URL with
 * `/courses/:id/edit`, and Vue reuses this same component for that. A constant
 * would leave the page calling itself "New course" with a stale breadcrumb and
 * no delete button, immediately after a successful create. It is only ever set
 * to false, and only once a course genuinely exists - so the form is never in a
 * state where it has forgotten what it already wrote.
 */
const routeId = String(route.params.id ?? '')
const isNew = ref(routeId === '')
const courseId = ref(routeId)

const categories = ref<Array<{ id: string; name: string }>>([])
const canClaim = ref<boolean | null>(null)

const isLoading = ref(true)
const fatalError = ref('')
const isSaving = ref(false)
const saveError = ref('')
const isDeleting = ref(false)
const deleteError = ref('')
const confirmDelete = ref(false)

const form = ref({
  title: '',
  slug: '',
  description: '',
  categoryId: '',
  level: 'beginner' as CourseLevel,
  status: 'draft' as CourseStatus,
  durationMinutes: null as number | null,
  passingScore: null as number | null,
})

/**
 * Pesos as typed, kept separately from the form.
 *
 * The field is a string because an empty price input is an empty string, not a
 * number, and `v-model` on a number input yields `''` when cleared. Storing the
 * raw string here and converting on read and on submit keeps both facts visible:
 * what the instructor typed, and exactly what will be written.
 */
const pesoInput = ref('')
const priceCentavos = computed(() => {
  const parsed = Number.parseFloat(pesoInput.value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  // Round rather than truncate: ₱1.999 typed as a peso figure is ₱200 in
  // centavos, and truncating would quietly charge ₱199.90.
  return Math.round(parsed * 100)
})
/**
 * An integer column, or null.
 *
 * `v-model.number` on a cleared number input yields `''`, not null, and `''`
 * reaching an integer column is `22P02 invalid input syntax for type integer` -
 * the save fails with a database message about syntax rather than anything the
 * instructor can act on, for a field they deliberately left blank. NaN arrives
 * the same way when the input holds something unparseable.
 *
 * `lessonDraft.durationMinutes` has the identical shape and the identical
 * column, so this is used for both rather than leaving one of them to throw.
 */
function integerOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value)
  if (!Number.isFinite(parsed)) return null
  return Math.round(parsed)
}

const pesoPreview = computed(() =>
  pesoInput.value.trim() === '' || priceCentavos.value === 0
    ? 'Free'
    : formatPeso(priceCentavos.value),
)

const modules = ref<CourseModule[]>([])
const isLoadingModules = ref(false)
const moduleError = ref('')
const isSavingModule = ref(false)
const moduleFormError = ref('')
const moduleMode = ref<'new' | 'edit' | null>(null)
const editingModuleId = ref<string | null>(null)
const moduleDraft = ref({ title: '', description: '' })

const lessonMode = ref<'new' | 'edit' | null>(null)
const lessonModuleId = ref<string | null>(null)
const editingLessonId = ref<string | null>(null)
const isSavingLesson = ref(false)
const lessonFormError = ref('')
const lessonDraft = ref({
  title: '',
  lessonType: 'article' as LessonType,
  content: '',
  durationMinutes: null as number | null,
  isPreview: false,
  videoUrl: '',
})

const inputClass =
  'mt-1.5 w-full rounded border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-white/90 dark:placeholder:text-gray-500'

const selectClass =
  'mt-1.5 w-full rounded border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-white/90'

const textAreaClass =
  'mt-1.5 w-full rounded border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-white/90 dark:placeholder:text-gray-500'

const LEVELS: CourseLevel[] = ['beginner', 'intermediate', 'advanced']

const LEVEL_LABELS: Record<CourseLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

const STATUS_OPTIONS: Array<{ value: CourseStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
]

const STATUS_HINTS: Record<CourseStatus, string> = {
  draft: 'Only you can see it. Use this while the course is still being built.',
  published: 'Visible in the catalogue. Students can enroll.',
  archived: 'Hidden from the catalogue but kept, with its student records intact.',
}

const LESSON_TYPES: Array<{ value: LessonType; label: string; icon: typeof FileText }> = [
  { value: 'article', label: 'Article', icon: FileText },
  { value: 'video', label: 'Video', icon: Video },
]

const FIELD_HELP =
  'A title and a slug are the only required fields. Everything else can be filled in later.'

const CLAIM_REFUSED_MESSAGE =
  'Only an administrator can assign an instructor to a course, so a new course cannot be created from your account. Ask an administrator to create it and assign you.'

/**
 * A slug suggestion from the title.
 *
 * Derived rather than authored: an instructor typing "Introduction to Web
 * Development" should not also have to invent a URL. It only fills a slug the
 * instructor has not touched - once they edit it themselves, `slugTouched`
 * stops this overwriting their choice.
 */
const derivedSlug = computed(() =>
  form.value.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200),
)

/** True once the instructor has edited the slug themselves. */
const slugTouched = ref(false)
watch(
  () => form.value.title,
  () => {
    if (isNew.value && !slugTouched.value) form.value.slug = derivedSlug.value
  },
)

/**
 * Marked from the slug field's own `@input`, never by watching `form.slug`.
 *
 * Watching the slug looked equivalent and was not. This watcher *writes* the slug, so
 * watching it fired on the instructor's first keystroke and set `slugTouched` before they
 * had touched it. From the second character onward the title stopped updating the slug, so
 * typing "Introduction to Web Development" produced the slug "i" - with the "Edited by
 * hand" warning displayed, because the flag was true and the value no longer matched.
 *
 * `admin/Categories.vue` already had this right and says so in a comment there.
 */
function markSlugTouched(): void {
  slugTouched.value = true
}

const lessonCount = computed(() =>
  modules.value.reduce((total, module) => total + module.lessons.length, 0),
)

/**
 * The status as last read or saved, used to spot the draft -> published edge.
 *
 * Declared before `save` so the publish-stamping logic has one source of truth
 * for "what was it a moment ago" rather than comparing against a value set
 * halfway through a load.
 */
const statusAtLoad = ref<CourseStatus>('draft')

function messageOfUnknown(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

async function load(): Promise<void> {
  isLoading.value = true
  fatalError.value = ''
  try {
    await auth.ensureReady()

    categories.value = await listCategories()

    if (isNew.value) {
      // Asked on the create route only. It answers whether the submit button will
      // work at all, and saying so before the first keystroke is more useful than
      // a refusal after the form is filled in.
      canClaim.value = await canClaimNewCourses(auth.profile?.id ?? '')
      isLoading.value = false
      return
    }

    const course = await getInstructorCourse(courseId.value)
    if (!course) {
      fatalError.value =
        'That course does not exist, or it is not assigned to you. Only courses assigned to you can be edited.'
      return
    }

    // The slug is loaded into `form` before `slugTouched` is set, so loading an
    // existing course does not look like the instructor having typed it.
    form.value = {
      title: course.title,
      slug: course.slug,
      description: course.description ?? '',
      categoryId: course.categoryId ?? '',
      level: course.level,
      status: course.status,
      durationMinutes: course.durationMinutes,
      passingScore: course.passingScore,
    }
    pesoInput.value = course.priceCentavos > 0 ? (course.priceCentavos / 100).toFixed(2) : ''
    statusAtLoad.value = course.status

    // Set after the form is populated on purpose. Marking the slug as touched
    // during load would look like the instructor having typed it, which then
    // suppresses the title-derived suggestion forever after.
    slugTouched.value = true

    isLoading.value = false
    void loadModules()
  } catch (error) {
    fatalError.value = messageOfUnknown(error, 'Could not open the course editor.')
  } finally {
    isLoading.value = false
  }
}

async function loadModules(): Promise<void> {
  if (!courseId.value) return
  isLoadingModules.value = true
  moduleError.value = ''
  try {
    modules.value = await listCourseCurriculum(courseId.value)
  } catch (error) {
    moduleError.value = messageOfUnknown(error, 'Could not load the curriculum.')
  } finally {
    isLoadingModules.value = false
  }
}

async function save(): Promise<void> {
  saveError.value = ''
  isSaving.value = true
  try {
    const title = form.value.title.trim()
    const slug = form.value.slug.trim()
    if (!title || !slug) {
      saveError.value = 'A title and a slug are both required.'
      return
    }

    const shared = {
      title,
      slug,
      description: form.value.description.trim() === '' ? null : form.value.description,
      categoryId: form.value.categoryId === '' ? null : form.value.categoryId,
      level: form.value.level,
      priceCentavos: priceCentavos.value,
      // Normalised here rather than at the input. `form.durationMinutes` and
      // `form.passingScore` are typed `number | null`, which is what the field
      // holds when it holds something - the `''` Vue's `.number` modifier
      // produces for a cleared box does not fit that type, and neither does NaN.
      // Both are integer columns, so both are converted at the one point where
      // the write is assembled.
      durationMinutes: integerOrNull(form.value.durationMinutes),
      passingScore: integerOrNull(form.value.passingScore),
    }

    if (isNew.value || !courseId.value) {
      if (!auth.profile) {
        saveError.value =
          'Your profile has not loaded yet, so the course cannot be linked to you. Try again in a moment.'
        return
      }

      const created = await createInstructorCourse(shared, auth.profile.id)
      courseId.value = created.id
      // Flipped before the URL replace, so the header, the breadcrumb and the
      // delete panel all read as an edit screen the moment the create succeeds.
      isNew.value = false
      statusAtLoad.value = created.status
      // Replaces the URL so a refresh or a shared link opens the saved course
      // rather than a second empty create form.
      await router.replace(`/instructor/courses/${created.id}/edit`)
      void loadModules()
      return
    }

    // `published_at` is stamped only on the transition into published. Setting
    // it on every save of a published course would make "published on" drift to
    // whenever someone last edited a typo.
    const wasPublished = statusAtLoad.value === 'published'
    const isNowPublished = form.value.status === 'published'

    await updateInstructorCourse(courseId.value, {
      ...shared,
      status: form.value.status,
      ...(isNowPublished && !wasPublished ? { publishedAt: new Date().toISOString() } : {}),
    })

    statusAtLoad.value = form.value.status
  } catch (error) {
    saveError.value = messageOfUnknown(error, 'Could not save this course.')
  } finally {
    isSaving.value = false
  }
}

async function removeCourse(): Promise<void> {
  if (!courseId.value) return
  isDeleting.value = true
  deleteError.value = ''
  try {
    await deleteInstructorCourse(courseId.value)
    await router.push('/instructor/courses')
  } catch (error) {
    deleteError.value = messageOfUnknown(error, 'Could not delete this course.')
  } finally {
    isDeleting.value = false
  }
}

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

function startModule(): void {
  moduleFormError.value = ''
  moduleMode.value = 'new'
  editingModuleId.value = null
  moduleDraft.value = { title: '', description: '' }
}

function startModuleEdit(module: CourseModule): void {
  moduleFormError.value = ''
  moduleMode.value = 'edit'
  editingModuleId.value = module.id
  moduleDraft.value = { title: module.title, description: module.description ?? '' }
  cancelLessonEdit()
}

function cancelModuleEdit(): void {
  moduleMode.value = null
  editingModuleId.value = null
  moduleFormError.value = ''
}

async function createNewModule(): Promise<void> {
  if (!courseId.value) return
  if (!moduleDraft.value.title.trim()) {
    moduleFormError.value = 'A module needs a title.'
    return
  }

  isSavingModule.value = true
  moduleFormError.value = ''
  try {
    await createModule(courseId.value, {
      title: moduleDraft.value.title.trim(),
      description:
        moduleDraft.value.description.trim() === '' ? null : moduleDraft.value.description,
    })
    forgetModuleCache(courseId.value)
    cancelModuleEdit()
    // Reloaded rather than pushed locally, so the position the database
    // assigned is what shows. Positions are unique per course, and a guess
    // would collide.
    await loadModules()
  } catch (error) {
    moduleFormError.value = messageOfUnknown(error, 'Could not add the module.')
  } finally {
    isSavingModule.value = false
  }
}

async function saveModule(moduleId: string): Promise<void> {
  if (!moduleDraft.value.title.trim()) {
    moduleFormError.value = 'A module needs a title.'
    return
  }

  isSavingModule.value = true
  moduleFormError.value = ''
  try {
    await updateModule(moduleId, {
      title: moduleDraft.value.title.trim(),
      description:
        moduleDraft.value.description.trim() === '' ? null : moduleDraft.value.description,
    })
    forgetModuleCache(courseId.value)
    cancelModuleEdit()
    await loadModules()
  } catch (error) {
    moduleFormError.value = messageOfUnknown(error, 'Could not save the module.')
  } finally {
    isSavingModule.value = false
  }
}

async function removeModule(module: CourseModule): Promise<void> {
  // A native confirm rather than a modal, because this cascades to lessons and
  // progress and the browser's own "are you sure" is one click fewer than a
  // dialog that has to be styled to match the app.
  if (!window.confirm(`Delete "${module.title}" and its ${module.lessons.length} lesson(s)?`)) {
    return
  }

  isSavingModule.value = true
  moduleError.value = ''
  try {
    await deleteModule(module.id)
    forgetModuleCache(courseId.value)
    await loadModules()
  } catch (error) {
    moduleError.value = messageOfUnknown(error, 'Could not delete the module.')
  } finally {
    isSavingModule.value = false
  }
}

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

function startLesson(moduleId: string): void {
  lessonFormError.value = ''
  lessonMode.value = 'new'
  lessonModuleId.value = moduleId
  editingLessonId.value = null
  lessonDraft.value = {
    title: '',
    lessonType: 'article',
    content: '',
    durationMinutes: null,
    isPreview: false,
    videoUrl: '',
  }
}

function startLessonEdit(module: CourseModule, lesson: Lesson): void {
  lessonFormError.value = ''
  lessonMode.value = 'edit'
  lessonModuleId.value = module.id
  editingLessonId.value = lesson.id
  lessonDraft.value = {
    title: lesson.title,
    lessonType: lesson.lessonType,
    content: lesson.content ?? '',
    durationMinutes: lesson.durationMinutes,
    isPreview: lesson.isPreview,
    videoUrl: lesson.videoUrl ?? '',
  }
}

function cancelLessonEdit(): void {
  lessonMode.value = null
  lessonModuleId.value = null
  editingLessonId.value = null
  lessonFormError.value = ''
}

async function submitLesson(): Promise<void> {
  const moduleId = lessonModuleId.value
  if (!moduleId) return
  if (!lessonDraft.value.title.trim()) {
    lessonFormError.value = 'A lesson needs a title.'
    return
  }

  const payload = {
    title: lessonDraft.value.title.trim(),
    lessonType: lessonDraft.value.lessonType,
    content: lessonDraft.value.content.trim() === '' ? null : lessonDraft.value.content,
    // Same column, same `.number` behaviour, same reason. See integerOrNull.
    durationMinutes: integerOrNull(lessonDraft.value.durationMinutes),
    isPreview: lessonDraft.value.isPreview,
    // Nulled rather than left behind when the type is an article: a stray URL on
    // an article is data that says a video exists when none does.
    videoUrl:
      lessonDraft.value.lessonType === 'video' && lessonDraft.value.videoUrl.trim() !== ''
        ? lessonDraft.value.videoUrl.trim()
        : null,
  }

  isSavingLesson.value = true
  lessonFormError.value = ''
  try {
    if (lessonMode.value === 'edit' && editingLessonId.value) {
      await updateLesson(editingLessonId.value, payload)
    } else {
      await createLesson(moduleId, payload)
    }
    cancelLessonEdit()
    await loadModules()
  } catch (error) {
    lessonFormError.value = messageOfUnknown(error, 'Could not save the lesson.')
  } finally {
    isSavingLesson.value = false
  }
}

async function removeLesson(lesson: Lesson): Promise<void> {
  if (!window.confirm(`Delete the lesson "${lesson.title}"?`)) return
  isSavingLesson.value = true
  moduleError.value = ''
  try {
    await deleteLesson(lesson.id)
    await loadModules()
  } catch (error) {
    moduleError.value = messageOfUnknown(error, 'Could not delete the lesson.')
  } finally {
    isSavingLesson.value = false
  }
}

onMounted(load)
</script>
