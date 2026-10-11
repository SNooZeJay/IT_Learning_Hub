import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('SearchBar shortcut chip and styling', () => {
  const searchBarPath = path.resolve(__dirname, '../SearchBar.vue')
  const content = fs.readFileSync(searchBarPath, 'utf-8')

  it('renders a kbd shortcut badge when search term is empty', () => {
    expect(content).toMatch(/<kbd[\s\S]*?v-if="term === ''"[\s\S]*?>/)
    expect(content).toContain('⌘')
    expect(content).toContain('K')
  })

  it('binds Ctrl+K / Meta+K keyboard shortcut handler', () => {
    expect(content).toMatch(/event\.(metaKey|ctrlKey)/)
    expect(content).toMatch(/event\.key\.toLowerCase\(\)\s*!==\s*'k'/)
  })

  it('applies subtle focus ring and transition to search input', () => {
    expect(content).toContain('focus:ring-2 focus:ring-brand-500/20')
    expect(content).toContain('focus:border-brand-500')
  })
})
