import './assets/main.css'
import 'jsvectormap/dist/jsvectormap.css'
import 'flatpickr/dist/flatpickr.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { initRTL } from './composables/useRTL'
import { useAuthStore } from './stores/auth'

initRTL()

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

/**
 * ApexCharts is deliberately NOT registered globally.
 *
 * `app.use(VueApexCharts)` here put the whole library - 518KB, about 140KB gzipped -
 * into the entry chunk, so every visitor downloaded and parsed it before the landing
 * page or the sign-in form could paint, and neither of those draws a chart. Lighthouse
 * named it as the single largest opportunity on a throttled phone: 1670ms of unused
 * JavaScript.
 *
 * Nothing depended on the registration. The three components that draw a chart -
 * admin Analytics, instructor Analytics and TrendChart - each import VueApexCharts
 * locally, so each now pulls the library in with its own route chunk and only when
 * that route is opened. There is no `<apexchart>` element anywhere in the app for the
 * global name to have served.
 */

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
