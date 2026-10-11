# Public Pages on shadcn-vue - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the 11 public pages on shadcn-vue primitives while preserving the committed identity and the existing page composition exactly.

**Architecture:** shadcn-vue components are installed into a private namespace, `src/components/public/ui/`, never `src/components/ui/` which holds the TailAdmin primitives the signed-in app depends on. shadcn's CSS-variable system is bridged onto the existing `--ith-lp-*` tokens rather than given its own palette, so the green is defined once. Four components shared with the app are frozen: `EmptyState` (28 app importers), `Alert` (22), `BrandMark` (4), `ThemeToggleButton` (2).

**Tech Stack:** Vue 3 `<script setup lang="ts">`, Tailwind CSS v4 (`@theme`, no `tailwind.config.js`), shadcn-vue 2.8.2, reka-ui, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-11-public-pages-shadcn-vue-design.md` - read it before starting; this plan argues from it.

## Global Constraints

- **Composition is frozen.** The `DepthCarousel` in the landing hero stays. The hero figures row, the dark value strip, all section eyebrows, and section order stay. Copy is not rewritten.
- **The frozen boundary is frozen.** `src/components/ui/EmptyState.vue`, `src/components/ui/Alert.vue`, `src/components/common/BrandMark.vue`, `src/components/common/ThemeToggleButton.vue` are not edited, and public pages keep importing them from their existing paths.
- **No new hex values.** Every colour in the bridge resolves to an `--ith-lp-*` token or a `color-mix()` of one.
- **PascalCase filenames**, `<script setup lang="ts">`, `defineProps<{}>()` / `defineEmits<{}>()` with explicit types.
- **Lucide for icons only**, imported from `lucide-vue-next`. shadcn components ship no icon dependency; add icons from the package.
- **Logical properties only.** No physical `ml-*`, `mr-*`, `pl-*`, `pr-*`, `left-*`, `right-*`, `border-l-*`, `border-r-*`, `rounded-l-*`, `rounded-r-*`, `text-left`, `text-right` without `ltr:`/`rtl:` support. This applies to edits *inside* shadcn components too.
- **Every new transition carries `motion-reduce:transition-none`.** The existing `lp-` classes already do this and the shadcn components do not.
- **Do not touch** the signed-in app, `src/services/`, the database, or `DESIGN.md`.

## Review Focus

Five failure modes the spec implies that no task's happy-path test will catch. Each has a test pinned to the task that owns the code.

1. **RTL.** shadcn-vue ships physical Tailwind utilities (`pl-3`, `ml-auto`, `left-0`). This project mandates logical equivalents, and the landing hero already uses `absolute start-4 top-4`. Any shadcn component landing on a public page must be checked for physical direction, not assumed correct because it came from a registry.
2. **Dark theme.** The bridge is only correct if it resolves inside `.dark`. shadcn's defaults assume a dark scheme that was never authored here; a component that looks right in light can be unreadable in dark, and screenshots must prove both.
3. **Boundary leakage.** The easiest way to wreck the dashboards is a drive-by "consistency" edit to `EmptyState` or `Alert`. A test asserting those two files are unchanged from HEAD catches it.
4. **Frozen carousel.** Landing is rebuilt in Task 3, and `DepthCarousel` is the component the previous review rejected removing. A test asserting Landing still imports and renders it catches the regression before a human does.
5. **Form error wiring.** Inputs gain `aria-invalid` and `aria-describedby` when invalid. A test asserting a labelled input's error text is actually referenced by `aria-describedby` catches a label that renders but does not connect.

---

### Task 1: shadcn-vue foundation and the token bridge

This task is the go/no-go for the whole plan. It proves Tailwind v4 `@theme inline` and shadcn's variable system can coexist in one stylesheet. If they fight, stop here and report rather than rewriting eleven pages against a broken foundation.

**Files:**
- Create: `components.json`
- Create: `src/assets/public-theme.css`
- Modify: `src/assets/main.css` (one `@import` line only)
- Test: `src/assets/__tests__/public-theme.spec.ts`

**Interfaces:**
- Consumes: the `--ith-lp-*` tokens already declared at `src/assets/main.css:126-157`.
- Produces: shadcn CSS variables `--background`, `--foreground`, `--card`, `--card-foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive`, `--border`, `--input`, `--ring`, `--radius` in both `:root` and `.dark`. Later tasks' shadcn components depend on all sixteen.

- [ ] **Step 1: Write the failing test**

`src/assets/__tests__/public-theme.spec.ts` reads `src/assets/public-theme.css` as text and asserts, for each of the sixteen shadcn variable names, that it is defined under both `:root` and `.dark`, and that every value assigned to `--primary` is a `var(--ith-lp-...)` reference rather than a literal hex.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/assets/__tests__/public-theme.spec.ts`
Expected: FAIL - file does not exist.

- [ ] **Step 3: Install the six packages**

Run: `npm install reka-ui tailwind-variants class-variance-authority clsx tailwind-merge tw-animate-css`

- [ ] **Step 4: Write `components.json`**

Set `$schema` to the shadcn-vue schema, `style: "new-york"`, `typescript: true`, `tailwind.config: ""` (Tailwind v4 has none), `tailwind.css: "src/assets/main.css"`, `tailwind.baseColor: "stone"`, `tailwind.cssVariables: true`, `aliases.components` to `@/components/public/ui`, `aliases.utils` to `@/lib/utils`, `aliases.ui` to `@/components/public/ui`, `aliases.lib` to `@/lib`, `aliases.hooks` to `@/composables`. `framework: "vue"`.

- [ ] **Step 5: Verify the namespace actually holds before writing a bridge**

Run: `npx shadcn-vue@latest add button --yes`

Expected: the file lands at `src/components/public/ui/Button.vue`.

**If it lands at `src/components/ui/Button.vue` instead, stop.** That path holds `Button.vue` already and `aliases.components` is wrong. Fix the alias and re-run before continuing. Do not proceed with the add having overwritten the TailAdmin button.

- [ ] **Step 6: Write the bridge**

`src/assets/public-theme.css` defines all sixteen variables twice, once under `:root` and once under `.dark`, every value a reference to an `--ith-lp-*` token or a `color-mix()` of one. `--primary` maps to `var(--ith-lp-accent)`, `--primary-foreground` to `var(--ith-lp-ink-inverse)`, `--background` to `var(--ith-lp-canvas)`, `--foreground` to `var(--ith-lp-ink)`, `--card` to `var(--ith-lp-card)`, `--muted` to `var(--ith-lp-canvas-deep)`, `--muted-foreground` to `var(--ith-lp-slate)`, `--border` and `--input` to `var(--ith-lp-line-strong)`, `--ring` to `var(--ith-lp-accent)`, `--radius: 0.5rem`. The remaining five resolve to `color-mix()` of the tokens above. The file opens with a comment naming the spec section that mandates it.

- [ ] **Step 7: Import the bridge**

Add exactly one line to `src/assets/main.css`, immediately after the existing `@import 'tailwindcss'`: `@import './public-theme.css';`

- [ ] **Step 8: Create `src/lib/utils.ts`**

shadcn components import `cn` from `@/lib/utils`. It is `twMerge(clsx(...inputs: ClassValue[]))` and must be the only re-export point for those two packages.

- [ ] **Step 9: Run the test to verify it passes**

Run: `npx vitest run src/assets/__tests__/public-theme.spec.ts`
Expected: PASS.

- [ ] **Step 10: Prove the bridge renders in both themes**

Build and screenshot one page with a shadcn `Button` on it in light and dark. Confirm the button is the `#1f6b46` green from `main.css`, not a shadcn default. If it renders grey or black, `@theme inline` is not picking up the bridge and this plan stops here.

- [ ] **Step 11: Commit**

```bash
git add components.json src/assets/public-theme.css src/assets/main.css src/lib/utils.ts src/assets/__tests__/public-theme.spec.ts package.json package-lock.json
git commit -m "feat(public): shadcn-vue foundation and lp token bridge"
```

---

### Task 2: Core primitives

Builds the components every later task consumes. Adding them now means Tasks 3-8 never block on infrastructure.

**Files:**
- Create: `src/components/public/ui/Button.vue`
- Create: `src/components/public/ui/Card.vue` (and its `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`)
- Create: `src/components/public/ui/Input.vue`
- Create: `src/components/public/ui/Label.vue`
- Create: `src/components/public/ui/Badge.vue`
- Test: `src/components/public/__tests__/primitives.spec.ts`

**Interfaces:**
- Consumes: the sixteen shadcn CSS variables from Task 1.
- Produces: `<Button>`, `<Card>`, `<CardHeader>`, `<CardTitle>`, `<CardDescription>`, `<CardContent>`, `<CardFooter>`, `<Input>`, `<Label>`, `<Badge>` imported from `@/components/public/ui/`.

- [ ] **Step 1: Write the failing tests**

`primitives.spec.ts` asserts: a `<Label for="email">` paired with `<Input id="email">` produces `document.querySelector('label')!.htmlFor === 'email'`; an `<Input aria-invalid="true" aria-describedby="email-error">` exposes both attributes; every rendered button in the suite measures ≥44px in height; `<Button>` with the `primary` variant resolves to `--primary` and `outline` to a transparent background with a `--border` ring. Add one RTL test: assert no rendered element's class string matches `/(^|[\s:])((m|p)[lr]-|left-|right-|border-[lr]-|rounded-[lr]-|text-(left|right))/`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/public/__tests__/primitives.spec.ts`
Expected: FAIL - components do not exist.

- [ ] **Step 3: Add the components**

`npx shadcn-vue@latest add card input label badge --yes`

`Button.vue` is not in this list: Task 1 Step 5 already created it as the namespace probe, and re-adding it here would overwrite the audited version. Start from the Task 1 file.

Then, for each file: replace physical directional utilities with logical ones per the Global Constraints; append `motion-reduce:transition-none` to every `transition-*`; remove any colour literal in favour of the bridged variables.

- [ ] **Step 4: Fix `Button`'s height**

shadcn's default `h-9` is 36px. The project requires ≥44px touch targets and `touch-targets.spec.ts` already asserts it. Set every size variant's height so the smallest is ≥44px.

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/components/public/__tests__/primitives.spec.ts`
Expected: PASS.

- [ ] **Step 6: Verify nothing leaked into the frozen boundary**

Run: `git diff --stat 16d07f8 -- src/components/ui/EmptyState.vue src/components/ui/Alert.vue src/components/common/BrandMark.vue src/components/common/ThemeToggleButton.vue`
Expected: empty output.

- [ ] **Step 7: Commit**

```bash
git add src/components/public src/lib
git commit -m "feat(public): Button, Card, Input, Label, Badge on the lp bridge"
```

---

### Task 3: Landing

Third, not last, on purpose. Landing is the page that was reverted and the page the reviewer cares about most; doing it early means if the direction is wrong again, little is wasted.

**Files:**
- Modify: `src/views/auth/Landing.vue`
- Test: `src/views/__tests__/landing-public-components.spec.ts`

**Interfaces:**
- Consumes: `Button` from Task 2. Keeps importing `BrandMark`, `ThemeToggleButton`, `EmptyState`, `Alert`, `DepthCarousel`, `CatalogueCard`, `CourseCover` from their current paths.
- Produces: none for later tasks.

- [ ] **Step 1: Write the failing tests**

Assert: (a) Landing renders `DepthCarousel` - `wrapper.findComponent(DepthCarousel).exists()` is true, and the text of the hero figures row (`6`, `18`, `54` or their live equivalents) is still present; (b) the dark value strip still renders its five items; (c) every `<a>` and `<button>` in the template resolves to a `Button` or an existing non-shadcn class, and no hand-written CTA class string remains; (d) all four section eyebrows still render.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/views/__tests__/landing-public-components.spec.ts`
Expected: FAIL on the Button assertion; (a) and (b) should already pass and must keep passing.

- [ ] **Step 3: Substitute the buttons**

Replace every hand-written CTA class string with `<Button>` at the appropriate variant. Do not reorder, restyle, resize or re-word anything. The carousel, figures, strip, section order and all copy stay byte-identical.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/views/__tests__/landing-public-components.spec.ts`
Expected: PASS.

- [ ] **Step 5: Screenshot it and compare to the pre-task capture**

Desktop 1440x900, mobile 390x844, light and dark, against `audit-out/shots/base-landing-*.png`. Assert zero horizontal overflow. Report honestly if it looks unchanged - per spec §10 that is an expected outcome, not a failure, but it must be stated rather than glossed.

- [ ] **Step 6: Commit**

```bash
git add src/views/auth/Landing.vue src/views/__tests__/landing-public-components.spec.ts
git commit -m "refactor(landing): CTAs on the shared Button, composition unchanged"
```

---

### Task 4: Auth forms

The largest genuine accessibility gain in the plan: `controlClasses.ts`'s `lpTextInputClass` and `lpFieldLabelClass` are class strings and cannot express label association or aria wiring.

**Files:**
- Modify: `src/components/auth/AuthShell.vue`
- Modify: `src/components/auth/AuthConsent.vue`
- Modify: `src/views/auth/Login.vue`
- Modify: `src/views/auth/Register.vue`
- Test: `src/views/__tests__/auth-forms.spec.ts`

**Interfaces:**
- Consumes: `Input`, `Label`, `Checkbox`, `Button`, `Card` and sub-components from Task 2.
- Produces: `AuthShell` reworked onto `Card`; Task 5 reuses the same shell.

- [ ] **Step 1: Write the failing tests**

Assert for both Login and Register: every `Input` has a `Label` whose `for` equals the input's `id`; every invalid input carries `aria-invalid="true"` and an `aria-describedby` pointing at an element that exists in the DOM; the consent control is a real checkbox element with an associated label; submitting while a required field is empty focuses the first invalid input.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/views/__tests__/auth-forms.spec.ts`
Expected: FAIL - no label association today.

- [ ] **Step 3: Rework `AuthShell` onto `Card`**

Preserve its props and its slot contract exactly. Only the internals change.

- [ ] **Step 4: Replace the form controls**

In Login and Register, swap `lpTextInputClass` / `lpFieldLabelClass` for `Input` + `Label`, wire the existing validation messages to `aria-invalid` and `aria-describedby`, and swap the consent control for `Checkbox`. Keep every existing class that encodes the palette behaviour, including the documented `rgba(31,107,70,0.12)` focus ring - that comment records a measured Tailwind opacity-modifier bug and must not be lost.

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/views/__tests__/auth-forms.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/auth src/views/auth/Login.vue src/views/auth/Register.vue src/views/__tests__/auth-forms.spec.ts
git commit -m "feat(auth): labelled inputs with aria-invalid and describedby wiring"
```

---

### Task 5: Password reset flow

**Files:**
- Modify: `src/views/auth/ForgotPassword.vue`
- Modify: `src/views/auth/ResetPassword.vue`
- Modify: `src/views/auth/VerifyCodeStep.vue`
- Test: `src/views/__tests__/password-flow.spec.ts`

**Interfaces:**
- Consumes: `AuthShell` from Task 4, `Input`, `Label`, `Button` from Task 2.

- [ ] **Step 1: Write the failing tests**

Same four assertions as Task 4, applied to all three views: label bound by `for`/`id`, `aria-invalid` present when invalid, `aria-describedby` resolving to a real element, and focus moving to the first invalid input on submit.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/views/__tests__/password-flow.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Rebuild the three views on the shared shell and controls**

Same treatment as Task 4. `VerifyCodeStep`'s segmented code inputs get individual `Label`s, visually hidden where the design calls for it, never absent.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/views/__tests__/password-flow.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/auth/ForgotPassword.vue src/views/auth/ResetPassword.vue src/views/auth/VerifyCodeStep.vue src/views/__tests__/password-flow.spec.ts
git commit -m "feat(auth): password flow on labelled shadcn inputs"
```

---

### Task 6: Catalogue

**Files:**
- Create: `src/components/public/ui/Select.vue`
- Create: `src/components/public/ui/Skeleton.vue`
- Modify: `src/components/catalogue/CatalogueCard.vue`
- Modify: `src/views/auth/Catalog.vue`
- Test: `src/components/public/__tests__/catalogue.spec.ts`

**Interfaces:**
- Consumes: `Card`, `Badge`, `Button` from Task 2. Keeps `CourseCover`, `EmptyState`, `Alert`, `BrandMark`, `ThemeToggleButton` as-is.
- Produces: none.

- [ ] **Step 1: Write the failing tests**

Assert: the category filter is a labelled `Select`; the loading state renders `Skeleton` elements and not a spinner; each card's level indicator is a `Badge` carrying its level text (not a colour alone); `CourseCover` still renders its category eyebrow, which the previous redesign wrongly removed.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/public/__tests__/catalogue.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Add Select and Skeleton, apply the Global Constraints**

```bash
npx shadcn-vue@latest add select skeleton --yes
```

- [ ] **Step 4: Rebuild `CatalogueCard` on `Card` and swap the filter and loading state**

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/components/public/__tests__/catalogue.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/public/ui src/components/catalogue/CatalogueCard.vue src/views/auth/Catalog.vue src/components/public/__tests__/catalogue.spec.ts
git commit -m "feat(catalogue): Select filter, Skeleton loading, cards on Card"
```

---

### Task 7: Course page

**Files:**
- Create: `src/components/public/ui/Accordion.vue`
- Create: `src/components/public/ui/Separator.vue`
- Modify: `src/views/auth/CoursePage.vue`
- Test: `src/views/__tests__/course-page.spec.ts`

**Interfaces:**
- Consumes: `Button`, `Badge`, `Separator` from Task 2. Keeps `CourseCover`, `CatalogueCard` as-is.

- [ ] **Step 1: Write the failing tests**

Assert: the curriculum is an `Accordion`; each module trigger is a real `button` with `aria-expanded` reflecting state; the whole curriculum is operable from the keyboard; `CourseCover` is unchanged in structure.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/views/__tests__/course-page.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Add Accordion and Separator, rebuild the curriculum**

```bash
npx shadcn-vue@latest add accordion separator --yes
```

Replace the custom expand/collapse, keeping its open/closed default and its content verbatim.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/views/__tests__/course-page.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/public/ui src/views/auth/CoursePage.vue src/views/__tests__/course-page.spec.ts
git commit -m "feat(course): curriculum on Accordion, keyboard-operable"
```

---

### Task 8: Legal pages

**Files:**
- Modify: `src/views/auth/LegalDocument.vue`
- Modify: `src/views/auth/TermsOfService.vue`
- Modify: `src/views/auth/PrivacyPolicy.vue`
- Test: `src/views/__tests__/legal.spec.ts`

**Interfaces:**
- Consumes: `Separator` from Task 7. Keeps `BrandMark`, `ThemeToggleButton` as-is.

- [ ] **Step 1: Write the failing tests**

Assert: all three render their heading and body; the shared `LegalDocument` shell provides the heading hierarchy; each page has exactly one `<h1>`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/views/__tests__/legal.spec.ts`
Expected: FAIL on any unshared heading level.

- [ ] **Step 3: Unify the three onto `LegalDocument`**

Prose layout only. No component substitution beyond `Separator`. No copy edits.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/views/__tests__/legal.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/auth/LegalDocument.vue src/views/auth/TermsOfService.vue src/views/auth/PrivacyPolicy.vue src/views/__tests__/legal.spec.ts
git commit -m "refactor(legal): shared shell and heading hierarchy"
```

---

### Task 9: Visual gate and full verification

No code. This task produces the evidence, and it is the only task allowed to report completion.

**Files:**
- Create: `e2e/public-audit.spec.ts`

**Interfaces:**
- Consumes: every page above.
- Produces: the screenshot set and the verification output the reviewer judges the work from.

- [ ] **Step 1: Write the audit spec**

A Playwright spec that visits `/`, `/courses`, one `/courses/:slug`, `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`, `/legal/terms` and `/legal/privacy` at 1440x900 and 390x844, captures a screenshot of each into `audit-out/shots/public-*.png`, records `document.documentElement.scrollWidth - clientWidth` per viewport, and fails if any value is non-zero. Capture a dark-theme pass by adding `.dark` to `<html>`.

- [ ] **Step 2: Run the full gate**

Run: `npm run verify`

This runs `format:check`, `check:workflows`, `check:impeccable`, `test`, `type-check`, `lint`, `build`. Expected: all clean. Quote the real output; do not summarise it.

- [ ] **Step 3: Confirm the test suite did not shrink**

Run: `npx vitest run --reporter=basic | Select-String "Tests"`

Expected: **513 or more**. Any test removed rather than fixed is a regression and must be reverted.

- [ ] **Step 4: Confirm the frozen boundary one final time**

Run: `git diff --stat 16d07f8 -- src/components/ui src/components/common/BrandMark.vue src/components/common/ThemeToggleButton.vue src/views/student src/views/instructor src/views/admin src/components/layout`

Expected: empty output.

- [ ] **Step 5: Present the result and stop**

Open the running site for the reviewer. Do not commit the audit spec to the branch without asking, do not push, and do not deploy. Per spec §9 the work stays uncommitted until the reviewer confirms it.

## Risks carried into execution

| Risk | Where it is handled |
|---|---|
| `@theme inline` and the shadcn var system conflict | Task 1 Step 10 is a hard stop; nothing else runs until it passes |
| `aliases.components` silently resolves to the TailAdmin path and overwrites `Button.vue` | Task 1 Step 5 is a hard stop with an explicit instruction to stop, not fix forward |
| Output looks near-identical | Task 3 Step 5 requires saying so out loud rather than glossing it |
| shadcn's physical utilities break RTL | Global Constraints, plus an automated class-string assertion in Task 2 Step 1 |
| A drive-by edit shifts the dashboards | Tasks 2 and 9 both diff the frozen paths against `16d07f8` |
| Dark theme is never actually looked at | Task 1 Step 10, Task 3 Step 5 and Task 9 Step 1 each capture dark |