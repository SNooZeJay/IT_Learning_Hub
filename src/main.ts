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
 * The lookup starts here but the mount does NOT wait for it. Be precise about
 * what that buys, because the first version of this comment oversold it: the
 * router guard awaits the same shared promise before resolving the first
 * navigation - public routes included - so routed content still cannot paint
 * until the session is known. What mounting early buys is overlap: compiling
 * and mounting the app happens DURING the network round trip instead of after
 * it, and the splash (which now outlives the mount - see below) covers the
 * wait. Measured on a throttled phone, that overlap is the single largest
 * slice of every public page's LCP improvement.
 *
 * Guarded routes still resolve only after the session is known, because the
 * guard has not moved. Mounting first cannot flash a signed-out screen
 * either: `App.vue` renders providers and an empty `RouterView` behind the
 * splash until the guard resolves, so there is no wrong screen to see.
 */
function bootstrap(): void {
  try {
    const ready = useAuthStore(pinia).initialize()
    void ready.catch((error) => {
      // A failed session lookup must not leave a blank page. The store already
      // fails closed when Supabase is unconfigured, so mounting here is the
      // recovery path, not an invitation to retry.
      console.error('[bootstrap] session lookup failed, mounting anyway', error)
    })
  } catch (error) {
    // `useAuthStore()` itself throwing (a broken Pinia install) is the one
    // failure the guard cannot cover, because nothing will ever navigate.
    console.error('[bootstrap] session lookup failed, mounting anyway', error)
  }
  app.mount('#app')
  // The splash in index.html lives outside `#app` so mounting cannot destroy
  // it. It comes down here, once the first navigation - session wait included -
  // has resolved and there is a real route to look at instead. Removing it on
  // mount would restore the blank shell on slow connections.
  void router
    .isReady()
    .catch(() => {})
    .then(() => {
      document.getElementById('app-loading')?.remove()
    })
}

bootstrap()
