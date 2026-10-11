import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('Button component tactile feedback and micro-interactions', () => {
  const buttonPath = path.resolve(__dirname, '../Button.vue')
  const content = fs.readFileSync(buttonPath, 'utf-8')

  it('includes active:scale tactile press micro-interaction', () => {
    expect(content).toMatch(/active:scale-\[0\.98\]|active:scale-95/)
  })

  it('has smooth transition properties', () => {
    expect(content).toMatch(/transition-all|transition-transform/)
  })

  it('preserves accessible focus outline', () => {
    expect(content).toContain('focus-visible:outline-2')
    expect(content).toContain('focus-visible:outline-brand-500')
  })
})
