<template>
  <!--
    The certificate itself.

    Everything inside `sheet` is the document; everything outside is the app chrome around
    it. That split is what makes the print rule possible: printing hides the app and leaves
    this, so "save as PDF" produces the certificate rather than a screenshot of a page
    containing one.

    The document is not themed. A certificate is a document with a fixed appearance: it
    has to look the same on a cream canvas, on a dark canvas, and on a printed page, and a
    token that follows the theme would make the printed version differ from the screen. So
    the colours here are literal, and they are the landing page's green rather than a new
    palette. That is deliberate and it is the only place in the app where hard-coded colour
    is the right call.
  -->
  <article
    ref="sheet"
    class="sheet mx-auto w-full max-w-[1000px] bg-white text-[#17150f] shadow-theme-lg ring-1 ring-black/5 print:max-w-none print:shadow-none print:ring-0"
  >
    <!-- A double rule, the way a printed certificate is bordered. -->
    <div class="border-[3px] border-[#1f6b46] p-2 sm:p-2.5">
      <div class="border border-[#bcd6c4] px-5 py-8 sm:px-10 sm:py-12">
        <!--
          The ribbon seal. Drawn rather than shipped as an image: it is three elements and
          a gradient, it scales to any size without a second asset, and it prints in
          greyscale without turning into a grey box.
        -->
        <div class="flex items-start justify-between gap-4">
          <div class="relative size-16 shrink-0 sm:size-20" aria-hidden="true">
            <span
              class="absolute inset-x-1 top-0 h-10 rounded-full bg-gradient-to-br from-[#e7c765] via-[#c9a227] to-[#8a6d15] shadow-sm ring-2 ring-[#8a6d15]/40"
            />
            <span
              class="absolute inset-x-2 top-1.5 h-7 rounded-full bg-gradient-to-br from-white/85 via-[#f0e2cd]/70 to-transparent"
            />
            <span class="absolute inset-x-0 bottom-0 flex justify-center gap-1">
              <span class="h-6 w-2.5 -skew-x-12 bg-[#c9a227]" />
              <span class="h-7 w-2.5 bg-[#e7c765]" />
              <span class="h-6 w-2.5 skew-x-12 bg-[#c9a227]" />
            </span>
          </div>

          <div class="min-w-0 flex-1 text-center">
            <h2
              class="font-display text-4xl font-extrabold uppercase leading-none tracking-[0.06em] text-[#1f6b46] sm:text-6xl"
            >
              Certificate
            </h2>
            <p
              class="mt-2 text-xs font-medium uppercase tracking-[0.34em] text-[#5c574a] sm:text-sm"
            >
              of Completion
            </p>
          </div>

          <BrandMark class="size-14 shrink-0 sm:size-20" />
        </div>

        <p class="mt-8 text-center text-sm text-[#5c574a] sm:text-base">This is to certify that</p>

        <!--
          The name is the reason the document exists, so it gets the largest type on the
          page and a rule to sit on. `break-words` because a long name must wrap rather
          than push the layout sideways on a phone.
        -->
        <p
          class="mx-auto mt-3 max-w-[90%] break-words border-b border-[#1f6b46] pb-2 text-center font-display text-3xl italic leading-tight text-[#1f6b46] sm:text-5xl"
        >
          {{ certificate.studentName }}
        </p>

        <p
          class="mx-auto mt-5 max-w-3xl text-center text-sm leading-relaxed text-[#3d3a32] sm:mt-6 sm:text-base"
        >
          has successfully completed
          <span class="font-semibold text-[#17150f]">{{ certificate.courseTitle }}</span>
          through IT Learning Hub, meeting every requirement the course sets. This certificate is
          awarded in recognition of that achievement.
        </p>

        <p class="mt-5 text-center text-sm font-semibold text-[#17150f] sm:text-base">
          Awarded on {{ awardedOn }}
        </p>

        <!--
          The signature block.

          Two named people and no drawn signature lines that imply a handwritten mark
          nobody made. Where a name is unknown the line says so rather than being left
          blank, because a blank line on a certificate reads as an oversight and a
          sentence reads as a fact.
        -->
        <div class="mt-10 grid gap-8 sm:mt-14 sm:grid-cols-2 sm:gap-16" aria-label="Issued by">
          <div class="text-center">
            <p class="text-base font-bold text-[#1f6b46] sm:text-lg">
              {{ certificate.adminName ?? 'IT Learning Hub' }}
            </p>
            <div class="mx-auto mt-2 max-w-[15rem] border-t border-[#b9b3a3] pt-1.5">
              <p class="text-xs text-[#5c574a] sm:text-sm">Administrator, IT Learning Hub</p>
            </div>
          </div>

          <div class="text-center">
            <template v-if="instructorNames">
              <p class="text-base font-bold text-[#1f6b46] sm:text-lg">
                {{ instructorNames }}
              </p>
              <div class="mx-auto mt-2 max-w-[15rem] border-t border-[#b9b3a3] pt-1.5">
                <p class="text-xs text-[#5c574a] sm:text-sm">Course Instructor</p>
              </div>
            </template>
            <template v-else>
              <p class="text-base font-bold text-[#8a8474] sm:text-lg">Not recorded</p>
              <div class="mx-auto mt-2 max-w-[15rem] border-t border-[#b9b3a3] pt-1.5">
                <p class="text-xs text-[#5c574a] sm:text-sm">Course Instructor</p>
              </div>
            </template>
          </div>
        </div>

        <!--
          The verification line. A certificate number that cannot be checked is a picture
          of a certificate. This one names the number and the score it was issued against,
          which is what somebody verifying it would compare against the record.
        -->
        <div
          class="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 border-t border-[#e7e0d2] pt-4 text-center text-[11px] text-[#8a8474] sm:text-xs"
        >
          <span class="font-mono">Certificate {{ certificate.certificateNumber }}</span>
          <span aria-hidden="true">·</span>
          <span>Final score {{ certificate.finalPercentage }}%</span>
        </div>
      </div>
    </div>

    <!--
      A revoked certificate is stamped rather than hidden. Hiding it would tell a student a
      certificate they were issued never existed, and `issue_certificate` refuses to issue
      another one, so silence would be an unexplainable dead end.
    -->
    <p
      v-if="certificate.revokedAt"
      class="border-t-4 border-double border-error-600 bg-error-50 px-6 py-4 text-center"
    >
      <span class="block text-sm font-bold uppercase tracking-[0.2em] text-error-700">
        Revoked
      </span>
      <span class="mt-1 block text-sm text-error-800">
        {{ revokedOn }}{{ certificate.revokeReason ? ` — ${certificate.revokeReason}` : '' }}
      </span>
    </p>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BrandMark from '@/components/common/BrandMark.vue'
import { formatDate } from '@/types'
import type { CertificateDocument } from '@/services/certificate.service'

/**
 * The printed document.
 *
 * Purely presentational: every value arrives already resolved by
 * `certificate_signatories`. Nothing here fetches, and nothing here decides whether the
 * certificate is real — the page that renders this owns that, so there is one place where
 * a missing or revoked certificate is explained.
 *
 * Names are printed, not linked. A certificate that reached into the app to follow a name
 * would be a different document depending on who opened it.
 */
const props = defineProps<{ certificate: CertificateDocument }>()

const awardedOn = computed(() => formatDate(props.certificate.issuedAt))
const revokedOn = computed(() =>
  props.certificate.revokedAt ? formatDate(props.certificate.revokedAt) : '',
)

/**
 * One instructor, or several joined. A course taught by two names both signed it, so both
 * are printed; "and" reads better on a document than a comma.
 */
const instructorNames = computed(() => {
  const names = props.certificate.instructors.map((entry) => entry.name)
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
})
</script>
