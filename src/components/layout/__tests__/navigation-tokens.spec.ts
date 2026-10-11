import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('Navigation and surface tokens in main.css', () => {
  const cssPath = path.resolve(__dirname, '../../../assets/main.css')
  const cssContent = fs.readFileSync(cssPath, 'utf-8')

  it('defines surface-card with subtle precision styling', () => {
    expect(cssContent).toMatch(/@utility surface-card\s*\{[\s\S]*?rounded-lg/)
    expect(cssContent).toMatch(/@utility surface-card\s*\{[\s\S]*?border-gray-200/)
    expect(cssContent).toMatch(/@utility surface-card\s*\{[\s\S]*?dark:bg-white/)
  })

  it('defines surface-card-interactive with micro-elevation and hover transitions', () => {
    expect(cssContent).toMatch(/@utility surface-card-interactive\s*\{[\s\S]*?hover:border-brand-/)
    expect(cssContent).toMatch(/@utility surface-card-interactive\s*\{[\s\S]*?hover:shadow-xs/)
  })

  it('defines menu-item-active with RTL-compatible start-indicator bar', () => {
    expect(cssContent).toMatch(/@utility menu-item-active\s*\{[\s\S]*?before:start-0/)
    expect(cssContent).toMatch(/@utility menu-item-active\s*\{[\s\S]*?before:bg-brand-/)
    expect(cssContent).toMatch(/@utility menu-item-active\s*\{[\s\S]*?dark:text-brand-300/)
  })
})
