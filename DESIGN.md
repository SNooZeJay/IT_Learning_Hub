---
version: alpha
name: Notion-design-analysis
description: 'A warm-minimal workspace canvas: white and warm-grey surfaces, near-black ink, signature purple (#5645d4) reserved for the dominant CTA, and sober-editorial geometry — 8px buttons, 12px cards, pills only for badges and tabs. Type runs Inter, the face Notion itself uses, at weight 600 for every display size with negative tracking that grows as the type grows, 500 for UI labels, 400 for body. Pastel feature tints (peach, rose, mint, lavender, sky, yellow) carry accent panels; deep navy hero bands carry the landing page. Typeface superseded IBM Plex Sans, then colour, neutrals and radius superseded IBM Carbon on 2026-10-05.'

colors:
  primary: '#5645d4'
  on-primary: '#ffffff'
  primary-pressed: '#4534b3'
  primary-deep: '#3a2a99'
  brand-navy: '#0a1530'
  brand-navy-deep: '#070f24'
  brand-navy-mid: '#1a2a52'
  link-blue: '#0075de'
  brand-orange: '#dd5b00'
  brand-pink: '#ff64c8'
  brand-purple: '#7b3ff2'
  brand-teal: '#2a9d99'
  brand-green: '#1aae39'
  brand-yellow: '#f5d75e'
  ink: '#1a1a1a'
  ink-deep: '#000000'
  charcoal: '#37352f'
  slate: '#5d5b54'
  steel: '#787671'
  stone: '#a4a097'
  muted: '#bbb8b1'
  canvas: '#ffffff'
  surface: '#f6f5f4'
  surface-soft: '#fafaf9'
  hairline: '#e5e3df'
  hairline-soft: '#ede9e4'
  hairline-strong: '#c8c4be'
  card-tint-peach: '#ffe8d4'
  card-tint-rose: '#fde0ec'
  card-tint-mint: '#d9f3e1'
  card-tint-lavender: '#e6e0f5'
  card-tint-sky: '#dcecfa'
  card-tint-yellow: '#fef7d6'
  card-tint-yellow-bold: '#f9e79f'
  card-tint-cream: '#f8f5e8'
  inverse-canvas: '#1a1a1a'
  inverse-surface-1: '#37352f'
  inverse-ink: '#ffffff'
  inverse-ink-muted: '#a4a097'
  semantic-success: '#1aae39'
  semantic-warning: '#dd5b00'
  semantic-error: '#e03131'

typography:
  display-xl:
    fontFamily: Inter
    fontSize: 72px
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: -0.025em
  display-lg:
    fontFamily: Inter
    fontSize: 60px
    fontWeight: 600
    lineHeight: 1.10
    letterSpacing: -0.02em
  display-md:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -0.015em
  headline:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: 600
    lineHeight: 1.20
    letterSpacing: -0.01em
  card-title:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.005em
  subhead:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.40
    letterSpacing: 0
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.50
    letterSpacing: 0
  body:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 0
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.50
    letterSpacing: 0
  body-emphasis:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.50
    letterSpacing: 0
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.33
    letterSpacing: 0
  button:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.30
    letterSpacing: 0
  eyebrow:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.30
    letterSpacing: 0

rounded:
  none: 0px
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  xxl: 20px
  xxxl: 24px
  pill: 9999px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 96px

components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    typography: '{typography.button}'
    rounded: '{rounded.md}'
    padding: 12px 16px
  button-primary-pressed:
    backgroundColor: '{colors.primary-pressed}'
    textColor: '{colors.on-primary}'
    typography: '{typography.button}'
    rounded: '{rounded.md}'
  button-secondary:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.inverse-ink}'
    typography: '{typography.button}'
    rounded: '{rounded.md}'
    padding: 12px 16px
  button-tertiary:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.primary}'
    typography: '{typography.button}'
    rounded: '{rounded.md}'
    padding: 12px 16px
  button-ghost:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.primary}'
    typography: '{typography.button}'
    rounded: '{rounded.md}'
    padding: 12px 16px
  button-danger:
    backgroundColor: '{colors.semantic-error}'
    textColor: '{colors.on-primary}'
    typography: '{typography.button}'
    rounded: '{rounded.md}'
    padding: 12px 16px
  feature-card:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.md}'
    padding: 24px
  feature-card-elevated:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.md}'
    padding: 24px
  product-card:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.md}'
    padding: 32px
  hero-card:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.ink}'
    typography: '{typography.display-md}'
    rounded: '{rounded.md}'
    padding: 48px
  cta-banner:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    typography: '{typography.headline}'
    rounded: '{rounded.md}'
    padding: 48px
  text-input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.md}'
    padding: 11px 16px
  text-input-focused:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.md}'
    padding: 11px 16px
  text-input-error:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.md}'
    padding: 11px 16px
  newsletter-input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.md}'
    padding: 11px 16px
  product-tab:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.slate}'
    typography: '{typography.body-sm}'
    rounded: '{rounded.md}'
    padding: 16px 20px
  product-tab-selected:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.ink}'
    typography: '{typography.body-emphasis}'
    rounded: '{rounded.md}'
    padding: 16px 20px
  resource-tile:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.ink}'
    typography: '{typography.body-sm}'
    rounded: '{rounded.md}'
    padding: 16px
  customer-logo-tile:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.slate}'
    typography: '{typography.caption}'
    rounded: '{rounded.md}'
    padding: 24px
  top-nav:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.ink}'
    typography: '{typography.body-sm}'
    rounded: '{rounded.md}'
    height: 48px
  utility-bar:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.slate}'
    typography: '{typography.caption}'
    rounded: '{rounded.md}'
    height: 32px
  footer:
    backgroundColor: '{colors.inverse-canvas}'
    textColor: '{colors.inverse-ink-muted}'
    typography: '{typography.body-sm}'
    rounded: '{rounded.md}'
    padding: 64px 32px
---

## Overview

Notion presents itself as a confident, illustration-rich workspace brand. The dominant surface is `{colors.canvas}` white with `{colors.surface}` (#f6f5f4) carrying alternate bands, `{colors.ink}` (#1a1a1a) for text, and signature purple `{colors.primary}` (#5645d4) reserved for the dominant CTA.

The defining choice is **warm minimalism**: the neutrals are warm rather than neutral-grey, so the canvas, the hairlines and the dark surfaces all carry a slight cast. That warmth, more than any single colour value, is what makes the system read as Notion rather than as a generic dashboard.

Geometry is **sober-editorial, not pill-heavy**. Buttons are 8px rectangles (`{rounded.md}`), cards and inputs are 12px and 8px (`{rounded.lg}` / `{rounded.md}`), and pills appear only on status badges, pill tabs and avatars. Getting this wrong in either direction is immediately visible: pill buttons read as a different brand, and 0px corners read as 2015 enterprise software.

**Inter** carries the entire type hierarchy. Display sizes (72 / 60 / 48px) run at weight **600**, with negative tracking that tightens as the type grows — -0.025em at 72px down to -0.01em at 36px. Body type sits at weight 400 with line-height 1.55, and UI labels at 500. Inter is the face Notion itself renders; Notion's own "Notion Sans" is a proprietary Inter fork, so Inter is the same typeface rather than an imitation of one.

Weight is what mattered most on the type. Carbon set display type at 300, and that thin, grey rendering was the single biggest reason the interface read as unfinished. Notion holds 600 all the way to the top, which is where the weight belongs for a product a learner stares at for hours. The positive `letter-spacing: 0.16px` that Carbon put on body copy has also been dropped: it is a precision detail of Plex's metrics and actively fights Inter, which is tuned to sit correctly at zero.

Colour is used deliberately but sparingly. Purple marks the dominant action. Pastel tints (peach, rose, mint, lavender, sky, yellow) carry accent panels, and the bold yellow `{colors.card-tint-yellow-bold}` is reserved for high-emphasis banners. Deep navy `{colors.brand-navy}` is the one dark surface, used for hero bands.

**Key Characteristics:**

- **Warm minimalism** — neutrals are warm-cast (`{colors.surface}` #f6f5f4, `{colors.hairline}` #e5e3df, `{colors.charcoal}` #37352f), never neutral grey. This is the single most identifying trait.
- **Sober-editorial geometry** — buttons 8px (`{rounded.md}`), cards 12px (`{rounded.lg}`), pills only for badges, pill tabs and avatars. Both 0px and pill buttons read as a different brand.
- **Solid display type**: Inter at weight 600 for every display size, with negative tracking above 30px. Supersedes Carbon's weight-300 signature.
- **Purple is a signal, not a palette**: `{colors.primary}` marks the dominant CTA. Not for body text, not for large background surfaces, and never mixed with `{colors.link-blue}` for inline links, because the two have distinct roles.
- White canvas + `{colors.surface}` + `{colors.ink}` cover 95% of surfaces; pastel tints and navy hero bands are the deliberate exceptions.
- Card hierarchy is carried by 1px hairlines and surface change. Shadow, when used at all, is soft and low-opacity — never heavy on flat documentation cards.
- Page rhythm: top nav → hero band (navy, centred, weight-600 headline) → feature card grid → pastel accent panels → stats strip → newsletter / sign-in CTA → light footer.

## Colors

> Source: notion.com marketing surfaces, per the Notion DESIGN.md in awesome-design-md. Token values are Notion's, not approximations.

### Brand & Accent

- **Notion Purple** ({colors.primary}): The signature accent, reserved for the dominant CTA. Never for body text or large background surfaces.
- **Primary Pressed** ({colors.primary-pressed}): Pressed state on the primary button.
- **Primary Deep** ({colors.primary-deep}): Deeper emphasis.
- **Link Blue** ({colors.link-blue}): Inline text links. Distinct from primary purple on purpose — the two have different roles and must not be interchanged.
- **Brand Navy** ({colors.brand-navy}): Hero band background, the one dark surface on marketing pages.
- **Pastel card tints** ({colors.card-tint-peach} through {colors.card-tint-cream}): Accent feature panels. Bold yellow {colors.card-tint-yellow-bold} for high-emphasis banners only.
- **Warm neutrals**: charcoal {colors.charcoal} for body emphasis, slate {colors.slate} / steel {colors.steel} / stone {colors.stone} descending through the text hierarchy. The warmth is load-bearing, not incidental.

### Surface

- **Canvas** ({colors.canvas}): Default page background.
- **Surface 1** ({colors.surface}): Light gray (#f4f4f4) — input fields, alternate-row stripes, subtle section bands.
- **Surface 2** ({colors.surface-2}): Slightly darker gray (#e0e0e0) — disabled fields, hairline-as-fill for separators.
- **Hairline** ({colors.hairline}): 1px borders on cards, inputs, dividers.
- **Hairline Strong** ({colors.hairline-strong}): 1px charcoal underline on focused inputs (Carbon's signature focus treatment).
- **Inverse Canvas** ({colors.inverse-canvas}): Charcoal #161616 — footer surface.
- **Inverse Surface 1** ({colors.inverse-surface-1}): One step lighter than inverse canvas — footer column dividers, hovered footer items.

### Text

- **Ink** ({colors.ink}): All headlines and emphasized body type — charcoal #161616.
- **Ink Muted** ({colors.slate}): Secondary type at #525252 — meta, sub-headlines, footer body.
- **Ink Subtle** ({colors.stone}): Tertiary type at #8c8c8c — disabled, helper text, captions.
- **Inverse Ink** ({colors.inverse-ink}): White on charcoal — footer headings.
- **Inverse Ink Muted** ({colors.inverse-ink-muted}): Light gray on charcoal — footer body.

### Semantic

- **Success Green** ({colors.semantic-success}): Carbon green-50 — success states.
- **Warning Yellow** ({colors.semantic-warning}): Carbon yellow-30 — warning states.
- **Error Red** ({colors.semantic-error}): Carbon red-60 — error states; danger button background.
- **Info Blue** ({colors.semantic-info}): Identical to primary — informational badges.

## Typography

### Font Family

- **Inter** — the typeface Notion renders, by Rasmus Andersson. Neo-grotesque with a tall x-height and single-storey `a`, free under the SIL Open Font License. Fallback: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`.

One family carries display, body, and caption — there is no display + body pairing. Hierarchy is carried by **size, weight, and tracking** rather than by family change.

**On the name.** Notion's own typeface is called "Notion Sans" and is a proprietary Inter fork that is not licensed for third-party use, so it cannot be installed here. Inter is what Notion actually renders, so this is the same typeface rather than a lookalike. Loading Inter as a variable font means weight 600 costs no extra request.

### Hierarchy

| Token                        | Size | Weight | Line Height | Letter Spacing | Use                                       |
| ---------------------------- | ---- | ------ | ----------- | -------------- | ----------------------------------------- |
| `{typography.display-xl}`    | 72px | 600    | 1.08        | -0.025em       | Largest hero headline                     |
| `{typography.display-lg}`    | 60px | 600    | 1.10        | -0.02em        | Section opener headlines                  |
| `{typography.display-md}`    | 48px | 600    | 1.15        | -0.015em       | Sub-section headlines, hero card title    |
| `{typography.headline}`      | 36px | 600    | 1.20        | -0.01em        | Card collection heading, page headline    |
| `{typography.card-title}`    | 30px | 600    | 1.25        | -0.005em       | Feature card title                        |
| `{typography.subhead}`       | 20px | 600    | 1.40        | 0              | Lead body next to display headlines       |
| `{typography.body-lg}`       | 18px | 400    | 1.50        | 0              | Hero subhead, lead paragraphs             |
| `{typography.body}`          | 16px | 400    | 1.55        | 0              | Default body                              |
| `{typography.body-sm}`       | 14px | 500    | 1.50        | 0              | Card body, sidebar labels, footer columns |
| `{typography.body-emphasis}` | 14px | 500    | 1.50        | 0              | Selected tab label, emphasized body line  |
| `{typography.caption}`       | 12px | 500    | 1.33        | 0              | Captions, meta, utility bar               |
| `{typography.button}`        | 14px | 500    | 1.30        | 0              | All button labels                         |
| `{typography.eyebrow}`       | 14px | 500    | 1.30        | 0              | Section eyebrows (sentence case 14px)     |

### Principles

- **Display type is 600, never 300.** This supersedes Carbon's weight-300 signature and is the most consequential rule on this page. Thin display type reads as unpolished in a product, and it was the main reason the interface felt unfinished.
- **Negative tracking scales with size.** Roughly -0.02em per doubling of size, down to 0 at body sizes. This is what keeps large Inter from looking loose.
- **Body leading is 1.55, looser than Carbon's 1.50.** Course and lesson descriptions are most of what a learner reads here.
- **No positive tracking on body copy.** Carbon's `0.16px` was tuned for Plex's metrics and fights Inter, which is drawn to sit correctly at zero.
- **No mono** on marketing surfaces.
- **Line-heights tighten on display, relax on body**: 1.08 at display-xl, 1.55 at body.

### Note on Font Substitutes

Inter is **free and open-source** (SIL OFL license) and available on Google Fonts as a variable font. Load the latin subset only: Google returns seven `@font-face` blocks for this request, and English text never uses the other six. If the Google CSS changes its filenames, a hardcoded preload URL in `index.html` goes stale and costs one wasted request — it cannot cause the wrong font to render, since the `@font-face` rules remain the authority.

## Layout

### Spacing System

- **Base unit**: 4px (Carbon's signature 4-pixel grid).
- **Tokens (front matter)**: `{spacing.xxs}` 4px · `{spacing.xs}` 8px · `{spacing.sm}` 12px · `{spacing.md}` 16px · `{spacing.lg}` 24px · `{spacing.xl}` 32px · `{spacing.xxl}` 48px · `{spacing.section}` 96px.
- Card interior padding: `{spacing.lg}` 24px on feature cards; `{spacing.xl}` 32px on product cards; `{spacing.xxl}` 48px on hero cards and CTA banners.
- Button padding: 12px vertical · 16px horizontal — Carbon spec.
- Form input padding: 11px vertical · 16px horizontal.

### Grid & Container

- Carbon's 16-column grid at desktop, scaling to 8 / 4 columns at tablet / mobile.
- Max content width sits around 1584px (Carbon's max-grid breakpoint).
- Card grids are 4-up at desktop, 2-up at tablet, 1-up at mobile.
- The customer logo marquee uses fixed-width tiles in a flex row, scrolling horizontally on smaller viewports.

### Whitespace Philosophy

Precise alignment to a 4-pixel grid is the whitespace system, and it is unchanged. What has changed is what separates sections: `{colors.surface}` (#f6f5f4) rows rather than neutral grey, so the banding carries the same warmth as everything else.

## Elevation & Depth

| Level            | Treatment                                                                 | Use                                           |
| ---------------- | ------------------------------------------------------------------------- | --------------------------------------------- |
| 0 (flat)         | No shadow, no border                                                      | Default for body type, hero text, footer body |
| 1 (hairline)     | 1px `{colors.hairline}` border on canvas                                  | Feature cards, inputs, list items             |
| 2 (surface lift) | `{colors.surface}` background on canvas                                   | Alternate-row banners, hovered cards          |
| 3 (focus ring)   | 2px `{colors.primary}` outline + 1px `{colors.hairline-strong}` underline | Focused input, focused button                 |

Carbon resists drop shadows on marketing — depth is carried by surface change and 1px hairlines. The exception is product / app surfaces (Carbon documents shadow tokens for elevated panels), but the marketing site barely uses them.

### Decorative Depth

- **Soft blue gradient backdrops** appear behind some hero illustrations — a faint blue-to-white wash that warms the canvas without competing with the headline.
- **No atmospheric depth.** No spotlight cards, no pastel section blocks, no gradient panels.

## Shapes

### Border Radius Scale

| Token            | Value  | Use                                                        |
| ---------------- | ------ | ---------------------------------------------------------- |
| `{rounded.xs}`   | 4px    | Tag chips                                                  |
| `{rounded.sm}`   | 6px    | Type badges, quiet ghost buttons                           |
| `{rounded.md}`   | 8px    | **Buttons and inputs.** The most common radius on the site |
| `{rounded.lg}`   | 12px   | **Cards**, feature tiles, panels, pricing tiers            |
| `{rounded.xl}`   | 16px   | Larger feature panels                                      |
| `{rounded.2xl}`  | 20px   | Featured product showcases                                 |
| `{rounded.3xl}`  | 24px   | Larger feature cards                                       |
| `{rounded.pill}` | 9999px | Status badges and pill tabs **only** — never a button      |

The button/card distinction is the point: 8px on buttons, 12px on cards. Notion's geometry is sober-editorial, and getting it wrong is immediately legible. Pill buttons read as a different brand; 0px corners read as enterprise software from a decade ago.

`{rounded.pill}` is restricted to status badges, pill tabs, avatars and toggle switches. If a pill is about to be applied to a button, it should be `{rounded.md}` instead.

### Photography & Illustration Geometry

- IBM uses photography (people, hardware, sports cars) and abstract illustration (geometric mesh, dotted patterns) interchangeably.
- Image frames are flat — no rounded corners.
- Customer logo tiles sit on `{rounded.lg}` 12px tiles with thin 1px borders.

## Components

### Buttons

**`button-primary`** — Blue solid CTA. The default primary across all pages.

- Background `{colors.primary}`, text `{colors.on-primary}`, type `{typography.button}`, padding 12px 16px, rounded `{rounded.md}`.
- Pressed state lives in `button-primary-pressed` (background shifts to `{colors.primary-pressed}`).

**`button-secondary`** — Charcoal solid button — Carbon's "secondary" treatment.

- Background `{colors.ink}`, text `{colors.inverse-ink}`, type `{typography.button}`, padding 12px 16px, rounded `{rounded.md}`.

**`button-tertiary`** — White button with blue 1px border + blue text. Used for tertiary CTAs.

- Background `{colors.canvas}`, text `{colors.primary}`, type `{typography.button}`, rounded `{rounded.md}`, padding 12px 16px. (Border in implementation: 1px `{colors.primary}`.)

**`button-ghost`** — Plain text + chevron, no background until hover.

- Background `{colors.canvas}`, text `{colors.primary}`, type `{typography.button}`, rounded `{rounded.md}`, padding 12px 16px.

**`button-danger`** — Carbon's destructive variant.

- Background `{colors.semantic-error}`, text `{colors.on-primary}`, type `{typography.button}`, rounded `{rounded.md}`, padding 12px 16px.

### Cards & Containers

**`feature-card`** — Default feature highlight tile on the home and product pages.

- Background `{colors.canvas}`, text `{colors.ink}`, type `{typography.body}`, rounded `{rounded.md}`, padding 24px. Stroked with 1px `{colors.hairline}`.

**`feature-card-elevated`** — Same shape on `{colors.surface}` ground — used for "Recommended" cards in the latest-content carousel.

- Background `{colors.surface}`, otherwise identical structure.

**`product-card`** — Larger product showcase tile.

- Background `{colors.canvas}`, text `{colors.ink}`, type `{typography.body}`, rounded `{rounded.md}`, padding 32px.

**`hero-card`** — Hero composition card with a weight-600 title, body, and CTA.

- Background `{colors.canvas}`, text `{colors.ink}`, type `{typography.display-md}`, rounded `{rounded.md}`, padding 48px.

**`cta-banner`** — Full-width blue CTA panel near the bottom of the page.

- Background `{colors.primary}`, text `{colors.on-primary}`, type `{typography.headline}`, rounded `{rounded.md}`, padding 48px.

**`resource-tile`** — Smaller article / case-study tile.

- Background `{colors.canvas}`, text `{colors.ink}`, type `{typography.body-sm}`, rounded `{rounded.md}`, padding 16px.

**`customer-logo-tile`** — Single tile in the customer marquee on the home page (Ferrari, Pfizer, etc.).

- Background `{colors.canvas}`, text `{colors.slate}`, type `{typography.caption}`, rounded `{rounded.md}`, padding 24px. 1px hairline border.

### Inputs & Forms

**`text-input`** + **`text-input-focused`** + **`text-input-error`** — Carbon's input chrome.

- Background `{colors.surface}`, text `{colors.ink}`, type `{typography.body}`, rounded `{rounded.md}`, padding 11px 16px.
- Focus state replaces the bottom 1px hairline with a 2px `{colors.primary}` underline (Carbon's signature focus treatment).
- Error state adds 2px `{colors.semantic-error}` bottom underline.

**`newsletter-input`** — The "Stay connected" newsletter capture on the home page.

- Background `{colors.surface}`, text `{colors.ink}`, type `{typography.body}`, rounded `{rounded.md}`, padding 11px 16px. Adjacent submit is `button-primary`.

### Tabs

**`product-tab`** + **`product-tab-selected`** — The horizontal tab strip on product pages and the home "Recommended" carousel.

- Default: `{colors.canvas}` background, `{colors.slate}` text, rounded `{rounded.md}`, padding 16px 20px. Bottom 1px hairline.
- Selected: `{colors.canvas}` background, `{colors.ink}` text, `{typography.body-emphasis}` weight, bottom 2px `{colors.primary}` underline. Same padding / rounding.

### Navigation

**`top-nav`** — Sticky white bar with the IBM logomark left, nav categories center, and search / sign-in icons right.

- Background `{colors.canvas}`, text `{colors.ink}`, type `{typography.body-sm}`, height 48px. 1px bottom hairline.

**`utility-bar`** — Slim gray ribbon above the top nav with location switch, contact, search shortcuts.

- Background `{colors.surface}`, text `{colors.slate}`, type `{typography.caption}`, height 32px.

### Footer

**`footer`** — Charcoal footer (`{colors.inverse-canvas}`) with the IBM wordmark left and 5–6 columns of caption-sized links. The only inverted surface above the page break.

- Background `{colors.inverse-canvas}`, text `{colors.inverse-ink-muted}`, type `{typography.body-sm}`, padding 64px 32px.

## Do's and Don'ts

### Do

- Use `{rounded.md}` 8px on buttons and inputs, `{rounded.lg}` 12px on cards. The distinction is the geometry.
- Set display type at **600** with negative tracking that grows with size. Do not go below 600, and do not push to 700.
- Reserve `{colors.primary}` purple for the dominant CTA. Do not use it for body text, large background surfaces, or inline links — links are `{colors.link-blue}`.
- Use 1.55 line-height on body. Inter is drawn for slightly looser leading than Carbon assumed.
- Use surface change (`canvas` → `surface`) and 1px warm hairlines for card hierarchy. Shadow stays soft and low-opacity, and never lands on a flat card.
- Use the pastel tints for accent panels, and bold yellow only for high-emphasis banners.
- Stick to sentence case for eyebrows and section labels.

### Don't

- Don't use pill-shaped buttons. Pills belong to status badges, pill tabs and avatars. Notion's geometry is rectangular-sober.
- Don't collapse corners to 0px. That was the old Carbon look and it reads as enterprise software from a decade ago.
- Don't set display headlines below weight 600. This is the rule most easily regressed: `font-light` on a large number is the single thing that made the old build look unfinished.
- Don't add atmospheric depth — gradient backdrops, heavy drop shadows, atmospheric overlays.
- Don't reintroduce IBM Blue or IBM Plex Sans, and don't add positive tracking to body copy — the old Carbon `0.16px` fights Inter's metrics.
- Don't use purple as a large background surface or for body text.
- Don't write all-caps tracked eyebrows. Carbon's eyebrows are sentence case at 14px.

## Responsive Behavior

### Breakpoints

| Name       | Width  | Key Changes                                   |
| ---------- | ------ | --------------------------------------------- |
| Max        | 1584px | Carbon max grid; gutters expand               |
| Desktop-XL | 1312px | Default desktop layout                        |
| Desktop    | 1056px | Card grid 4-up maintained                     |
| Tablet     | 672px  | Card grid 4-up → 2-up; nav becomes hamburger  |
| Mobile     | 320px  | Single-column; display-xl scales 76px → ~32px |

### Touch Targets

- Carbon spec: 48px minimum tap target. Buttons and inputs hold 48px on touch viewports.
- Top-nav links grow from 36px to 48px tap height on touch.
- Tab strip rows hold 48px tap height.

### Collapsing Strategy

- **Top nav**: links collapse to a hamburger overlay below 672px. Logomark and search icon stay on the bar.
- **Utility bar**: hides below 672px to reclaim vertical space.
- **Card grid**: 4-up → 2-up at 1056px → 1-up below 672px.
- **Display type**: `{typography.display-xl}` 72px scales toward 36px on mobile, holding weight 600 and negative tracking throughout. Tighten tracking rather than dropping weight when space is short.
- **Footer**: 6-column link grid → 3-column at tablet → 1-column at mobile.

### Image Behavior

- Customer logos in the marquee maintain aspect ratio and may collapse to 2-row scroll below 672px.
- Hero illustrations scale proportionally; below 672px they may stack above the headline rather than sit beside it.

## Iteration Guide

1. Focus on ONE component at a time and reference it by its `components:` token name.
2. Default body to `{typography.body}` at weight 400, line-height 1.55, no letter-spacing. Display type defaults to weight 600 — never below it.
3. When introducing a new section, decide whether it sits on `{colors.canvas}` (default) or on `{colors.surface}` (alternate band). The two-surface rhythm is the rhythm.
4. Run `npx @google/design.md lint DESIGN.md` after edits.
5. Add new variants as separate component entries (`button-primary-pressed`, `text-input-error`, `text-input-focused`).
6. Treat purple as scarce: the dominant CTA, and nothing else. Inline links are `{colors.link-blue}`, which is a different colour on purpose. Purple body text or a large purple surface is drift.
7. Keep the button/card radius distinction: 8px on buttons and inputs, 12px on cards. Reaching for a pill on a button, or collapsing either to 0px, breaks the geometry.

## Known Gaps

- Dark-mode token values are not fully surfaced in the source spec — only the hero bands invert. This project reuses the same warm ramp for dark surfaces (gray-900 `#1a1a1a`, gray-800 `#37352f`), which is consistent but is an interpretation, not an extracted value.
- Animation and transition timings were not extracted. 150–200ms ease is a safe default.
- Form validation success state is not explicitly captured in the spec.
- The pastel-tint mapping (which feature panel gets peach versus rose versus mint) is observation-based; the real brand library may have further entries.
- This project applies the tokens to an LMS, not to a marketing site. The navy hero band and pastel feature tints are defined here but are not yet used on any page.
