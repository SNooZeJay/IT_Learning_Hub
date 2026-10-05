import { copyFileSync, existsSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'

/**
 * Emit `404.html` as a copy of `index.html`.
 *
 * This is the SPA fallback, and it is here rather than only in `vercel.json`
 * because `vercel.json` alone has twice been believed to fix this and was not.
 *
 * The history: the deployed site serves `/` correctly and returns a bare 404 for
 * every deep path - `/student/calendar`, `/auth/login`, everything. So the app is
 * reachable only at the root, and any refresh, bookmark or shared link is a dead
 * end. On 2026-10-05 a `vercel.json` SPA rewrite was committed as the fix. It is
 * still in the repository, still correct as far as it goes, and deep paths still
 * 404 - verified against the deployed bundle after this commit's predecessor
 * shipped, not inferred from a green gate.
 *
 * The likely cause is in the Vercel project's settings rather than in the repo:
 * if the project's Root Directory is not the repository root, `vercel.json` at the
 * root is never read. There is no way to check or change that from here without
 * dashboard access, and guessing at dashboard settings is not something to build on.
 *
 * So the fix is placed where it cannot depend on them. Every static host that
 * matters serves `404.html` for a path that matches no file - Vercel, GitHub Pages
 * and Netlify all do - so a copy of `index.html` at that name boots the app, and
 * Vue Router reads the path and renders the right screen. Deep links work whatever
 * the host's rewrite configuration happens to be.
 *
 * The one compromise, stated plainly: the response status is 404 rather than 200,
 * because the host believes the path does not exist. The page is correct and fully
 * usable; only the status line is wrong. That is invisible to a person using the
 * app, and it would matter to a crawler, which is not a consideration for an
 * authenticated system that no search engine should be indexing.
 *
 * `vercel.json` is deliberately left in place. If the Root Directory is corrected
 * the rewrite will start applying, and having both is harmless - the rewrite simply
 * wins, and this file is never reached.
 *
 * The output directory is taken from Vite's resolved config rather than from
 * `__dirname` or `import.meta.url`. A first attempt used `__dirname`, which worked
 * on this machine and then failed the Vercel build outright, so no deployment
 * happened at all - Vite loads a TypeScript config as CJS or ESM depending on the
 * host, and only one of those two identifiers exists. `configResolved` is the API
 * for this and has neither problem.
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
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
    spaFallback(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
})
