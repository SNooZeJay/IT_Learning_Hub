import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('StatCard component styling and structure', () => {
  const statCardPath = path.resolve(__dirname, '../StatCard.vue')
  const content = fs.readFileSync(statCardPath, 'utf-8')

  it('renders on surface-card', () => {
    expect(content).toContain('surface-card')
  })

  it('includes icon chip container with icon component', () => {
    expect(content).toMatch(/icon-chip/)
    expect(content).toContain(':is="icon"')
  })

  it('displays numerical figure with semibold weight and tight tracking', () => {
    expect(content).toContain('font-semibold')
    expect(content).toContain('tracking-tight')
  })
})
