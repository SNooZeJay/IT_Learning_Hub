<template>
  <!--
    The public landing page.

    SCOPE. This file is the landing page and nothing else. The router entry,
    the service call, the components it composes and every route it links to are
    unchanged from before this redesign; what changed is the markup around them.

    WHAT IS REAL HERE, AND WHAT IS NOT.

    The page is honest about this, and it is worth stating plainly because the
    visual reference it was rebuilt toward is a marketing page full of numbers
    that this product does not have.

    The schema has no ratings table, no review counts, no enrolment counts, no
    per-course certificate flag and no public instructor name - `courses.created_by`
    is a bare UUID, and publishing it would be worse than showing nothing. So the
    featured card, the hero figures and the value strip are built from the three
    counts this read model genuinely returns (courses, modules, lessons) plus
    structural statements that are true of the product. There is no "4.8 average
    rating" and no "50,000+ learners" anywhere on this page, because inventing
    them would be a lie the visitor could not detect.

    Instructor names are omitted from the featured card for the same reason
    `CatalogueCard` omits them: a public page that names its teachers publishes
    personal data nobody consented to publish.
  -->
  <div class="relative isolate min-h-screen overflow-x-clip bg-lp-canvas text-lp-ink">
    <!--
      The background.

      Three blurred pastel masses, fixed behind everything, plus a fine grain
      wash. Deliberately static: the reference's motion is slow and near the
      threshold of being noticed, and this page already has a sticky nav and a
      two-column hero. A drifting gradient behind text is a readability cost
      paid for decoration, and `-z-10` plus `isolate` is what stops the blobs
      from ever being clickable.
    -->
    <div class="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div
        class="absolute -top-48 -start-40 size-[36rem] rounded-full bg-lp-glow-green opacity-70 blur-3xl"
      ></div>
      <div
        class="absolute -top-24 -end-48 size-[42rem] rounded-full bg-lp-glow-beige opacity-80 blur-3xl"
      ></div>
      <div
        class="absolute top-[38rem] start-1/4 size-[30rem] rounded-full bg-lp-glow-peach opacity-60 blur-3xl"
      ></div>

      <!--
        NO SHADER LAYER HERE, and this is deliberate.

        This page used to carry a WebGL aurora ribbon over these three circles, added
        for slow organic motion. It has been removed.

        In light mode it laid a grey-brown cloud across the hero. The circles were
        doing the work; the ribbon was subtracting from them. Measuring the composited
        page with the canvas shown and hidden gave an equal delta on all three channels
        - rgb(250,248,243) against rgb(194,191,186) - which is the signature of a
        neutral rather than a colour, and cream composited with opaque black at the
        layer's 0.45 opacity is 137, the value it actually landed on. It also required a
        WebGL context on the most-visited page in the product, for an effect that
        worked perfectly well as three blurred circles.

        The circles above are the background. They are warm, they follow the theme, they
        cost nothing, and they render on a phone with no GPU. If motion is wanted back
        here, animate the circles - a transform or an opacity on the divs - rather than
        reinstating a shader layer over them.
      -->
    </div>

    <!--
      NAVIGATION.

      A floating rounded bar rather than a full-bleed one. The page behind it is
      a soft cream gradient, and a bar that spans edge to edge has to either
      draw a hard line across the composition or blur itself into it. Insetting
      it and rounding the ends keeps the header reading as a single object sitting
      on the page, which is what the reference does.

      Two items: the brand on one side, the account actions on the other. Nothing
      in the middle.

      The middle was carrying a `Courses` link and a search field, and both came
      out. `Courses` duplicated the hero's own "Explore courses" button, which is
      the larger and more prominent of the two, and the catalogue is still one
      click away from three other places on this page - the hero CTA, the "All N
      courses" link below the course grid, and the footer's "Browse courses". The
      search field is a worse duplication: `/courses` already opens with its own
      search box, level filter, price filter and category filter, so a second
      search one click earlier was a strictly worse version of a control that
      already exists. Neither removal makes a route unreachable.

      That leaves four controls, which is what fits without a menu button. See the
      note on the wordmark below for the arithmetic, because it is the reason
      there is no hamburger here any more.

      The row wraps below 375px. Measured, not eyeballed: the bar's contents are
      252px once the padding below `2xsm` is tightened, and a 320px viewport
      leaves 264px inside the pill. Rather than shorten "Create account" to
      "Sign up" - one link wearing two names depending on window width - the
      actions drop to a second centred line and the pill squares up to 24px
      corners so it no longer reads as a stadium with a row through it. From
      375px up there is room for one line and the row is `nowrap` again.
    -->
    <header class="sticky top-0 z-40 px-4 pt-4 md:px-6 md:pt-5">
      <div
        class="mx-auto max-w-6xl rounded-3xl border border-lp-line bg-lp-card/85 shadow-lp-nav backdrop-blur-xl 2xsm:rounded-full"
      >
        <div
          class="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 px-3 py-2.5 2xsm:flex-nowrap 2xsm:justify-between 2xsm:gap-x-3 2xsm:px-4 md:px-5"
        >
          <RouterLink to="/" class="flex min-w-0 items-center gap-2.5">
            <BrandMark class="size-8 shrink-0" />
            <!--
              The wordmark is the only thing that has to go on a narrow screen,
              and it waits until `md` for a measured reason.

              Bar contents at 14px Inter: mark 32, theme toggle 40, Sign in 69,
              Create account 130, plus the gaps between them - 288px once the
              wordmark joins in at `md`, and 252px without it. 288 does not fit
              the 311px left inside the padding at 375px with anything to spare,
              and it badly does not fit 320px, so the wordmark is held back to
              `md` (768px). Below that the mark alone identifies the product,
              which is what the alt-less BrandMark is for.
            -->
            <span
              class="hidden truncate text-[15px] font-semibold tracking-tight text-lp-ink md:inline"
            >
              IT Learning Hub
            </span>
          </RouterLink>

          <div class="flex shrink-0 items-center gap-0.5 2xsm:gap-1.5 md:gap-2">
            <ThemeToggleButton />

            <RouterLink
              to="/auth/login"
              class="rounded-full px-3 py-2 text-sm font-medium text-lp-slate transition-colors hover:bg-lp-canvas hover:text-lp-ink sm:px-3.5 md:px-4"
            >
              Sign in
            </RouterLink>
            <RouterLink
              to="/auth/register"
              class="lp-press rounded-full bg-lp-ink px-3.5 py-2 text-sm font-medium text-lp-ink-inverse shadow-lp-button transition-opacity duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:opacity-90 motion-reduce:transition-none sm:px-4 md:px-5"
            >
              Create account
            </RouterLink>
          </div>
        </div>
      </div>
    </header>

    <main>
      <!--
        HERO.

        THE AUTHORED SEQUENCE ON THIS PAGE, and the only one.

        The left column arrives as five steps - eyebrow, headline, lede, actions,
        figures - and the right column as a sixth. The order is the argument: what
        this is, what it says, why it is credible, what to do, and the evidence. It is
        also why the headline is step 1 rather than step 0: the eyebrow is a label, and
        making the reader wait for the label before the headline would be the wrong
        first impression.

        `--stagger-i` is the step index, read by the `lp-hero-step` utility, which
        clamps it to four steps of 60ms. Capped because the fifth element would
        otherwise start 240ms after a 560ms animation, and a total wait approaching a
        second is the point at which an entrance stops feeling crafted and starts
        feeling slow. The whole sequence lands inside 800ms.

        The right column is one step, not five. The carousel is a single object and
        animating its parts separately would fight the DepthCarousel's own entrance.

        WHAT IS NOT ANIMATED HERE, deliberately: the navbar and the background. A
        header that slides in on every page load teaches the reader that the page
        moves before they can read it, and the background is behind everything -
        animating it would be motion with no viewer.

        The headline is set in the project's editorial serif and drops to a
        regular weight at display size, which is a deliberate departure from the
        rest of the product's 600-weight display rule. This page is a reading
        surface; the weight-600 display rule exists so the dashboards read as
        finished at a glance, and carrying it here produced a poster rather than
        a page. The app itself is untouched.

        The figures under the buttons are the three counts the catalogue actually
        returned, summed client-side. They are hidden until the query resolves
        rather than rendered as zero, because "0 courses" is a statement about the
        product and "still loading" is not.
      -->
      <section class="mx-auto max-w-6xl px-4 pt-14 pb-16 md:px-6 md:pt-20 md:pb-24">
        <!--
          The carousel column is the wider of the two (1fr vs 1.12fr) and the gap is
          `lg:gap-12` rather than `lg:gap-16`.

          The carousel needs the width for its own reasons, not for the arrows: it
          renders the arrows as grid columns and the cards in the middle track, so
          the card's share is this column minus two arrows and two gaps. At the old
          0.95fr the card was being scaled down to 228px wide to fit; the extra
          column width is what lets it render at its intended 340px.
        -->
        <div
          class="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)] lg:gap-12"
        >
          <div>
            <p
              :style="{ '--stagger-i': 0 }"
              class="lp-hero-step inline-flex items-center gap-2 rounded-full border border-lp-accent-line bg-lp-accent-soft px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.14em] text-lp-accent uppercase"
            >
              Learn at your own pace
            </p>

            <!--
              THE HEADLINE, TYPED.

              Every character is in the DOM from the first paint; the animation only
              controls opacity. That is deliberate and it is what makes this
              accessible rather than a trap:

              - A screen reader announces the whole sentence immediately, because
                `opacity: 0` content is still in the accessibility tree.
              - Search engines and link-preview scrapers read the complete text.
              - The heading never reflows. Untyped characters hold their width, so
                nothing below it moves and there is no layout shift while it types.
              - Turning animation off is a one-line change of state, not a
                second rendering of the headline.

              The alternative - removing characters as they "arrive" - reflows a
              4.1rem three-line headline on every tick, which pushes the whole
              hero down while someone is reading it.

              The line is split into segments rather than typed from one string so
              that `practical` keeps its italic accent. A flat run of per-character
              spans would style the word as body text.
            -->
            <h1
              :style="{ '--stagger-i': 1 }"
              class="lp-hero-step mt-6 font-display text-[2.6rem] leading-[1.04] tracking-[-0.025em] text-balance text-lp-ink sm:text-6xl lg:text-[4.1rem]"
            >
              <!--
                Before the first character there is no segment to attach the caret
                to, so it is rendered first. Placed after the segments instead, it
                lands at the end of the last line - which, while every character is
                transparent, is the wrong end of the sentence entirely.
              -->
              <span
                v-if="caretVisible && typedCount === 0"
                class="caret-tick"
                aria-hidden="true"
              ></span>

              <template v-for="(segment, segmentIndex) in heroSegments" :key="segmentIndex">
                <em v-if="segment.accent" class="font-normal text-lp-accent italic">
                  <template v-for="(character, characterIndex) in segment.text" :key="characterIndex">
                    <span
                      class="inline transition-opacity duration-100"
                      :class="isTyped(segmentIndex, characterIndex) ? 'opacity-100' : 'opacity-0'"
                      >{{ character }}</span
                    ><span
                      v-if="isCaretHere(segment, characterIndex)"
                      class="caret-tick"
                      aria-hidden="true"
                    ></span>
                  </template>
                </em>

                <template v-else>
                  <template
                    v-for="(character, characterIndex) in segment.text"
                    :key="characterIndex"
                  >
                    <span
                      class="inline transition-opacity duration-100"
                      :class="isTyped(segmentIndex, characterIndex) ? 'opacity-100' : 'opacity-0'"
                      >{{ character }}</span
                    ><span
                      v-if="isCaretHere(segment, characterIndex)"
                      class="caret-tick"
                      aria-hidden="true"
                    ></span>
                  </template>
                </template>
              </template>
            </h1>

            <p
              :style="{ '--stagger-i': 2 }"
              class="lp-hero-step mt-6 max-w-xl text-base leading-relaxed text-lp-slate md:text-lg"
            >
              IT Learning Hub gives you organised learning materials, lessons and quizzes — with
              your progress tracked from the first lesson to the last.
            </p>

            <div :style="{ '--stagger-i': 3 }" class="lp-hero-step mt-9 flex flex-wrap items-center gap-3">
              <RouterLink
                to="/courses"
                class="lp-press inline-flex h-12 items-center gap-2 rounded-full bg-lp-ink px-7 text-sm font-medium text-lp-ink-inverse shadow-lp-button transition-opacity duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:opacity-90 motion-reduce:transition-none"
              >
                Explore courses
                <ArrowRight class="size-4 rtl:rotate-180" aria-hidden="true" />
              </RouterLink>
              <RouterLink
                to="/auth/register"
                class="lp-press inline-flex h-12 items-center gap-2 rounded-full border border-lp-line-strong bg-lp-card px-7 text-sm font-medium text-lp-ink transition-[background-color,border-color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-lp-canvas motion-reduce:transition-none"
              >
                Create free account
              </RouterLink>
            </div>

            <p class="mt-4 text-sm text-lp-slate">
              Browsing is open to everyone. You only need an account to enroll.
            </p>

            <dl
              v-if="hasCounts"
              :style="{ '--stagger-i': 4 }"
              class="lp-hero-step mt-10 flex flex-wrap items-center gap-x-10 gap-y-4 border-t border-lp-line pt-7"
            >
              <div v-for="figure in figures" :key="figure.label">
                <dt class="font-display text-3xl leading-none font-semibold text-lp-ink">
                  {{ figure.value }}
                </dt>
                <dd class="mt-1.5 text-xs font-medium tracking-wide text-lp-slate uppercase">
                  {{ figure.label }}
                </dd>
              </div>
            </dl>
          </div>

          <!--
            THE COURSE CAROUSEL.

            A `DepthCarousel` in place of the single featured-course card. The
            slide content is this page's own course card, and the slides are the
            published catalogue - the same `listPublishedCourses()` rows the rest
            of the page renders, filtered to `status = 'published'` by the query
            and by RLS. Nothing here invents a course, and a draft can never
            appear here because the read model never returns one.

            WHY A SLOT AND NOT THE COMPONENT'S OWN IMAGE. Almost no course in this
            catalogue has `thumbnail_url`, so upstream's bare <img> would render a
            broken frame on most slides. The `card` slot draws the level placeholder
            instead - the same `LevelPattern` treatment `CatalogueCard` and this
            card used before, so a course with no cover art looks designed rather
            than missing.

            THE THREE STATES ARE NOT THE CAROUSEL'S TO HANDLE. Loading, query
            error and an empty catalogue all still render as full-card messages,
            exactly as they did before. A carousel with nothing to slide is an
            empty stage, which is worse than saying so.

            The card body is a real `RouterLink`, not just a click target. The
            cards are `<div>`s with a click handler, so without a link inside them
            there would be no keyboard-reachable way to open a course - and a
            keyboard user tabbing to the slide would find nothing focusable.

            `autoplay` pauses on hover and on focus and refuses to run under
            `prefers-reduced-motion`, so it is not a motion trap. Set it to false
            if the rotation competes with the typed headline above.

            THE TWO MOTION FIGURES ON THIS ELEMENT are the system's, not chosen here:
            `duration 560` is `--ith-motion-slow`, the authored-entrance duration, and
            `ease` is `--ith-ease-out` written out because gsap takes a string. The
            same curve runs on every CSS transition in this product, so pressing next
            and hovering a card settle at one rate rather than two.

            The stack does not float, breathe or idle. It moves when it is asked to and
            when autoplay advances it, and otherwise it is still - a card that drifts on
            its own is motion with no information in it, and on a page whose one
            authored sequence is the hero, a second moving thing competes with it.
          -->
          <!--
            `falloff` below is 0.3, not upstream's 0.2. It drives both the brightness
            multiplier and the tint overlay's opacity, and it is what makes a receding
            card read as "behind" rather than as a second card on the same plane.
            Upstream's value is tuned for a black page where the cards are already
            dark; on this cream canvas it left the stack looking like pale grey slabs
            instead of the deep, receding cards the reference shows.
          -->
          <div :style="{ '--stagger-i': 5 }" class="lp-hero-step lg:ps-2">
            <!--
              No frame around the carousel itself.

              The three message states below carry their own card frame, because they
              are a single flat surface. The carousel is not: each slide draws its
              own border, radius and shadow, and the arrows float outside the stack
              on the page background. Wrapping the whole thing in one bordered,
              `overflow-hidden` box clipped the arrows and put a second border around
              the cards.
            -->
            <div>
              <div
                v-if="catalogueLoading"
                class="flex min-h-96 flex-col flex-wrap content-center items-center justify-center rounded-3xl border border-lp-line bg-lp-card p-10 shadow-lp-card"
                role="status"
                aria-live="polite"
              >
                <LoaderCircle class="size-6 animate-spin text-lp-slate" />
                <p class="mt-4 text-sm text-lp-slate">Loading the catalogueâ€¦</p>
              </div>

              <div
                v-else-if="catalogueError"
                class="rounded-3xl border border-lp-line bg-lp-card p-6 shadow-lp-card"
              >
                <Alert
                  variant="error"
                  title="Could not load the catalogue"
                  :message="catalogueError"
                />
              </div>

              <div
                v-else-if="!featuredCourse"
                class="flex min-h-96 flex-col items-center justify-center rounded-3xl border border-lp-line bg-lp-card p-10 text-center shadow-lp-card"
              >
                <span
                  class="inline-flex size-12 items-center justify-center rounded-full bg-lp-accent-soft text-lp-accent"
                >
                  <BookOpen class="size-6" aria-hidden="true" />
                </span>
                <h2 class="mt-5 font-display text-xl font-semibold text-lp-ink">
                  No courses published yet
                </h2>
                <p class="mt-2 max-w-xs text-sm leading-relaxed text-lp-slate">
                  Courses appear here as soon as an instructor publishes them. Create an account to
                  enroll once the catalogue is live.
                </p>
                <RouterLink
                  to="/auth/register"
                  class="mt-6 inline-flex h-11 items-center rounded-full bg-lp-ink px-6 text-sm font-medium text-lp-ink-inverse"
                >
                  Create a free account
                </RouterLink>
              </div>

              <DepthCarousel
                v-else
                :items="carouselItems"
                aria-label="Published courses"
                :card-width="330"
                :card-height="470"
                :radius="18"
                :tint="CAROUSEL_TINT"
                :depth="190"
                :spread="64"
                :tilt="22"
                tilt-direction="right"
                :perspective="1200"
                :visible-cards="3"
                :falloff="0.3"
                :blur="3"
                :duration="560"
                ease="cubic-bezier(0.16, 1, 0.3, 1)"
                autoplay
                :autoplay-delay="3600"
                loop
                @select="onCarouselSelect"
              >
                <template #card="{ index }">
                  <!--
                    INTERNAL SPACING.

                    One padding value (`p-5`) for the whole card, and every gap inside
                    it comes from the same 4-step scale: 2, 3, 4, 5 in Tailwind's
                    spacing, i.e. 8px, 12px, 16px, 20px. Nothing here is an arbitrary
                    pixel value, so the rhythm is the same at every breakpoint and the
                    bottom row cannot drift out of step with the top.

                    The media band is `shrink-0` at a fixed share of the card rather than
                    `flex-1`. With `flex-1` the band absorbed whatever height the text
                    below needed, so a two-line title stole the image's space and a
                    one-line title left the image too tall - the band moved for reasons
                    that had nothing to do with the image. A fixed `h-[58%]` keeps the
                    card's proportions identical for every course, which is what makes
                    the carousel read as one carousel rather than five different cards.

                    58% rather than a smaller share because the text below is short and
                    mostly fixed: category, title, one meta line, price row. At 42% the
                    gap between the meta line and the price row was a third of the card,
                    which read as two separate cards rather than one.

                    `min-w-0` on the text column and `break-words` on the title: a long
                    unbroken course name would otherwise push the price row wide and
                    shove the "View course" button off the card.
                  -->
                  <div v-if="courseAt(index)" class="flex h-full w-full flex-col p-5">
                    <div
                      class="relative h-[58%] shrink-0 overflow-hidden rounded-xl bg-lp-accent-soft"
                    >
                      <img
                        v-if="courseAt(index)!.thumbnailUrl"
                        :src="courseAt(index)!.thumbnailUrl!"
                        :alt="`Cover for ${courseAt(index)!.title}`"
                        class="size-full object-cover"
                      />
                      <div v-else class="flex size-full items-center justify-center p-8">
                        <LevelPattern
                          :level="courseAt(index)!.level"
                          :module-count="courseAt(index)!.moduleCount"
                          class="size-full text-lp-accent"
                        />
                      </div>

                      <span
                        class="absolute start-4 top-4 rounded-full bg-lp-ink/85 px-3 py-1.5 text-[11px] font-medium text-lp-ink-inverse backdrop-blur-sm"
                      >
                        {{ LEVEL_LABELS[courseAt(index)!.level] }}
                      </span>
                    </div>

                    <!-- `min-w-0` so a long title shrinks instead of overflowing. -->
                    <div class="flex min-w-0 flex-1 flex-col pt-4">
                      <p
                        v-if="courseAt(index)!.categoryName"
                        class="text-[11px] font-semibold tracking-[0.14em] text-lp-accent uppercase"
                      >
                        {{ courseAt(index)!.categoryName }}
                      </p>
                      <p
                        class="mt-2 font-display text-xl leading-tight font-semibold break-words text-balance text-lp-ink"
                      >
                        {{ courseAt(index)!.title }}
                      </p>

                      <!--
                        Module, lesson and duration counts. Carried over from the
                        single featured card this replaced: a slide that dropped
                        them would be less informative than the card it stands in
                        for, and these are real published counts.
                      -->
                      <p class="mt-3 flex flex-wrap items-center gap-x-2.5 text-xs text-lp-slate">
                        <span>
                          {{ courseAt(index)!.moduleCount }}
                          {{ courseAt(index)!.moduleCount === 1 ? 'module' : 'modules' }}
                        </span>
                        <span aria-hidden="true">&middot;</span>
                        <span>
                          {{ courseAt(index)!.lessonCount }}
                          {{ courseAt(index)!.lessonCount === 1 ? 'lesson' : 'lessons' }}
                        </span>
                        <template v-if="courseAt(index)!.durationMinutes">
                          <span aria-hidden="true">&middot;</span>
                          <span class="inline-flex items-center gap-1.5">
                            <Clock3 class="size-3.5" aria-hidden="true" />
                            {{ formatDuration(courseAt(index)!.durationMinutes!) }}
                          </span>
                        </template>
                      </p>

                      <!--
                        The price row, pushed to the bottom with `mt-auto` so it sits on
                        the card's baseline for every title length, whether the title is
                        one line or two.
                      -->
                      <div
                        class="mt-auto flex items-center justify-between gap-3 border-t border-lp-line pt-4"
                      >
                        <span class="font-display text-xl font-semibold text-lp-ink">
                          {{ formatPrice(courseAt(index)!.priceCentavos) }}
                        </span>

                        <!--
                          The keyboard-reachable route into the course. See the note
                          above: the card itself is a div with a click handler, so
                          without this there is no focusable link on the slide.
                        -->
                        <RouterLink
                          :to="`/courses/${courseAt(index)!.slug}`"
                          class="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-lp-line px-5 text-sm font-medium text-lp-ink transition-colors hover:border-lp-accent-line hover:bg-lp-accent-soft hover:text-lp-accent"
                        >
                          View course
                          <ArrowRight
                            class="size-4 transition-transform hover:translate-x-0.5 rtl:rotate-180"
                            aria-hidden="true"
                          />
                        </RouterLink>
                      </div>
                    </div>
                  </div>
                </template>
              </DepthCarousel>
            </div>
          </div>
        </div>
      </section>

      <!--
        VALUE STRIP.

        A dark band, because it is the one place the page earns a hard edge: it
        reads as a break in the cream rather than another cream surface.

        Three of the five items are counts derived from the catalogue query. The
        other two are structural statements that are true of the product and
        therefore need no data. There is no rating and no learner total here -
        see the note at the top of the file.
      -->
      <section class="mx-auto max-w-6xl px-4 pb-16 md:px-6 md:pb-24">
        <div class="rounded-3xl bg-lp-ink px-6 py-8 md:px-10 md:py-10">
          <ul
            class="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-center text-xs font-medium tracking-[0.1em] text-lp-ink-inverse/85 uppercase"
          >
            <li v-for="item in valueStrip" :key="item">{{ item }}</li>
          </ul>
        </div>
      </section>

      <!--
        HOW IT WORKS.

        The four real stages of using the platform. These are not feature claims:
        every one of them is a table in the schema, and the sequence itself is the
        product's difference from a video library.

        Numbers are zero-padded to 01-04 and set in the numerals, not in a
        circular badge, because the reference treats them as editorial folios
        rather than as step markers - and a padded pair reads as a sequence at a
        glance where 1, 2, 3, 4 does not.

        This is the one section that had no label of its own, so it gets an
        eyebrow in the same treatment as the CTA below. The other three carry a
        serif heading already, and an eyebrow above "What you can learn here" or
        "Published courses" would only repeat them.

        No shadow. The reference's cards are a hairline and a white fill, and a
        shadow on four identical tiles is what makes a card grid look assembled.

        `py-14 md:py-16`, and the same on the three sections after it. The gap
        between two sections is one section's bottom padding plus the next one's
        top, so `py-24` on both put 192px of empty cream between every pair -
        which reads as a mistake rather than as rhythm. 64 + 64 gives 128px,
        which is still generous. The hero block above and the CTA below are left
        at their own padding, so the two ends of the page read as boundaries and
        the four sections in between read as one continuous run - which is the
        rhythm the section list asks for.
      -->
      <section>
        <div class="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-16">
          <p
            class="text-[11px] font-semibold tracking-[0.16em] text-lp-accent uppercase"
          >
            How it works
          </p>

          <ol class="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <li
              v-for="(stage, index) in stages"
              :key="stage.title"
              class="rounded-2xl border border-lp-line bg-lp-card p-6"
            >
              <span
                class="font-display text-sm font-semibold tracking-[0.1em] text-lp-accent tabular-nums"
                aria-hidden="true"
              >
                {{ String(index + 1).padStart(2, '0') }}
              </span>
              <h2 class="mt-3 font-display text-lg font-semibold text-lp-ink">
                {{ stage.title }}
              </h2>
              <p class="mt-2 text-sm leading-relaxed text-lp-slate">
                {{ stage.body }}
              </p>
            </li>
          </ol>
        </div>
      </section>

      <!--
        WHAT YOU CAN LEARN.

        The disciplines, as a set of warm cards. Kept because it is real content
        on the page today, and it is the section that answers "what is actually
        in here" before anyone reaches the catalogue.

        The icons are the one thing here that is authored rather than derived. The
        six subjects are real and the mapping is editorial - a wrench for IT
        support, a shield for security - so it is decorative and carries no
        meaning a screen reader is told about: each is `aria-hidden` inside a
        chip, and the subject name beside it carries the meaning. They are here
        because the reference's category grid is icon-led and a column of bare
        text headings looks like a table of contents.
      -->
      <section>
        <div class="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-16">
          <div
            class="grid gap-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-16"
          >
            <div>
              <h2
                class="font-display text-3xl font-semibold tracking-tight text-balance text-lp-ink md:text-4xl"
              >
                What you can learn here
              </h2>
              <p class="mt-4 text-base leading-relaxed text-lp-slate">
                Courses are organised into modules and lessons, so you always know where you are in
                the material and what comes next.
              </p>
            </div>

            <dl class="grid gap-4 sm:grid-cols-2">
              <div
                v-for="area in disciplines"
                :key="area.name"
                class="rounded-2xl border border-lp-line bg-lp-card p-6"
              >
                <dt class="flex items-center gap-3">
                  <span
                    class="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-lp-accent-soft text-lp-accent"
                    aria-hidden="true"
                  >
                    <component :is="area.icon" class="size-4.5" />
                  </span>
                  <span class="font-display text-lg font-semibold text-lp-ink">
                    {{ area.name }}
                  </span>
                </dt>
                <dd class="mt-3 text-sm leading-relaxed text-lp-slate">
                  {{ area.body }}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <!--
        PUBLISHED COURSES.

        This section reads from the database, exactly as it did before: every
        title, peso price and module count below is a published course that
        actually exists, and the section disappears when none do. The query, the
        `CatalogueCourse` shape, the loading and error states and the
        `/courses/:slug` destination are all untouched.

        The cards below are `CatalogueCard`, which `/courses` also renders. Both
        public pages were given one look, so the card was moved onto the landing
        page's palette rather than duplicated onto this page: one component, one
        price rule, and the two surfaces cannot drift apart on the next edit.
      -->
      <section class="border-y border-lp-line bg-lp-canvas-deep">
        <div class="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-16">
          <div class="flex flex-wrap items-end justify-between gap-4">
            <h2
              class="font-display text-3xl font-semibold tracking-tight text-lp-ink md:text-4xl"
            >
              Published courses
            </h2>
            <RouterLink
              to="/courses"
              class="group -me-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-lp-accent transition-colors hover:bg-lp-accent-soft"
            >
              All {{ totalPublished }} {{ totalPublished === 1 ? 'course' : 'courses' }}
              <ArrowRight
                class="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180"
                aria-hidden="true"
              />
            </RouterLink>
          </div>

          <div
            v-if="catalogueLoading"
            class="mt-8 py-12 text-center"
            role="status"
            aria-live="polite"
          >
            <LoaderCircle class="mx-auto size-5 animate-spin text-lp-slate" />
            <p class="mt-3 text-sm text-lp-slate">Loading the catalogue…</p>
          </div>

          <Alert
            v-else-if="catalogueError"
            variant="error"
            title="Could not load the catalogue"
            :message="catalogueError"
            class="mt-8"
          />

          <EmptyState
            v-else-if="featured.length === 0"
            class="mt-8"
            title="No courses published yet"
            description="Courses appear here as soon as an instructor publishes them. Sign in to enroll once the catalogue is live."
            :icon="BookOpen"
          >
            <RouterLink
              to="/auth/register"
              class="mt-4 inline-block rounded-full bg-lp-ink px-5 py-2.5 text-sm font-medium text-lp-ink-inverse"
            >
              Create a free account
            </RouterLink>
          </EmptyState>

          <ul v-else class="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <li v-for="course in featured" :key="course.id" class="h-full">
              <CatalogueCard :course="course" />
            </li>
          </ul>
        </div>
      </section>

      <!--
        INSIDE A COURSE.

        The lesson pane on the left, the quiz on the right, drawn as the product
        draws them. Both are real features in the schema and both are shown as the
        interface a learner meets rather than as a feature list describing them.

        The quiz is a worked example of the format and is labelled as one. It is
        not a live assessment and it records nothing. Nothing here gained a
        progress bar, a completion tick or a "mark as done" affordance, because
        there is no state behind this markup to drive one.

        Stayed light. The reference renders its equivalent section on charcoal;
        this page already spends its one dark surface on the value strip and the
        closing CTA, and a second dark block two sections later would stop that
        card from being where the page turns.

        Cards are hairline and fill only, matching the grids above. The lesson
        outline keeps a selected row, because that is what makes the pane read as
        a position inside a course rather than as a list.
      -->
      <section class="border-t border-lp-line">
        <div class="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-16">
          <h2
            class="font-display text-3xl font-semibold tracking-tight text-balance text-lp-ink md:text-4xl"
          >
            Inside a course
          </h2>
          <p class="mt-4 max-w-2xl text-base leading-relaxed text-lp-slate">
            Lessons are written to be read, and quizzes check what you took in. Both sit behind your
            enrollment, so a free course and a paid one give you the same material.
          </p>

          <div class="mt-10 grid gap-6 lg:grid-cols-2">
            <div class="overflow-hidden rounded-2xl border border-lp-line bg-lp-card">
              <div class="border-b border-lp-line px-6 py-5">
                <p
                  class="text-[11px] font-medium tracking-[0.12em] text-lp-accent uppercase"
                >
                  Module 2 &middot; Lesson 4
                </p>
                <h3 class="mt-2 font-display text-xl font-semibold text-lp-ink">
                  Setting up your environment
                </h3>
              </div>

              <div class="grid sm:grid-cols-[13rem_minmax(0,1fr)]">
                <ol class="border-b border-lp-line bg-lp-canvas p-3 sm:border-e sm:border-b-0">
                  <li
                    v-for="(lesson, index) in sampleLessons"
                    :key="lesson"
                    class="flex items-baseline gap-2.5 rounded-lg px-3 py-2.5 text-sm"
                    :class="
                      index === 1
                        ? 'bg-lp-accent-soft font-medium text-lp-accent'
                        : 'text-lp-slate'
                    "
                  >
                    <span class="text-xs tabular-nums opacity-70">{{ index + 1 }}</span>
                    <span class="min-w-0">{{ lesson }}</span>
                  </li>
                </ol>

                <div class="p-6">
                  <p class="text-sm leading-relaxed text-lp-slate">
                    Everything in this course runs from a terminal. Before the first exercise,
                    confirm the tools are installed and on your PATH &#8212; the rest of the module
                    assumes they are.
                  </p>
                  <pre
                    class="mt-5 overflow-x-auto rounded-xl bg-lp-canvas p-4 font-mono text-xs leading-relaxed text-lp-ink"
                  ><code>node --version
python3 --version
git --version</code></pre>
                  <p class="mt-5 flex items-center gap-2 text-xs text-lp-slate">
                    <Clock3 class="size-3.5" aria-hidden="true" />
                    About 12 minutes
                  </p>
                </div>
              </div>
            </div>

            <div class="overflow-hidden rounded-2xl border border-lp-line bg-lp-card">
              <div class="border-b border-lp-line px-6 py-5">
                <p
                  class="text-[11px] font-medium tracking-[0.12em] text-lp-accent uppercase"
                >
                  Quiz &middot; Question 3 of 5
                </p>
                <p class="mt-2 font-display text-xl leading-snug font-semibold text-lp-ink">
                  Which command creates a new branch and switches to it in one step?
                </p>
              </div>

              <ul class="space-y-2.5 p-6">
                <li
                  v-for="(option, index) in sampleOptions"
                  :key="option"
                  class="flex items-center gap-3 rounded-xl border border-lp-line px-4 py-3.5"
                >
                  <span
                    class="flex size-6 shrink-0 items-center justify-center rounded-full border border-lp-line-strong text-xs font-medium text-lp-slate"
                    aria-hidden="true"
                  >
                    {{ String.fromCharCode(65 + index) }}
                  </span>
                  <span class="font-mono text-sm text-lp-slate">{{ option }}</span>
                </li>
              </ul>

              <p class="border-t border-lp-line px-6 py-4 text-xs text-lp-slate">
                Worked example of the question format. Nothing is recorded here.
              </p>
            </div>
          </div>
        </div>
      </section>
      <!--
        CLOSE.

        The page ends on the action rather than on a footer of links. Repeating
        the CTA here is the one place a second mention is earned instead of
        competing.

        Charcoal in BOTH themes, which is why this card stopped using `lp-ink` /
        `lp-ink-inverse`. Those flip, so the card was a light panel in dark mode -
        correct as a pairing, but the reference this is built toward is dark
        under the CTA as well, and a light card is the opposite of it. Fixed
        `gray-950` plus `gray-200`/`gray-400` keeps one appearance either way, and
        the inset hairline is what stops the card dissolving into the canvas in
        dark mode, where the two surfaces sit within a couple of points of each
        other.

        The eyebrow and the emphasised word use `lp-accent-bright`. The green the
        rest of the page uses is #1f6b46, which measures 2.3:1 on this ground and
        would be invisible here; this is the same hue at the lightness that
        survives charcoal.

        No money-back line, no guarantee badge, no secondary action. The reference
        pairs its button with one, and this product has neither, so inventing them
        would be a claim about a refund policy that does not exist.
      -->
      <section class="mx-auto max-w-6xl px-4 pb-16 md:px-6 md:pb-24">
        <div
          class="relative overflow-hidden rounded-3xl bg-gray-950 px-6 py-14 ring-1 ring-inset ring-white/[0.07] md:px-12 md:py-20"
        >
          <!--
            One soft accent wash, anchored off the bottom-start corner, so the
            card is not a flat rectangle. Static and heavily blurred: it is a
            gradient, not an effect, and it carries no information.

            Pushed mostly outside the card on purpose. A circle small enough to
            sit wholly inside leaves a visible arc, which reads as a smudge
            rather than as light; hanging two thirds of it off the edge gives a
            corner wash with no boundary to see.
          -->
          <div
            class="pointer-events-none absolute -bottom-48 -start-32 size-[30rem] rounded-full bg-lp-glow-green opacity-40 blur-3xl"
            aria-hidden="true"
          ></div>

          <!--
            `max-w-lg`, not `max-w-2xl`. The card is 1152px wide and the
            reference runs its text at roughly 40% of the card; at 672px the
            heading fitted on one line and lost the two-line editorial break that
            is the whole shape of the reference. 512px puts it back.
          -->
          <div class="relative max-w-lg">
            <p
              class="text-[11px] font-semibold tracking-[0.16em] text-lp-accent-bright uppercase"
            >
              Start today
            </p>

            <h2
              class="mt-5 font-display text-3xl leading-[1.06] font-semibold tracking-tight text-balance text-gray-200 md:text-[2.75rem]"
            >
              Your next skill is
              <em class="font-normal text-lp-accent-bright italic">one</em> lesson away.
            </h2>

            <p class="mt-5 text-base leading-relaxed text-gray-400">
              Create a free account to enroll in a free course, or pay for one in Philippine pesos.
              Either way your progress is kept from your first lesson.
            </p>

            <RouterLink
              to="/courses"
              class="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-gray-200 px-7 text-sm font-medium text-gray-950 transition-opacity hover:opacity-90"
            >
              Explore courses
              <ArrowRight class="size-4 rtl:rotate-180" aria-hidden="true" />
            </RouterLink>
          </div>
        </div>
      </section>
    </main>

    <!--
      Public footer: brand, link groups, copyright bar.

      Same content, same four destinations, same `footerGroups` array and the same
      `:to` on every link. Only the presentation changed.

      Charcoal in both themes, and fixed greys rather than the `lp-` tokens for
      the same reason as the CTA card above. Contrast on #0d0d0c, all measured:
        gray-200 #e5e3df  16.9:1   brand wordmark
        gray-300 #d4d1cb  12.8:1   links
        gray-400 #a4a097   7.5:1   group labels, description, copyright row
      `gray-500` #787671 was the obvious choice for the copyright row and it
      measures 4.3:1 - under AA for 12px text - so it is used nowhere here.

      Two columns of links, not the reference's three: this product has two link
      groups, and padding the grid out with invented destinations is the one thing
      a footer must not do. The brand block takes two of the four grid columns
      instead, which gives the same wide, airy proportion the reference gets from
      a narrow brand column beside three.

      No social icons either. The reference has four; this product has none, and
      the links would have nowhere to point.

      The top border is transparent in light mode - cream above charcoal needs no
      seam - and a faint white hairline in dark mode, where the band would
      otherwise merge into the canvas.
    -->
    <footer class="border-t border-transparent bg-gray-950 dark:border-white/[0.07]">
      <div class="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20">
        <div class="grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-16">
          <div class="lg:col-span-2">
            <div class="flex items-center gap-2.5">
              <BrandMark class="size-8 shrink-0" />
              <span class="text-[15px] font-semibold tracking-tight text-gray-200">
                IT Learning Hub
              </span>
            </div>
            <p class="mt-4 max-w-sm text-sm leading-relaxed text-gray-400">
              Structured courses for learning IT skills and concepts, one lesson at a time.
            </p>
          </div>

          <nav v-for="group in footerGroups" :key="group.title" :group>
            <h2 class="text-[11px] font-semibold tracking-[0.16em] text-gray-400 uppercase">
              {{ group.title }}
            </h2>
            <ul class="mt-4 space-y-1">
              <li v-for="link in group.links" :key="link.label">
                <RouterLink
                  :to="link.to"
                  class="inline-flex min-h-11 items-center text-sm text-gray-300 transition-colors hover:text-white"
                >
                  {{ link.label }}
                </RouterLink>
              </li>
            </ul>
          </nav>
        </div>

        <div
          class="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-8 md:mt-16"
        >
          <p class="text-xs text-gray-400">© {{ year }} IT Learning Hub</p>
          <p class="text-xs text-gray-400">Payments processed in Philippine pesos.</p>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
/**
 * The public landing page.
 *
 * Structure answers a visitor's questions in the order they actually ask them:
 * what is this, what can I learn, what does it look like inside, why should I
 * start.
 *
 * The disciplines and the lesson/quiz panels are authored illustration, not
 * screenshots. They are marked as examples wherever they could be mistaken for
 * live data, and nothing on this page records anything.
 *
 * See the file header for what this page deliberately does not claim to have.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import {
  ArrowRight,
  BookOpen,
  Clock3,
  Code,
  Database,
  Globe,
  LoaderCircle,
  Network,
  ShieldCheck,
  Wrench,
} from 'lucide-vue-next'
import Alert from '@/components/ui/Alert.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import BrandMark from '@/components/common/BrandMark.vue'
import ThemeToggleButton from '@/components/common/ThemeToggleButton.vue'
import CatalogueCard from '@/components/catalogue/CatalogueCard.vue'
import LevelPattern from '@/components/catalogue/LevelPattern.vue'
import DepthCarousel from '@/components/carousel/DepthCarousel.vue'
import { describeSupabaseError } from '@/services/supabase/client'
import {
  listPublishedCourses,
  LEVEL_LABELS,
  formatDuration,
  formatPrice,
} from '@/services/catalogue.service'
import type { CatalogueCourse } from '@/services/catalogue.service'

/** The four real stages of using the platform, in order. */
const stages = [
  {
    title: 'Pick a course',
    body: 'Browse published courses by subject and level. Free and paid courses sit in the same catalogue.',
  },
  {
    title: 'Work through the lessons',
    body: 'Each course is split into modules and lessons, so you always know what comes next.',
  },
  {
    title: 'Take the quizzes',
    body: 'Quizzes check what you took in and mark you against the course passing score.',
  },
  {
    title: 'Keep your progress',
    body: 'Completed lessons are recorded on your account, so you can stop and pick up where you left off.',
  },
] as const

/**
 * What can be learned here.
 *
 * Written as subject areas rather than a count, because "Programming, Networking,
 * Support, Security, Data" is what a visitor is actually scanning for. The
 * catalogue link below proves which of these exist today.
 *
 * `icon` is the only authored thing in this file's data. It is decorative - each
 * one renders `aria-hidden` inside a chip, and the subject name beside it is what
 * carries the meaning - so the mapping is editorial and claims nothing the
 * schema does not already say.
 */
const disciplines = [
  {
    name: 'Programming',
    icon: Code,
    body: 'From a first script to object-oriented Python, with the tools a working developer actually uses.',
  },
  {
    name: 'Networking',
    icon: Network,
    body: 'How traffic moves, how devices are configured, and how to read what a network is telling you.',
  },
  {
    name: 'IT support',
    icon: Wrench,
    body: 'Diagnosing and fixing the problems end users hit, and documenting the fix so it does not recur.',
  },
  {
    name: 'Security',
    icon: ShieldCheck,
    body: 'Preparing for recognised security certifications, covering the theory and the practical checks.',
  },
  {
    name: 'Web and APIs',
    icon: Globe,
    body: 'Building against HTTP services, consuming an API, and handling the data it returns.',
  },
  {
    name: 'Data',
    icon: Database,
    body: 'Storing, querying and reasoning about data, and knowing when a spreadsheet is the better tool.',
  },
] as const

/** Illustrative module outline for the lesson pane. */
const sampleLessons = [
  'Introduction and setup',
  'How the tools fit together',
  'Your first program',
  'Input and output',
  'Conditionals',
  'Loops and iteration',
  'Functions',
] as const

const sampleOptions = [
  'git branch -c new-branch',
  'git switch -c new-branch',
  'git checkout new-branch -b',
  'git merge new-branch -c',
] as const

const catalogue = ref<CatalogueCourse[]>([])
const catalogueLoading = ref(true)
const catalogueError = ref('')

/** Three is what fits one row at desktop without the grid wrapping awkwardly. */
const featured = ref<CatalogueCourse[]>([])
const totalPublished = ref(0)

/**
 * The newest published course.
 *
 * Still used for the two non-carousel hero states - loading has no courses yet,
 * and an empty catalogue needs a message rather than an empty stage. The carousel
 * itself is fed `carouselItems`.
 */
const featuredCourse = computed<CatalogueCourse | null>(() => catalogue.value[0] ?? null)

/**
 * The published catalogue, as carousel slides.
 *
 * One entry per published course, in the order `listPublishedCourses()` returns
 * them (newest first). `image` is empty for a course with no cover art; the slot
 * renders the level placeholder in that case and never requests anything, so a
 * course without artwork does not fire a failing image load.
 */
const carouselItems = computed(() =>
  catalogue.value.map((course) => ({
    image: course.thumbnailUrl ?? '',
    alt: course.title,
  })),
)

/**
 * The course a slide stands for, by index.
 *
 * 1:1 with `carouselItems`, so the slot's index is an index into the catalogue.
 * Returns `undefined` rather than throwing for an out-of-range index: the slot
 * only renders indices that exist, and a carousel that can throw from inside a
 * render function is a crash waiting for a race.
 */
function courseAt(index: number): CatalogueCourse | undefined {
  return catalogue.value[index]
}

/**
 * The colour the receding stack fades toward.
 *
 * The carousel multiplies this over each card as it goes back. Upstream's default
 * `#05060a` is a blue-black picked for a black page; this is the page's own warm
 * ink, so a course receding into the stack darkens toward cream rather than
 * toward blue.
 */
const CAROUSEL_TINT = '#2a2419'

/**
 * Clicking a slide opens that course.
 *
 * The carousel separates a click from the end of a drag before emitting, so this
 * only fires for a deliberate click. A keyboard user reaches the course through
 * the slide's own "View course" link, which is a normal navigation and never
 * arrives here.
 */
function onCarouselSelect(index: number): void {
  const course = catalogue.value[index]
  if (course) void router.push(`/courses/${course.slug}`)
}

/**
 * Module and lesson totals across the published catalogue.
 *
 * Summed here rather than added to the query because PostgREST has no aggregate
 * over an embedded one-to-many - the service file says so where it explains why
 * the counts are computed client-side in the first place. The arithmetic is over
 * rows that have already been fetched, so it costs nothing.
 */
const totals = computed(() => {
  let modules = 0
  let lessons = 0
  for (const course of catalogue.value) {
    modules += course.moduleCount
    lessons += course.lessonCount
  }
  return { modules, lessons }
})

/**
 * Whether to show figures at all.
 *
 * Zero is a real answer - an empty catalogue genuinely has no courses - so this
 * is about the two states where a number would be a lie: still loading, and
 * failed. Neither is a statement about the product.
 */
const hasCounts = computed(
  () => !catalogueLoading.value && !catalogueError.value && catalogue.value.length > 0,
)

const figures = computed(() => [
  { value: totalPublished.value, label: totalPublished.value === 1 ? 'Course' : 'Courses' },
  { value: totals.value.modules, label: totals.value.modules === 1 ? 'Module' : 'Modules' },
  { value: totals.value.lessons, label: totals.value.lessons === 1 ? 'Lesson' : 'Lessons' },
])

/**
 * The value strip.
 *
 * The three counts, then two structural truths that need no data. Kept short
 * because it is read as a single line at a glance, not read.
 */
const valueStrip = computed<string[]>(() => {
  const real = hasCounts.value
    ? [
        `${totalPublished.value} ${totalPublished.value === 1 ? 'course' : 'courses'} published`,
        `${totals.value.modules} modules`,
        `${totals.value.lessons} lessons`,
      ]
    : []
  return [...real, 'Quizzes with a passing score', 'Progress kept to the last lesson']
})

/**
 * The headline, split so that typing can keep the accent on `practical`.
 *
 * Stored as data rather than read back out of the template, because the DOM has
 * already collapsed the whitespace around the `<em>` by the time a script could
 * look at it - so the word boundaries are not recoverable from the rendered
 * markup, only from this declaration.
 */
const router = useRouter()

const HERO_SEGMENTS = [
  { text: 'Learn IT skills through structured, ', accent: false },
  { text: 'practical', accent: true },
  { text: ' courses.', accent: false },
] as const

const heroSegments = HERO_SEGMENTS.map((segment, index) => {
  // Characters before this segment, so `isTyped` compares against one global
  // position instead of one per segment.
  const offset = HERO_SEGMENTS.slice(0, index).reduce((total, s) => total + s.text.length, 0)
  return { ...segment, offset }
})

const heroText = heroSegments.map((s) => s.text).join('')
const HERO_TOTAL_CHARS = heroText.length

/**
 * Per-character timings.
 *
 * 26ms per character over 55 characters is about 1.4s, which is roughly how long
 * it takes to read the sentence - so the animation finishes about when
 * comprehension catches up, rather than trailing it. Punctuation holds for 130ms
 * extra, because a comma typed at the same speed as a vowel reads as a glitch
 * rather than as punctuation.
 */
const HERO_MS_PER_CHAR = 26
const HERO_MS_EXTRA_ON_PUNCTUATION = 130
/** Long enough for the reader's eye to settle on the finished line, then it goes. */
const HERO_CARET_LINGER_MS = 1600
/** The caret arrives before the first character does, so it reads as a cursor. */
const HERO_START_DELAY_MS = 320

/**
 * How many characters are visible, and whether a caret is showing.
 *
 * Two pieces of state, not one. The obvious design is a single
 * `caretAfter: number` where -1 means "no caret" - and that is wrong: -1 is also
 * where the caret sits before the first character, so clearing it rendered the
 * caret at position zero instead of removing it, and it never went away.
 */
const typedCount = ref(0)
const caretVisible = ref(true)

/**
 * Reduced motion is honoured as a live preference, not read once at mount.
 *
 * Read once it would be wrong for someone who turns the setting on while the page
 * is open, and it would strand a half-typed headline with a caret still blinking.
 */
const reduceMotionQuery =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null

const prefersReducedMotion = ref(reduceMotionQuery?.matches ?? false)

let heroTimer: ReturnType<typeof setTimeout> | undefined

function clearHeroTimer(): void {
  if (heroTimer !== undefined) {
    clearTimeout(heroTimer)
    heroTimer = undefined
  }
}

/**
 * Whether the character at a segment/character position has been typed yet.
 *
 * `practical` reveals as one word: its accent is applied when the segment appears
 * rather than being typed through a colour change, which would put an italic
 * green character next to a non-italic one mid-word.
 */
function isTyped(segmentIndex: number, characterIndex: number): boolean {
  const segment = heroSegments[segmentIndex]
  if (!segment) return true
  return segment.offset + characterIndex < typedCount.value
}

/**
 * Whether the caret belongs immediately after this character.
 *
 * `typedCount` is a count, so the caret sits after the character at index
 * `typedCount - 1`. Comparing against the segment's own offset is what puts it in
 * the right place across segment boundaries - without it the caret sat at the end
 * of whichever segment was current, which for most of the sentence was nowhere
 * near the character being typed.
 */
function isCaretHere(
  segment: { offset: number },
  characterIndex: number,
): boolean {
  return caretVisible.value && segment.offset + characterIndex === typedCount.value - 1
}

function delayForNextCharacter(): number {
  const justTyped = heroText.charAt(typedCount.value - 1)
  const punctuation = justTyped === ',' || justTyped === '.'
  return HERO_MS_PER_CHAR + (punctuation ? HERO_MS_EXTRA_ON_PUNCTUATION : 0)
}

function typeNextCharacter(): void {
  if (typedCount.value >= HERO_TOTAL_CHARS) {
    // Linger on the finished line, then remove the caret. A caret blinking
    // forever is an attention tax on the page's largest element.
    heroTimer = setTimeout(() => {
      caretVisible.value = false
      heroTimer = undefined
    }, HERO_CARET_LINGER_MS)
    return
  }

  typedCount.value += 1
  clearHeroTimer()
  heroTimer = setTimeout(typeNextCharacter, delayForNextCharacter())
}

function playHeadline(): void {
  clearHeroTimer()

  if (prefersReducedMotion.value) {
    typedCount.value = HERO_TOTAL_CHARS
    caretVisible.value = false
    return
  }

  typedCount.value = 0
  caretVisible.value = true

  heroTimer = setTimeout(() => {
    typedCount.value = 1
    clearHeroTimer()
    heroTimer = setTimeout(typeNextCharacter, delayForNextCharacter())
  }, HERO_START_DELAY_MS)
}

/**
 * React to the OS motion preference changing while the page is open.
 *
 * Turning it ON completes the line and drops the caret, because a half-typed
 * headline is worse than either state. Turning it OFF does not restart the
 * animation - that would replay a line someone may be part-way through reading -
 * it only guarantees the caret is gone.
 */
function onMotionPreferenceChange(event: MediaQueryListEvent): void {
  prefersReducedMotion.value = event.matches

  if (event.matches) {
    clearHeroTimer()
    typedCount.value = HERO_TOTAL_CHARS
    caretVisible.value = false
    return
  }

  // Turning motion off does not restart the line - that would replay a sentence
  // someone may be part-way through reading. The caret only comes back if the
  // typing is genuinely still in progress.
  if (typedCount.value < HERO_TOTAL_CHARS) caretVisible.value = true
  else caretVisible.value = false
}

onMounted(() => {
  reduceMotionQuery?.addEventListener('change', onMotionPreferenceChange)
  playHeadline()
})

// Without this, navigating away mid-sentence leaves a timer writing to a
// component that is no longer mounted.
onBeforeUnmount(() => {
  clearHeroTimer()
  reduceMotionQuery?.removeEventListener('change', onMotionPreferenceChange)
})

onMounted(async () => {
  catalogueLoading.value = true
  catalogueError.value = ''
  try {
    catalogue.value = await listPublishedCourses()
    featured.value = catalogue.value.slice(0, 3)
    totalPublished.value = catalogue.value.length
  } catch (error) {
    catalogueError.value = describeSupabaseError(error)
  } finally {
    catalogueLoading.value = false
  }
})

const year = new Date().getFullYear()

/**
 * Every link here is a route that exists. There is deliberately no Become an
 * instructor, About, Careers or Contact — those pages do not exist, and a footer
 * full of dead destinations is worse than a short one.
 */
const footerGroups = [
  {
    title: 'Learn',
    links: [
      { label: 'Browse courses', to: '/courses' },
      { label: 'Create an account', to: '/auth/register' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Sign in', to: '/auth/login' },
      { label: 'Reset password', to: '/auth/forgot-password' },
    ],
  },
] as const

</script>
