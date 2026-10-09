/**
 * When does the hero's largest paragraph actually become visible?
 *
 * Lighthouse reports LCP as render delay, and says 90% of it. That is measured, but it
 * does not say *what* is blocking the paint - the element's own animation, the router
 * resolving the route, the typewriter still running, or the framework mounting.
 *
 * So this observes the element from the first frame of a fresh document and records the
 * moment its computed opacity reaches 1, alongside the navigation timings. That turns
 * "4 seconds of render delay" into a specific cause.
 *
 * Read-only. Usage: node scripts/measure-hero.mjs <baseURL>
 */
import { chromium } from '@playwright/test'

const BASE = process.argv[2] ?? 'http://localhost:4173'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 412, height: 823 } })

// Runs before anything on the page, so it catches the element's first appearance.
await page.addInitScript(() => {
  window.__ith = { firstSeen: null, fullyVisible: null, frames: 0 }
  const poll = () => {
    const el = document.querySelector('.fade-in-lcp, .lp-hero-step')
    if (el) {
      if (window.__ith.firstSeen === null) {
        window.__ith.firstSeen = performance.now()
        // Confirm the paint actually happened, not just that the node exists.
        el.getBoundingClientRect()
      }
      const op = parseFloat(getComputedStyle(el).opacity)
      if (op >= 0.99 && window.__ith.fullyVisible === null) {
        window.__ith.fullyVisible = performance.now()
      }
    }
    window.__ith.frames++
    if (window.__ith.fullyVisible === null && performance.now() < 12000) {
      requestAnimationFrame(poll)
    }
  }
  requestAnimationFrame(poll)
})

await page.goto(BASE, { waitUntil: 'load' })
await page.waitForTimeout(9000)

const out = await page.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0]
  const lcpEntries = performance.getEntriesByType('largest-contentful-paint')
  return {
    ...window.__ith,
    domInteractive: Math.round(nav.domInteractive),
    domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
    loadEvent: Math.round(nav.loadEventEnd),
    lcpEntries: lcpEntries.map((e) => ({
      at: Math.round(e.startTime),
      size: e.size,
      element: e.element ? e.element.className.slice(0, 60) : null,
      url: e.url ? e.url.split('/').pop() : null,
    })),
  }
})

console.log(JSON.stringify(out, null, 2))
await browser.close()