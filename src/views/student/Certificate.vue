<template>
  <div>
    <PageHeader
      title="Certificate of completion"
      subtitle="A copy you can keep or print."
      :crumbs="[
        { label: 'Student', to: '/student/dashboard' },
        { label: 'My grades', to: '/student/grades' },
        { label: 'Certificate' },
      ]"
    >
      <template #actions>
        <Button variant="outline" :disabled="isLoading" @click="load">
          <RotateCcw class="size-4" :class="{ 'animate-spin': isLoading }" aria-hidden="true" />
          Refresh
        </Button>
        <Button :disabled="!certificate || isLoading" @click="print">
          <Download class="size-4" aria-hidden="true" />
          Save as PDF
        </Button>
      </template>
    </PageHeader>

    <!--
      The reasons this page can be empty, each one a sentence a person can act on. The
      student reached this route from a certificate they hold or from a link that does not
      resolve, and those need different words.
    -->
    <Alert
      v-if="errorMessage"
      variant="error"
      title="This certificate could not be opened"
      :message="errorMessage"
      class="mb-6"
    >
      <template #action>
        <RouterLink to="/student/grades" class="text-sm font-medium underline underline-offset-2">
          Back to My grades
        </RouterLink>
      </template>
    </Alert>

    <LoadingState v-else-if="isLoading" label="Opening your certificate" />

    <div v-else-if="certificate" class="pb-4">
      <!--
        Stated rather than left to be discovered. A revoked certificate still prints, and
        somebody about to hand one to an employer should know it carries that stamp before
        they save it rather than after.
      -->
      <Alert
        v-if="certificate.revokedAt"
        variant="warning"
        title="This certificate has been revoked"
        :message="`It was withdrawn${certificate.revokeReason ? ` — ${certificate.revokeReason}` : ''}. You can still save a copy, but it shows the revocation.`"
        class="mb-6"
      />

      <p class="mb-4 max-w-2xl text-sm text-slate">
        Everything printed below is the certificate. “Save as PDF” opens your browser's print dialog
        — choose “Save as PDF” as the destination, and turn off headers and footers so nothing else
        appears on the page.
      </p>

      <CertificateSheet :certificate="certificate" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Download, RotateCcw } from 'lucide-vue-next'
import PageHeader from '@/components/common/PageHeader.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import Alert from '@/components/ui/Alert.vue'
import Button from '@/components/ui/Button.vue'
import CertificateSheet from '@/components/certificate/CertificateSheet.vue'
import { loadCertificateDocument, type CertificateDocument } from '@/services/certificate.service'
import { useToast } from '@/composables/useToast'

/**
 * The certificate page.
 *
 * Holds the two things the document deliberately does not: whether the certificate can be
 * read, and the actions around it. Keeping both here means the sheet stays a document and
 * not a second place where "this is revoked" is decided.
 *
 * `certificateId` comes from the route and is validated before it reaches the database.
 * The RPC refuses a certificate the caller does not hold regardless, but a route parameter
 * that is not an id at all should be refused here rather than sent and reported as a
 * database problem.
 */
const route = useRoute()
const toast = useToast()

const certificate = ref<CertificateDocument | null>(null)
const errorMessage = ref('')
const isLoading = ref(true)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const certificateId = computed(() => {
  const raw = route.params.id
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' && UUID.test(value) ? value : null
})

async function load(): Promise<void> {
  if (!certificateId.value) {
    errorMessage.value = 'That link does not point at a certificate.'
    isLoading.value = false
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  try {
    certificate.value = await loadCertificateDocument(certificateId.value)
  } catch (error) {
    certificate.value = null
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'This certificate could not be opened. Try again in a moment.'
  } finally {
    isLoading.value = false
  }
}

/**
 * Print rather than screenshot or canvas-to-PNG.
 *
 * A canvas export would re-draw the certificate as pixels and lose the text layer, so the
 * saved file could not be searched, selected or read aloud. Printing keeps real text, and
 * the print stylesheet in `main.css` hides the application chrome, so the page that comes
 * out is the document and nothing else.
 */
function print(): void {
  window.print()
  toast.info('Print dialog opened', 'Choose “Save as PDF” as the destination to keep a copy.')
}

onMounted(load)
</script>
