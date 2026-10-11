import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Button } from './Button.vue'

/*
  The public surface's button.

  shadcn's defaults are all wrong for this project, and not in a way that shows
  up until you put them on a page:

  Its `default` is a GREEN rounded-rectangle. Nothing on the public surface is
  green. The landing hero, the header, the auth forms and every closing CTA use
  the same INK PILL - `bg-lp-ink`, `rounded-full`, 48px tall - and that is the
  design that was reviewed and kept. Shipping shadcn's default would have
  repainted every call to action on the product in a colour and a shape nobody
  chose, which is the same class of mistake as the reverted hero redesign.

  So the variants below are transcribed from the CTAs already on these pages,
  not from the registry. `--primary` and friends stay bridged and available for
  components that genuinely want the accent - a selected filter chip, a focus
  ring - but the primary ACTION is ink.

  Every variant clears the project's 44px touch-target floor. shadcn's own ramp
  ran `h-6` to `h-10`, so none of it was usable here.
*/
export const buttonVariants = cva(
  "lp-press inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 outline-none focus-visible:ring-lp-ring/50 focus-visible:ring-3",
  {
    variants: {
      variant: {
        /*
          The primary action. Ink fill, paper-coloured label, one easing curve
          shared by every CTA on the public surface.
        */
        default:
          'h-12 bg-lp-ink px-7 text-lp-ink-inverse shadow-lp-button transition-opacity duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:opacity-90',

        /*
          The secondary action beside it. A hairline on the card surface, not a
          grey - a grey outline next to an ink pill reads as a disabled button.
        */
        outline:
          'h-12 border border-lp-line-strong bg-lp-card px-7 text-lp-ink transition-[background-color,border-color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-lp-canvas',

        /* For controls on the card surface: hover only, no resting fill. */
        ghost:
          'h-12 px-4 text-lp-ink transition-colors duration-200 hover:bg-lp-canvas-deep motion-reduce:transition-none',

        /*
          The one action on a dark band, which is the closing CTA and the
          carousel's dark slide.

          It has to be light-on-dark or it disappears into the band. The closing
          CTA previously said `bg-gray-200 text-gray-950`, two TailAdmin greys
          left over on a page that had otherwise moved to the `lp-` palette;
          `bg-lp-card text-lp-ink` is the same reading expressed in the tokens
          the rest of the page uses, so it tracks the theme instead of ignoring
          it.
        */
        inverse:
          'h-12 bg-lp-card px-7 text-lp-ink transition-opacity duration-200 hover:opacity-90 motion-reduce:transition-none',

        /* Text-only, for a third action that does not deserve a box. */
        link: 'h-auto px-0 text-lp-accent underline-offset-4 hover:underline',

        destructive:
          'h-12 bg-lp-destructive px-7 text-white transition-opacity duration-200 hover:opacity-90 motion-reduce:transition-none',
      },
      size: {
        /* 48px is the height these pages already used; the floor is 44. */
        default: 'h-12 px-7',
        sm: 'h-11 gap-1.5 px-5',
        lg: 'h-12 px-8 text-base',
        icon: 'size-12',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export type ButtonVariants = VariantProps<typeof buttonVariants>
