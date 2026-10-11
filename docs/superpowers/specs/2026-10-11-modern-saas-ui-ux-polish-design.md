# Modern High-Tech SaaS UI/UX Polish — Design Spec

**Date:** 2026-10-11  
**Status:** Approved  
**Aesthetic Profile:** Modern High-Tech SaaS (Linear / Vercel style) infused into the Warm-Minimalist Canvas of [DESIGN.md](file:///d:/LMS_PROJECT/lms-project-vue-tail/DESIGN.md)

---

## 1. Overview & Goals

The objective of this specification is to elevate the IT Learning Hub LMS interface into a state-of-the-art web application. The visual direction aligns with **Modern High-Tech SaaS**—distinguished by deeper subtle contrasts, glassmorphic headers, tactile micro-interactions, keyboard shortcut indicators, crisp status pills, and sleek metric cards—while remaining completely faithful to the warm minimalism and strict token constraints established in [DESIGN.md](file:///d:/LMS_PROJECT/lms-project-vue-tail/DESIGN.md) and [AGENTS.md](file:///d:/LMS_PROJECT/lms-project-vue-tail/AGENTS.md).

### Non-Goals
* No modifications to database schemas, Postgres RLS, or Supabase queries (`src/services/` contracts remain identical).
* No addition of external third-party CSS or JS frameworks without prior consent.
* No regressions in accessibility, contrast (minimum WCAG AA 4.5:1), or responsive layouts across viewports.

---

## 2. Token Architecture & Surface Utilities (`src/assets/main.css`)

### 2.1 Surfaces & Elevations
* **`surface-card`**: Refined border precision and subtle hover response:
  * Light mode: `rounded-lg border border-gray-200/90 bg-white p-6 transition-all duration-200 shadow-none`
  * Dark mode: `dark:border-white/[0.08] dark:bg-white/[0.025]`
* **`surface-card-interactive`**: Tactile pointer elevation:
  * Light mode: `hover:border-brand-400 hover:bg-gray-50/80 hover:shadow-xs transition-all duration-150`
  * Dark mode: `dark:hover:border-brand-500/40 dark:hover:bg-white/[0.05] dark:hover:shadow-xs`
* **`surface-card-shell`**: Padded by children, sharing the same precision border and background treatment.

### 2.2 Navigation Menu Tokens
* **`menu-item-active`**:
  * Light mode: `relative bg-brand-50/80 text-brand-700 before:absolute before:start-0 before:top-2 before:bottom-2 before:w-[2.5px] before:rounded-full before:bg-brand-600`
  * Dark mode: `dark:bg-brand-500/[0.12] dark:text-brand-300 dark:before:bg-brand-400`
* **`menu-item-inactive`**:
  * Smooth transition: `transition-all duration-150 ease-out hover:bg-gray-100/70 text-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.05] dark:hover:text-white`

---

## 3. Layout Shell & Navigation

### 3.1 Glassmorphic Header (`src/components/layout/AppHeader.vue`)
* Sticky top bar rendered with `bg-canvas/85 dark:bg-[#17150f]/85 backdrop-blur-md border-b border-gray-200/80 dark:border-white/[0.08]`.
* Icon button controls (`HeaderIconButton.vue`) augmented with subtle active scale feedback (`active:scale-95 duration-150`).

### 3.2 Search Bar with Keyboard Shortcut Chip (`src/components/layout/header/SearchBar.vue`)
* When search term is empty on viewports `>= xl`, display a sleek shortcut badge:
  ```html
  <kbd class="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 hidden xl:inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-slate border border-hairline bg-surface-soft/80 dark:bg-white/[0.06] dark:border-white/[0.1] dark:text-gray-400">
    <span class="text-xs">⌘</span>K
  </kbd>
  ```
* Seamlessly swaps to clear (`X`) button when a search query is typed.
* Precision focus glow using `focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500`.

### 3.3 Application Sidebar (`src/components/layout/AppSidebar.vue`)
* Active navigation links highlight with a 2.5px brand indicator bar on the leading edge (`before:absolute before:start-0`).
* Collapsed rail and drawer modes preserve flawless icon alignment and smooth 200ms ease-out transitions.

---

## 4. UI Primitives & Micro-Interactions

### 4.1 Buttons (`src/components/ui/Button.vue`)
* Tactile response: `active:scale-[0.98] transition-all duration-150 ease-out`.
* Primary variant: `shadow-xs hover:shadow-sm hover:bg-brand-600 active:bg-brand-700` with high-contrast text.
* Outline variant: `border border-hairline hover:bg-surface-soft active:bg-surface dark:border-white/[0.1] dark:hover:bg-white/[0.04]`.
* Smooth loading state with spinner alignment that avoids layout shift.

### 4.2 Metric Stat Cards (`src/components/common/StatCard.vue`)
* Micro-hover response: `hover:border-brand-300/70 dark:hover:border-brand-500/30 transition-all duration-200`.
* Icon chip: `rounded-lg bg-surface-soft border border-hairline/80 dark:bg-white/[0.04] dark:border-white/[0.08] text-brand-600 dark:text-brand-400`.
* Typography: semibold numerical figures with tight tracking (`tracking-tight text-xl font-semibold text-gray-900 dark:text-white/90`).

### 4.3 Skeleton & Empty States (`LoadingState.vue` & `EmptyState.vue`)
* `LoadingState.vue`: Clean animated pulse placeholders with rounded-lg edges.
* `EmptyState.vue`: Refined icon container, clear subtitle typography, and prominent call to action.

---

## 5. Role Dashboards & Feature Widgets

### 5.1 Student Dashboard (`src/views/student/Dashboard.vue`)
* **Hero "Continue Learning" Card:**
  * Elevated card with module/lesson badges.
  * Sleek progress bar with brand gradient fill (`bg-brand-500 dark:bg-brand-400`) and numeric percentage pill.
  * Interactive "Resume lesson" button with chevron micro-translate on hover (`group-hover:translate-x-1 transition-transform`).
* **Recent Grades & Upcoming Deadlines:**
  * Interactive rows (`surface-card-interactive`) with pill score tags and status icons.

### 5.2 Instructor Dashboard (`src/views/instructor/Dashboard.vue`)
* **Quiz Activity Feed:**
  * Student avatar integration, clean attempt status badges (green dot for "Submitted", amber dot for "Ran out of time").
* **Course Overview Cards:**
  * Published status pill, enrolled student count chips, and quick action buttons.

### 5.3 Admin Dashboard (`src/views/admin/Dashboard.vue`)
* **Financial Metrics:**
  * Tabular numeral revenue figures (`font-mono tracking-tight font-semibold`).
* **Trend Area Chart (`TrendChart.vue`):**
  * Subtle hairline container border, smooth skeleton loading branch, and clean axis typography.
* **Recent Payments Feed:**
  * Transaction rows with method badges (Card, GCash, Maya), timestamp metadata, and quick navigation.

---

## 6. Accessibility, RTL & Quality Verification

### 6.1 Contrast & Accessibility (WCAG AA)
* Minimum 4.5:1 text contrast for body/labels, 3:1 for large display text and active UI indicators.
* Screen reader compliance: all interactive chips, icon controls, and badges provide explicit `aria-label` or semantic text.
* Visible focus rings: `focus-visible:outline-2 focus-visible:outline-brand-500` preserved across all clickable elements.

### 6.2 Bidirectional RTL Support
* Exclusively utilize CSS logical spacing utilities (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `border-s-*`, `rounded-s-*`).
* Zero physical directional hardcodes (`ml-*`, `mr-*`, `left-*`, `right-*`).

### 6.3 Gate Checks
Every phase of implementation must satisfy:
* `npm run type-check` (Exit code 0)
* `npx eslint src/` (0 errors)
* `npm run test` (All 456+ tests passing)
* `npm run build` (Clean production bundle)
