import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The auth forms on shadcn controls.
 *
 * A correction to the record before the assertions: the design spec for this
 * rebuild claimed these forms were styled by a class string and therefore could
 * not express a label association. Measuring them said otherwise. Login,
 * Register, ResetPassword and VerifyCodeStep each already carry real `<label
 * for>`, `aria-invalid`, `aria-describedby` and real error elements. Only
 * ForgotPassword was missing the aria wiring, and that was the one genuine gap.
 *
 * So these tests do not claim to add accessibility that was not there. They
 * pin two things that are true: the gap stays closed, and the parallel
 * `lpTextInputClass` / `lpFieldLabelClass` definitions are gone rather than
 * sitting beside the components that replaced them.
 */
const FORMS = ['Login', 'Register', 'ForgotPassword', 'ResetPassword', 'VerifyCodeStep'] as const

const read = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, '..', 'auth', `${name}.vue`), 'utf-8')

describe('auth forms', () => {
  describe.each(FORMS)('%s', (name) => {
    const content = read(name)

    // Only STATIC ids count here. Vue's bound form
    // `:aria-describedby="cond ? 'email-error' : undefined"` is resolved at
    // runtime, so the only way to prove it points somewhere real is to pair it
    // with a mount, which Task 2's primitives suite already does. Reading the
    // bound expression as a literal would report an id containing `=` and a
    // conditional, and fail on correct code.
    it('binds every static label to a control with for/id', () => {
      const fors = content.match(/(?<!:)\bfor="([^"]+)"/g) ?? []
      const ids = content.match(/\bid="([^"]+)"/g) ?? []
      for (const attr of fors) {
        const value = attr.slice(5, -1)
        expect(
          ids.some((id) => id === `id="${value}"`),
          `${name}: <label for="${value}"> has no element with that id`,
        ).toBe(true)
      }
      expect(fors.length).toBeGreaterThan(0)
    })

    it('marks invalid fields and describes them', () => {
      // Vue's bound form - `:aria-describedby="cond ? 'x-error' : undefined"` -
      // resolves at runtime, so its target cannot be verified from source and
      // this only asserts the wiring is present. That a `describedby` lands on a
      // real element is proven by mounting, in
      // `components/public/__tests__/primitives.spec.ts`.
      expect(content).toMatch(/aria-describedby/)
    })

    it('carries aria-invalid on at least one field', () => {
      expect(content).toMatch(/aria-invalid/)
    })

    it('no longer styles its inputs from controlClasses', () => {
      // The class strings survive in controlClasses.ts for the signed-in app.
      // What must not happen is a public form reaching for them while the
      // shadcn Input carries the same responsibility - that is two definitions
      // of one control, which is the drift controlClasses.ts exists to end.
      expect(content).not.toMatch(/lpTextInputClass/)
      expect(content).not.toMatch(/lpFieldLabelClass/)
    })
  })

  it('the moved control classes are the ones the Input now carries', () => {
    const input = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'components/public/ui/input/Input.vue'),
      'utf-8',
    )
    // The measured Tailwind opacity-modifier bug: `rgb(31_107_70/0.12)` inside
    // an arbitrary value resolves to a fully transparent shadow, silently
    // removing the field's focus affordance. Pinning the `rgba()` form.
    expect(input).toMatch(/rgba\(31,\s*107,\s*70,\s*0\.12\)/)
    expect(input).not.toMatch(/rgb\(31_107_70/)
    // 44px minimum: py-3 (12px each side) plus a 20px line is 44.
    expect(input).toMatch(/py-3/)
    expect(input).toMatch(/motion-reduce:transition-none/)
  })

  it('controlClasses keeps the app definitions and loses the public ones', () => {
    const control = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'components/ui/controlClasses.ts'),
      'utf-8',
    )
    // 7 app files import `textInputClass` and `fieldLabelClass`. Those stay.
    expect(control).toMatch(/export const textInputClass/)
    expect(control).toMatch(/export const fieldLabelClass/)
    // The public duplicates are gone: `src/components/public/ui/input` owns them.
    expect(control).not.toMatch(/export const lpTextInputClass/)
    expect(control).not.toMatch(/export const lpFieldLabelClass/)
  })
})
