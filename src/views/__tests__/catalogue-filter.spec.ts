import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The catalogue's category filter must be visible to exist.
 *
 * `categoryId` lived in the filter state, the URL sync, and the result
 * computation - and the page even fetched the category list - but no control
 * in the template was bound to it. The only way to reach the filter was typing
 * `?category=` by hand. A choice with no visible control is not a choice
 * (recognition over recall), and a URL parameter no control can produce is a
 * share link the recipient cannot reproduce.
 */
describe('catalogue category filter visibility', () => {
  const content = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'views/auth/Catalog.vue'),
    'utf-8',
  )

  it('binds a visible select to the category filter state', () => {
    expect(content).toMatch(/<select[^>]*v-model="categoryId"/)
  })

  it('renders one option per loaded category', () => {
    expect(content).toMatch(/v-for="[^"]* in categories"/)
  })

  it('stores the loaded categories instead of only validating against them', () => {
    expect(content).toMatch(/const categories = ref/)
  })
})
