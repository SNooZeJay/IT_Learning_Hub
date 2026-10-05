import './assets/main.css'
import 'jsvectormap/dist/jsvectormap.css'
import 'flatpickr/dist/flatpickr.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import VueApexCharts from 'vue3-apexcharts'
import { initRTL } from './composables/useRTL'
import { useAuthStore } from './stores/auth'

initRTL()

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(VueApexCharts)

/**
 * Resolve the session, then mount.
 *
 * Wrapped in a function rather than written as a top-level `await` because the
 * default esbuild target rejects top-level await, and raising the target would
 * drop browser support for no real gain.
 *
 * Mounting after the session resolves means the first paint is the correct
 * screen rather than a signed-out flash on a page load that was actually
 * authenticated. `index.html` shows a splash until this replaces it.
 */
async function bootstrap(): Promise<void> {
  try {
    await useAuthStore(pinia).initialize()
  } catch (error) {
    // A failed session lookup must not leave a blank page. The store already
    // fails closed when Supabase is unconfigured, so mounting here is the
    // recovery path, not an invitation to retry.
    console.error('[bootstrap] session lookup failed, mounting anyway', error)
  }
  app.mount('#app')
}

void bootstrap()
