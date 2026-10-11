# Modern High-Tech SaaS UI/UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate IT Learning Hub LMS with a Modern High-Tech SaaS aesthetic (Linear/Vercel style) across the layout shell, UI primitives, and Student, Instructor, and Admin dashboards, strictly adhering to [DESIGN.md](file:///d:/LMS_PROJECT/lms-project-vue-tail/DESIGN.md).

**Architecture:** Refine core surface and navigation token utilities in `src/assets/main.css`. Elevate `AppHeader.vue`, `SearchBar.vue`, and `AppSidebar.vue` with glassmorphism, desktop `⌘K` keyboard shortcut badge, and active start-indicator bars. Upgrade primitives (`Button.vue`, `StatCard.vue`, `LoadingState.vue`, `EmptyState.vue`) with tactile active states, micro-hover lifts, and skeleton pulse states, then carry these enhancements across all three role dashboards.

**Tech Stack:** Vue 3 Composition API (`<script setup lang="ts">`), TypeScript 5.7, Tailwind CSS v4 (`@theme`), Lucide Icons, Vitest, Vue Test Utils.

**Spec:** [docs/superpowers/specs/2026-10-11-modern-saas-ui-ux-polish-design.md](file:///d:/LMS_PROJECT/lms-project-vue-tail/docs/superpowers/specs/2026-10-11-modern-saas-ui-ux-polish-design.md)

## Global Constraints

- **Warm Minimalist Tokens:** Maintain `--ith-canvas`, `--ith-surface`, `--color-brand-*` green ramp, and warm-charcoal neutrals. No hardcoded hex values in component classes.
- **Sober-Editorial Geometry:** 8px (`rounded-md`) on buttons/inputs, 12px (`rounded-lg`) on cards. Pills only for status badges, tags, and avatars.
- **Logical Spacing:** Use CSS logical properties (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`) for bidirectional RTL compatibility.
- **Strict Theme Parity:** Every UI element must include high-contrast `dark:` variants with minimum WCAG AA 4.5:1 text contrast.
- **Clean Gates:** `npm run type-check`, `npx eslint src/`, `npm run test`, and `npm run build` must all pass cleanly at every task boundary.

## Review Focus

1. **Search Shortcut Chip Visibility:** Ensure `<kbd>⌘K</kbd>` / `<kbd>Ctrl K</kbd>` only displays on viewports `>= xl` when query is empty, and disappears cleanly when query text is typed so clear (`X`) button is not obstructed.
2. **Active Sidebar Indicator RTL Flip:** Ensure the 2.5px active nav indicator bar uses `before:start-0` so it anchors to the right edge in RTL and left edge in LTR without layout shift.
3. **Button Tactile Scale:** Ensure `active:scale-[0.98]` on buttons does not trigger unintended layout reflow or overflow inside tight flex containers.
4. **StatCard Hover Depth:** Ensure micro-hover transition on stat cards (`hover:border-brand-300/80 hover:shadow-xs`) does not alter card dimensions or break grid alignment.
5. **Glassmorphic Header Backdrop:** Ensure `bg-canvas/85 dark:bg-[#17150f]/85 backdrop-blur-md` does not cause stacking context issues with dropdown menus (`z-50`) or mobile drawer (`z-99999`).

---

### Task 1: Main CSS Surface & Menu Tokens Polish

**Files:**
- Modify: `src/assets/main.css:841-865, 942-975`
- Test: `src/components/layout/__tests__/navigation-tokens.spec.ts`

**Interfaces:**
- Consumes: Existing `@theme` and `@utility` rules in `src/assets/main.css`.
- Produces: Enhanced `@utility surface-card`, `@utility surface-card-interactive`, `@utility menu-item-active`, and `@utility menu-item-inactive` classes.

- [ ] **Step 1: Write unit test validating surface and menu utility classes**

Create `src/components/layout/__tests__/navigation-tokens.spec.ts` testing that sidebar nav items apply the active class when route matches and render the active indicator container.

- [ ] **Step 2: Run test to observe baseline**

Run: `npx vitest run src/components/layout/__tests__/navigation-tokens.spec.ts`

- [ ] **Step 3: Update `src/assets/main.css`**

Update `@utility surface-card` and `@utility surface-card-interactive` to add subtle precision borders and hover response:
```css
@utility surface-card {
  @apply rounded-lg border border-gray-200/90 bg-white p-6 transition-all duration-200 dark:border-white/[0.08] dark:bg-white/[0.025];
}

@utility surface-card-interactive {
  @apply rounded-lg border border-gray-200/90 bg-white transition-all duration-150 hover:border-brand-400 hover:bg-gray-50/80 hover:shadow-xs dark:border-white/[0.08] dark:bg-white/[0.025] dark:hover:border-brand-500/40 dark:hover:bg-white/[0.05] dark:hover:shadow-xs;
}

@utility menu-item-active {
  @apply relative bg-brand-50/80 text-brand-700 before:absolute before:start-0 before:top-2 before:bottom-2 before:w-[2.5px] before:rounded-full before:bg-brand-600 dark:bg-brand-500/[0.14] dark:text-brand-300 dark:before:bg-brand-400;
}

@utility menu-item-inactive {
  @apply text-gray-700 transition-colors duration-150 hover:bg-gray-100/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-white;
}
```

- [ ] **Step 4: Run test to verify passes**

Run: `npx vitest run src/components/layout/__tests__/navigation-tokens.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/assets/main.css src/components/layout/__tests__/navigation-tokens.spec.ts
git commit -m "feat(ui): refine surface-card and menu-item tokens with precision borders and active indicator"
```

---

### Task 2: Layout Shell & Navigation Polish

**Files:**
- Modify: `src/components/layout/AppHeader.vue`
- Modify: `src/components/layout/header/SearchBar.vue`
- Modify: `src/components/layout/AppSidebar.vue`
- Test: `src/components/layout/header/__tests__/SearchBar.spec.ts`

**Interfaces:**
- Consumes: `@utility menu-item-active`, `useSidebar`, `useAuthStore`
- Produces: Glassmorphic header, desktop shortcut badge in search input, and tactile active sidebar navigation.

- [ ] **Step 1: Write unit test for SearchBar shortcut chip**

Add test in `src/components/layout/header/__tests__/SearchBar.spec.ts` verifying that:
1. `<kbd>⌘K</kbd>` chip renders when `term` is empty.
2. Chip disappears when `term` has content, displaying the clear `X` button.
3. Pressing `⌘K` or `Ctrl+K` focuses the input element.

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/components/layout/header/__tests__/SearchBar.spec.ts`
Expected: FAIL (kbd element not found in DOM)

- [ ] **Step 3: Update `src/components/layout/header/SearchBar.vue`**

Add the `<kbd>` badge:
```html
<kbd
  v-if="term === ''"
  class="pointer-events-none absolute end-3 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded border border-hairline bg-surface-soft/80 px-1.5 py-0.5 text-[10px] font-medium text-slate xl:inline-flex dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-gray-400"
  aria-hidden="true"
>
  <span class="text-xs">⌘</span>K
</kbd>
```

- [ ] **Step 4: Update `src/components/layout/AppHeader.vue`**

Change header container class from solid canvas to glassmorphic:
```html
class="sticky top-0 z-[1000] w-full border-b border-gray-200/80 bg-canvas/85 backdrop-blur-md xl:border-b dark:border-white/[0.08] dark:bg-[#17150f]/85"
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run src/components/layout/header/__tests__/SearchBar.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/AppHeader.vue src/components/layout/header/SearchBar.vue src/components/layout/header/__tests__/SearchBar.spec.ts
git commit -m "feat(ui): add glassmorphism to AppHeader and keyboard shortcut chip to SearchBar"
```

---

### Task 3: Core UI Primitives & Micro-Interactions

**Files:**
- Modify: `src/components/ui/Button.vue`
- Modify: `src/components/common/StatCard.vue`
- Modify: `src/components/common/LoadingState.vue`
- Test: `src/components/ui/__tests__/Button.spec.ts`
- Test: `src/components/common/__tests__/StatCard.spec.ts`

**Interfaces:**
- Consumes: Tailwind tokens, Lucide icons
- Produces: Tactile button press animations, micro-hover stat cards, and skeleton pulse states.

- [ ] **Step 1: Write unit tests for Button press states and StatCard**

Verify Button emits click and carries `active:scale-[0.98]` class. Verify StatCard renders icon chip container and formatted figure.

- [ ] **Step 2: Run test to observe baseline**

Run: `npx vitest run src/components/ui/__tests__/Button.spec.ts src/components/common/__tests__/StatCard.spec.ts`

- [ ] **Step 3: Update `src/components/ui/Button.vue`**

Add tactile press scaling and subtle button depth:
```html
'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all duration-150 active:scale-[0.98]'
```
Update primary variant to include `shadow-xs hover:shadow-sm`.

- [ ] **Step 4: Update `src/components/common/StatCard.vue`**

Update icon container chip and typography:
```html
<span class="flex size-10 items-center justify-center rounded-lg border border-hairline/80 bg-surface-soft text-brand-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-brand-400">
  <component :is="icon" class="size-5" aria-hidden="true" />
</span>
```

- [ ] **Step 5: Update `src/components/common/LoadingState.vue`**

Add skeleton placeholder pulse cards alongside the accessible spinner.

- [ ] **Step 6: Run tests and verify pass**

Run: `npx vitest run src/components/ui/__tests__/Button.spec.ts src/components/common/__tests__/StatCard.spec.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/Button.vue src/components/common/StatCard.vue src/components/common/LoadingState.vue
git commit -m "feat(ui): add tactile press states to Button and refined styling to StatCard and LoadingState"
```

---

### Task 4: Student Dashboard Polish

**Files:**
- Modify: `src/views/student/Dashboard.vue`
- Test: `src/views/student/__tests__/Dashboard.spec.ts` (or run e2e regression)

**Interfaces:**
- Consumes: `loadStudentDashboard`, `StatCard`, `surface-card-interactive`, `Button`
- Produces: Elevated "Continue Learning" hero card, sleek progress meter, and polished deadlines/grades rows.

- [ ] **Step 1: Inspect `src/views/student/Dashboard.vue` and run existing tests**

Run: `npx vitest run src/views/student/`

- [ ] **Step 2: Update "Continue Learning" section in `src/views/student/Dashboard.vue`**

1. Elevate the container with `surface-card` styling and subtle brand accent highlight.
2. Add a sleek progress bar with brand gradient fill and percentage pill.
3. Add hover arrow micro-translate (`group-hover:translate-x-1 transition-transform`) to the "Resume lesson" button.
4. Refine the grade list and deadlines items using `surface-card-interactive` with score pills.

- [ ] **Step 3: Run tests to verify no regressions**

Run: `npx vitest run src/views/student/`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/views/student/Dashboard.vue
git commit -m "feat(student): elevate Continue Learning hero card, progress bar, and list rows"
```

---

### Task 5: Instructor & Admin Dashboards Polish

**Files:**
- Modify: `src/views/instructor/Dashboard.vue`
- Modify: `src/views/admin/Dashboard.vue`
- Modify: `src/components/common/TrendChart.vue`

**Interfaces:**
- Consumes: `StatCard`, `TrendChart`, `loadInstructorDashboard`, `loadAdminDashboard`
- Produces: Polished quiz activity feed, tabular revenue metrics, and refined trend area chart container.

- [ ] **Step 1: Update `src/views/instructor/Dashboard.vue`**

1. Enhance the quiz activity feed with clean status indicator dots (green for "Submitted", amber for "Ran out of time").
2. Elevate course overview cards with published status pills and student count chips.

- [ ] **Step 2: Update `src/views/admin/Dashboard.vue` & `TrendChart.vue`**

1. Format revenue metrics using tabular numerals (`font-mono tracking-tight font-semibold`).
2. Polish the recent payments feed with payment method badges (Card, GCash, Maya) and timestamp metadata.
3. In `TrendChart.vue`, refine container borders and ensure skeleton loading state matches the updated card styling.

- [ ] **Step 3: Run test suite**

Run: `npm run test`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/views/instructor/Dashboard.vue src/views/admin/Dashboard.vue src/components/common/TrendChart.vue
git commit -m "feat(instructor,admin): polish instructor quiz feed, admin revenue cards, and trend chart container"
```

---

### Task 6: System Verification & Quality Gate Audit

**Files:**
- Audit all modified files

**Interfaces:**
- Consumes: All updated components and stylesheets
- Produces: 100% clean build, type check, lint, and test suite.

- [ ] **Step 1: Run type checking**

Run: `npm run type-check`
Expected: EXIT=0, 0 type errors.

- [ ] **Step 2: Run ESLint**

Run: `npx eslint src/`
Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Run Vitest test suite**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 4: Run production build**

Run: `npm run build`
Expected: Clean build into `dist/`.

- [ ] **Step 5: Commit any final touch-ups**

```bash
git add -A
git commit -m "chore(ui): complete modern high-tech saas ui/ux polish verification"
```
