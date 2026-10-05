import { copyFileSync, existsSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'

/**
 * Emit `404.html` as a copy of `index.html`.
 *
 * A safety net for the SPA fallback, not the fallback itself.
 *
 * The fallback that actually serves requests is the rewrite in `vercel.json`, and
 * on the real deployment (`it-learning-hub-three.vercel.app`, see docs/DEPLOYMENT.md)
 * it works: every deep path returns 200 with the app. That was verified by loading
 * `/student/calendar`, `/auth/login` and an unknown path directly, not inferred.
 *
 * This file exists because that working state depends on one thing nobody can see
 * from the repository. If the Vercel project's Root Directory is ever changed, or
 * the project is re-linked, or `vercel.json` is dropped, `vercel.json` stops being
 * read and the failure is completely silent: `/` keeps working, every deep link
 * becomes a bare 404, and no test, build or type-check notices, because from the
 * repository's point of view nothing changed at all.
 *
 * A copy of `index.html` at the name every static host already serves for an
 * unmatched path - Vercel, GitHub Pages and Netlify all do - boots the app instead,
 * and Vue Router reads the path and renders the right screen. Verified against a
 * host with that exact behaviour: `/student/calendar` served the app and redirected
 * to `/auth/login`, and an unknown path rendered this app's own 404 page. A static
 * error page cannot navigate, so that redirect is the proof it worked.
 *
 * The cost, stated plainly. If this ever does take over from the rewrite, the status
 * line is 404 rather than 200, because the host believes the path does not exist. The
 * page is correct and fully usable; only the status is wrong. That is invisible to a
 * person using the app and irrelevant to a crawler, which should not be indexing an
 * authenticated system anyway. Weighed against the alternative - the whole site
 * becoming unreachable at every link but the root - it is not a close call.
 *
 * The two do not conflict. The rewrite is tried first and wins whenever it applies,
 * in which case this file is never served at all.
 *
 * A correction worth keeping in mind, because the reasoning that first produced this
 * plugin was wrong. It was written after probing `it-learning-hub.vercel.app` - a
 * *different* Vercel project that happens to share the name - and concluding from
 * its bare 404s that this app's deep links were broken. They were not, and never
 * had been. The two commits that carried that claim are in the history; this comment
 * is the correction. Two things came out of it that are still worth having: the
 * output directory is taken from `config.build.outDir` via `configResolved`, which
 * is the correct API regardless, and the two-projects-one-name hazard is now written
 * down in docs/DEPLOYMENT.md so the next person does not repeat the detour.
 */
function spaFallback(): Plugin {
  let outDir = ''

  return {
    name: 'spa-fallback-404',
    apply: 'build',
    configResolved(config) {
      // Vite reports this absolute, so no cwd assumption is needed.
      outDir = config.build.outDir
    },
    closeBundle() {
      const index = `${outDir}/index.html`
      const notFound = `${outDir}/404.html`

      if (!existsSync(index)) {
        // A build that produced no index.html is a failed build. Emitting an empty
        // 404.html here would replace a loud failure with a silent one that only
        // shows up on a deployed deep link.
        this.error(`spa-fallback-404: ${index} does not exist, so 404.html cannot be built.`)
        return
      }

      copyFileSync(index, notFound)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueJsx(), vueDevTools(), spaFallback()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
