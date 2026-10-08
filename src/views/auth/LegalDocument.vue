<template>
  <!--
    The legal documents, on the same surface as the public pages.

    These were built on the application shell, which made them look like an internal
    screen that happened to be public: a sidebar-shaped layout, an admin breadcrumb and a
    "Go back" button. They are read by people who have not signed in, arriving from the
    sign-in form, so they wear the same warm canvas and the same floating header as every
    other page those people can reach. Reusing `AuthShell` is what makes that true by
    construction rather than by copying its colours.
  -->
  <AuthShell :title="title" :description="subtitle" width="wide">
    <div class="mx-auto w-full max-w-3xl">
      <!--
        The date and the template notice together, once. A document that dates itself in
        several places is a document that will disagree with itself.
      -->
      <p class="text-sm text-lp-slate">Last updated {{ LAST_UPDATED }}.</p>

      <!--
        Contents, because a legal page nobody can navigate is a legal page nobody reads.
        Anchor links rather than a drawer: the document is one screen long on a laptop and
        the reader can see where they are without opening anything.
      -->
      <nav class="mt-6 rounded-2xl border border-lp-line bg-lp-card/70 p-5" aria-label="Contents">
        <h2 class="text-[13px] font-semibold tracking-tight text-lp-ink">Contents</h2>
        <ol class="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          <li v-for="(section, index) in sections" :key="section.id">
            <a
              :href="`#${section.id}`"
              class="text-lp-accent underline-offset-4 transition hover:underline"
            >
              {{ index + 1 }}. {{ section.heading }}
            </a>
          </li>
        </ol>
      </nav>

      <article class="mt-8 grid gap-7">
        <section v-for="(section, index) in sections" :key="section.id" :id="section.id">
          <h2 class="text-[17px] font-semibold tracking-tight text-lp-ink">
            <span class="text-lp-slate">{{ index + 1 }}.</span> {{ section.heading }}
          </h2>
          <div class="mt-2 grid gap-2.5 text-[15px] leading-relaxed text-lp-slate">
            <p v-for="(paragraph, p) in section.body" :key="p">{{ paragraph }}</p>
          </div>
        </section>
      </article>

      <p class="mt-10 border-t border-lp-line pt-5 text-sm text-lp-slate">
        Questions about this document go to your school administrator.
      </p>
    </div>
  </AuthShell>
</template>

<script setup lang="ts">
import AuthShell from '@/components/auth/AuthShell.vue'

/**
 * The shared shell for the two legal documents.
 *
 * One component rather than two pages, because the structure - contents, numbered
 * sections, a date - is identical and only the words differ. Two copies of a document shell
 * is two places for the numbering to drift out of step with the headings.
 */
interface Section {
  id: string
  heading: string
  body: string[]
}

defineProps<{
  title: string
  subtitle: string
  sections: Section[]
}>()

const LAST_UPDATED = '8 October 2026'
</script>
