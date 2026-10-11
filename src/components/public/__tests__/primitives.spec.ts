// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import fs from 'node:fs'
import path from 'node:path'

import Button from '@/components/public/ui/button/Button.vue'
import Label from '@/components/public/ui/label/Label.vue'
import Input from '@/components/public/ui/input/Input.vue'
import Checkbox from '@/components/public/ui/checkbox/Checkbox.vue'

/**
 * The public-layer primitives.
 *
 * This is the first test in the project that mounts anything. All 513 existing
 * tests read `.vue` files as text, which is the right call for the TailAdmin
 * code they cover but cannot answer the questions this layer exists to answer.
 *
 * The distinction matters here more than anywhere else. `controlClasses.ts`
 * styles the auth forms' inputs with `lpTextInputClass`, and a class string
 * looks exactly like an accessible text field right up until you try to find
 * the `<label>` bound to it - there isn't one, because a class cannot create
 * an element. Grepping the source proves an author typed `for="email"`; it
 * does not prove the rendered DOM carries the association. So the association
 * tests below mount, and only the things a DOM cannot measure - height, class
 * strings, colour literals - fall back to reading the source.
 *
 * The environment is set per-file with the docblock above rather than in
 * `vite.config.ts`, so the 513 existing tests keep running exactly as they did.
 */
describe('public primitives', () => {
  describe('label association', () => {
    it('binds a Label to its Input so the association survives in the DOM', () => {
      const form = mount(
        {
          components: { Label, Input },
          template: `
            <div>
              <Label for="email">Email address</Label>
              <Input id="email" />
            </div>
          `,
        },
        { attachTo: document.body },
      )

      const label = form.find('label')
      const input = form.find('input')
      expect(label.exists()).toBe(true)
      expect(label.attributes('for')).toBe('email')
      expect(input.attributes('id')).toBe('email')

      form.unmount()
    })

    it('exposes aria-invalid and points aria-describedby at real error text', () => {
      const form = mount(
        {
          components: { Label, Input },
          template: `
            <div>
              <Label for="pw">Password</Label>
              <Input id="pw" aria-invalid="true" aria-describedby="pw-error" />
              <p id="pw-error">Password must be at least 8 characters.</p>
            </div>
          `,
        },
        { attachTo: document.body },
      )

      const input = form.find('input')
      expect(input.attributes('aria-invalid')).toBe('true')

      const describedBy = input.attributes('aria-describedby')
      expect(describedBy).toBe('pw-error')
      // The attribute is only useful if the element it names is actually there.
      // An aria-describedby pointing at nothing is a silently broken promise to
      // a screen reader, and grep cannot catch it.
      expect(form.find(`#${describedBy}`).exists()).toBe(true)

      form.unmount()
    })
  })

  describe('checkbox', () => {
    /*
      reka-ui renders `<button role="checkbox" aria-checked>`, not a native
      `<input type="checkbox">`. The first draft of this test asserted a native
      input and failed, which was the test being wrong rather than the
      component: the ARIA checkbox role is a complete pattern - a real button
      element, focusable, toggled with Space, announcing its state through
      `aria-checked`. Asserting the literal input tag would have rejected a
      correct implementation in favour of a worse one.

      So what is asserted here is the guarantee that actually matters to someone
      using the form: the control exists, carries its state to assistive tech,
      takes an accessible name, and responds to the keyboard.
    */
    it('is a focusable ARIA checkbox carrying its state, not a styled div', async () => {
      const form = mount(
        {
          components: { Label, Checkbox },
          template: `
            <div>
              <Checkbox id="consent" aria-label="I agree to the terms" />
              <Label for="consent">I agree to the terms</Label>
            </div>
          `,
        },
        { attachTo: document.body },
      )

      const control = form.find('[role="checkbox"]')
      expect(control.exists()).toBe(true)
      expect(control.attributes('aria-checked')).toBe('false')
      expect(control.attributes('aria-label')).toBe('I agree to the terms')

      // A real button is what makes Space-key toggling and focus work; a div
      // with the role bolted on gives a screen reader the announcement and a
      // keyboard user nothing.
      expect(control.element.tagName).toBe('BUTTON')
      expect(control.attributes('tabindex')).not.toBe('-1')

      await control.trigger('click')
      expect(control.attributes('aria-checked')).toBe('true')

      expect(form.find('label').attributes('for')).toBe('consent')

      form.unmount()
    })

    it('gives the visible box a 44px hit area without inflating the box', () => {
      const content = fs.readFileSync(
        path.resolve(__dirname, '..', 'ui', 'checkbox', 'Checkbox.vue'),
        'utf-8',
      )
      // 16px box, 14px bleed per edge -> 44px target. Both halves are asserted
      // because dropping either is the same defect: a 16px target, or a 44px
      // checkbox sitting in a line of form copy.
      expect(content).toMatch(/size-4\b/)
      expect(content).toMatch(/after:inset-\[-14px\]/)
      expect(content).toMatch(/after:content-\[''\]/)
    })
  })

  describe('button geometry', () => {
    /*
      happy-dom has no layout engine, so `getBoundingClientRect()` returns 0
      for everything and a mounted height assertion would pass on any value.
      The real measurement happens in Task 9's Playwright pass against a real
      browser. What can be asserted here is that every size variant NAMES a
      height at or above 44px, which is what `touch-targets.spec.ts` checks for
      the app and what shadcn's own defaults (`h-9`, 36px) would fail.
    */
    const variantSource = fs.readFileSync(
      path.resolve(__dirname, '..', 'ui', 'button', 'index.ts'),
      'utf-8',
    )

    it('gives every button size variant a height of at least 44px', () => {
      const sizeBlock = variantSource.match(/size:\s*\{([\s\S]*?)\n\s{4}\}/)
      expect(sizeBlock).not.toBeNull()

      const heights = [...(sizeBlock ? sizeBlock[1] : '').matchAll(/(?:h|size)-(\d+)\b/g)].map(
        (m) => Number(m[1]),
      )
      expect(heights.length).toBeGreaterThan(0)
      for (const height of heights) {
        // Tailwind's scale: h-10 is 40px, h-11 is 44px.
        expect(height, `a button size variant is ${height * 4}px tall`).toBeGreaterThanOrEqual(11)
      }
    })

    it('shadcn default h-9 is gone from every variant', () => {
      expect(variantSource).not.toMatch(/\bh-9\b/)
      expect(variantSource).not.toMatch(/\bsize-9\b/)
    })
  })

  describe('project constraints', () => {
    /**
     * shadcn-vue ships physical Tailwind utilities - `pl-3`, `ml-auto`,
     * `left-0`. This project mandates logical ones and supports RTL, so a
     * component that arrives from a registry cannot be trusted on this without
     * being checked. Every generated file is swept, and this is what proves it.
     */
    it('contains no physical directional utilities in any public primitive', () => {
      const dir = path.resolve(__dirname, '..', 'ui')
      const files: string[] = []
      const walk = (d: string) => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, entry.name)
          if (entry.isDirectory()) walk(full)
          else if (/\.(vue|ts)$/.test(entry.name)) files.push(full)
        }
      }
      walk(dir)

      expect(files.length).toBeGreaterThan(0)
      const PHYSICAL =
        /(?<![\w-])(?:[a-z-]+:)*(?:ml|mr|pl|pr)-\d|(?<![\w-])(?:[a-z-]+:)*(?:left|right)-\[|(?<![\w-])(?:[a-z-]+:)*(?:border-l|border-r)-|(?<![\w-])(?:[a-z-]+:)*(?:rounded-l|rounded-r)-|text-(left|right)\b/

      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8')
        const match = content.match(PHYSICAL)
        expect(match, `${path.basename(file)} uses the physical utility "${match?.[0]}"`).toBeNull()
      }
    })

    it('defines no literal colour in any public primitive', () => {
      const dir = path.resolve(__dirname, '..', 'ui')
      const files: string[] = []
      const walk = (d: string) => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, entry.name)
          if (entry.isDirectory()) walk(full)
          else if (/\.(vue|ts)$/.test(entry.name)) files.push(full)
        }
      }
      walk(dir)

      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8')
        // Only class strings; a hex inside a comment is harmless, and a hex in
        // the script block would be a hard failure anyway.
        expect(content, `${path.basename(file)} hard-codes a colour`).not.toMatch(
          /#[0-9a-fA-F]{6}\b/,
        )
      }
    })

    it('carries motion-reduce on every transition it introduces', () => {
      const dir = path.resolve(__dirname, '..', 'ui')
      const files: string[] = []
      const walk = (d: string) => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, entry.name)
          if (entry.isDirectory()) walk(full)
          else if (/\.(vue|ts)$/.test(entry.name)) files.push(full)
        }
      }
      walk(dir)

      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8')
        if (!/transition-/.test(content)) continue
        // Each transition-* utility needs a motion-reduce: escape hatch
        // alongside it. Counting occurrences catches a component that
        // transitions and forgot to offer the opt-out.
        // `none` is excluded because `motion-reduce:transition-none` contains
        // the substring `transition-none`. Counting it would make every
        // correctly-written escape hatch look like an unhandled transition and
        // then demand a second escape hatch beside itself, which never converges.
        const transitions = (content.match(/transition-(?!duration|none)[a-z-]+/g) ?? []).length
        const escapes = (content.match(/motion-reduce:/g) ?? []).length
        expect(
          escapes,
          `${path.basename(file)} has ${transitions} transition utilities and ${escapes} motion-reduce escapes`,
        ).toBeGreaterThanOrEqual(transitions)
      }
    })

    it('Button mounts and renders its slot', () => {
      const wrapper = mount(Button, { slots: { default: 'Explore courses' } })
      expect(wrapper.find('button').exists()).toBe(true)
      expect(wrapper.text()).toContain('Explore courses')
    })
  })
})
