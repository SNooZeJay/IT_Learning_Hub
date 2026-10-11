# Public Pages on shadcn-vue - Design

**Date:** 2026-10-11
**Status:** Draft for review
**Supersedes:** nothing. Sits beside `2026-10-11-modern-saas-ui-ux-polish-design.md`,
whose landing-page work was reverted after review.

---

## 1. Context

The landing-page redesign in the modern-SaaS polish spec was reverted. Reviewer
verdict: the composition was better than the replacement. Concretely, the
reverted work removed `DepthCarousel` from the hero, collapsed the hero to one
green primary CTA, deleted the 6/18/54 figures row, restructured the dark value
strip, and dropped the category eyebrow from course covers. All five were
judged regressions.

That failure has one transferable lesson, and this spec is built on it:
**composition is a decision the reviewer owns.** shadcn-vue here is a
substitution of implementation, not of arrangement.

## 2. Goal

Rebuild the 11 public pages on shadcn-vue primitives, preserving the committed
identity (green `#1f6b46`, cream canvas, Source Serif 4 display) and the
existing page composition exactly.

Success is defined as craft, not appearance change:

- Every interactive control on a public page is a real component with correct
  semantics - bound labels, focus rings, disabled/loading states.
- One `Button` implementation governs every CTA on the public surface.
- Zero visual or behavioural change to the signed-in application.

## 3. Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Keep the identity, take shadcn's structure | The palette and type were not the problem |
| 2 | Isolate shadcn to public pages only | 50+ app files depend on shared primitives the reviewer values |
| 3 | Rebuild all 11 public pages | A half-rebuilt auth funnel reads as broken, not intentional |
| 4 | Bridge shadcn's CSS variables to the existing `lp-*` tokens | One source of truth for the green |

## 4. The frozen boundary

Four components are shared with the signed-in application and **must not change**:

| Component | public imports | app importers |
|---|---|---|
| `EmptyState` | 3 | 28 |
| `Alert` | 8 | 22 |
| `BrandMark` | 3 | 4 |
| `ThemeToggleButton` | 3 | 2 |

Public pages continue to import these from their existing paths, untouched.
`EmptyState` and `Alert` are the hard constraint - 50 app files render them.

Permitted to change, because they are effectively public-only (remaining
references are tests). Note `DepthCarousel` is permitted but *not planned* to
change - see section 11:

- `AuthShell.vue` - 5 public, 1 test
- `AuthConsent.vue` - 2 public
- `CatalogueCard.vue` - 2 public, 1 test
- `CourseCover.vue` - 2 public, 2 tests
- `DepthCarousel.vue` - 1 public, 1 test

`BrandMark` and `ThemeToggleButton` being shared is the seam's best property:
the logo and the theme toggle are the *same objects* before and after sign-in,
so the boundary reads as deliberate rather than as two products.

## 5. Token bridge

shadcn-vue components are written against `--background`, `--foreground`,
`--primary`, `--card`, `--muted`, `--border`, `--ring`, `--radius`. None of
these exist today - `main.css` has the legacy TailAdmin `@theme` palette and the
`--ith-lp-*` set, and no shadcn variable system at all.

The bridge aliases shadcn's names onto the existing `--ith-lp-*` values rather
than copying hex values, so the green is defined once:

```css
:root {
  --background: var(--ith-lp-canvas);
  --foreground: var(--ith-lp-ink);
  --card: var(--ith-lp-card);
  --primary: var(--ith-lp-accent);
  --primary-foreground: var(--ith-lp-ink-inverse);
  --muted: var(--ith-lp-canvas-deep);
  --muted-foreground: var(--ith-lp-slate);
  --border: var(--ith-lp-line);
  --ring: var(--ith-lp-accent);
  --radius: 0.5rem;
}
```

`.dark` repeats the block against the dark `--ith-lp-*` values. `@custom-variant
dark (&:is(.dark *))` is already declared at `src/assets/main.css:38`, so the
dark side needs no new mechanism.

Copies of hex values are explicitly rejected here: two sources of truth drift,
and a palette edit would then silently apply to one system and not the other.

The block above is illustrative, not exhaustive. shadcn-vue components also
reference `--secondary`, `--accent`, `--destructive`, `--popover`, `--input`,
`--card-foreground`, `--secondary-foreground` and `--accent-foreground`. All of
them get a mapping onto an existing `--ith-lp-*` token or a `color-mix()` of one;
no shadcn variable is left undefined, and no hex value is introduced that is not
already in `main.css`.

## 6. Layout

New, all additive:

- `components.json` - alias `@/*`, CSS `src/assets/main.css`, base colour
  `stone`, components namespace `src/components/public/ui`
- `src/assets/public-theme.css` - the bridge block, imported from `main.css`
- `src/components/public/ui/` - shadcn components

The namespace is **not** `src/components/ui/`, which already holds TailAdmin's
`Button.vue`, `Badge.vue`, `Alert.vue`, `Modal.vue`, `ConfirmDialog.vue`,
`ToastHost.vue`. Writing shadcn components there would put two button systems
in one directory.

Packages added - shadcn-vue's own dependencies, none currently installed:

`reka-ui`, `tailwind-variants`, `class-variance-authority`, `clsx`,
`tailwind-merge`, `tw-animate-css`

AGENTS.md forbids adding packages without asking. This section is that ask.

## 7. Per-page plan

Composition is unchanged on every page. Listed is what is substituted.

**`Landing.vue`** (1612 lines) - carousel, figures row, value strip, section
order and all copy retained verbatim. Every CTA becomes `<Button>`; the seven
hand-written CTA class strings that each choose their own padding and radius are
replaced by one variant set.

**`Catalog.vue`** (517) - category filter becomes `Select`; loading becomes
`Skeleton`; level indicators become `Badge`; `CatalogueCard` rebuilt on `Card`.

**`CoursePage.vue`** (487) - module/lesson curriculum becomes `Accordion`,
replacing custom expand/collapse and its bespoke focus handling; hero actions
become `Button`; `CourseCover` untouched.

**`Login.vue`** (277), **`Register.vue`** (282) - inputs become `Input` with
bound `Label`; `AuthConsent` becomes `Checkbox`; `AuthShell` rebuilt on `Card`.
This is the largest genuine gain: form controls are currently styled through
`controlClasses.ts`, a shared class string, which cannot express label
association, `aria-invalid`, or `aria-describedby` error wiring.

**`ForgotPassword.vue`** (103), **`ResetPassword.vue`** (303),
**`VerifyCodeStep.vue`** (194) - same treatment as Login, sharing `AuthShell`.

**`LegalDocument.vue`** (80), **`TermsOfService.vue`** (138),
**`PrivacyPolicy.vue`** (114) - prose layout, no component substitution.

**Components used:** `Button`, `Card`, `Input`, `Label`, `Checkbox`, `Badge`,
`Select`, `Skeleton`, `Accordion`, `Separator`.

## 8. Accessibility

The stated purpose of the rebuild. Each is testable:

- Every `<Input>` has a `<Label bound by `for`/`id`
- Invalid inputs carry `aria-invalid` and point at their error text via
  `aria-describedby`
- Every focusable control has a visible `:focus-visible` ring
- `Checkbox` in `AuthConsent` is real, keyboard-operable, and labelled
- All touch targets remain ≥44px, which `touch-targets.spec.ts` already asserts

## 9. Verification

**Gates** - all clean before the work is called done:

`npm run type-check`, `npm run lint`, `npm run test`, `npm run build`, and
`npx prettier --check` (CI runs it first; it has failed twice).

**Regression risk** - `touch-targets.spec.ts` asserts on `AuthShell.vue` and
`DepthCarousel.vue`; `course-cover.spec.ts` asserts on `CatalogueCard.vue` and
`CourseCover.vue`. The 513-test suite may not shrink. A test broken by an
intentional markup contract change is updated deliberately and reported, never
quietly deleted.

**New tests** - label binding, 44px targets, and theme-bridge resolution
(primary resolves to the same value in light and dark).

**Visual gate** - before/after screenshots for all 11 pages at 1440x900 and
390x844, light and dark, each asserting zero horizontal overflow. Overflow
shipped a broken mobile lesson page once; the assertion is cheap.

**Review gate** - the work stays uncommitted on the branch until the reviewer
has scrolled the running site and confirmed it. Commit, push, and deploy are
separate approvals.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Output looks near-identical | Stated in advance, section 7. It is the honest consequence of "keep composition" |
| shadcn's plain aesthetic reads as generic | Inherits the cream/green via the bridge; no shadcn defaults ship |
| Form controls regress on the dashboards | Frozen boundary, section 4 |
| `tw-animate-css` fights the existing animation utilities | Import is additive and scoped to `src/components/public/**` |
| Visible seam at sign-in | Accepted by the reviewer; `BrandMark` and `ThemeToggleButton` are shared, which is what makes it read as intentional |

## 11. Out of scope

- The signed-in application: dashboards, admin, instructor, student views
- `src/components/ui/` TailAdmin primitives
- `DESIGN.md` - the identity is preserved, so it does not change
- Replacing `DepthCarousel` with shadcn `Carousel` - out of scope on purpose,
  since the carousel is not what failed review
- Dependency or schema changes of any kind