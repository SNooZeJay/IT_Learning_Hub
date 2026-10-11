import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Button } from './Button.vue'

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-lp-ring focus-visible:ring-lp-ring/50 focus-visible:ring-3 aria-invalid:ring-lp-destructive/20 dark:aria-invalid:ring-lp-destructive/40 aria-invalid:border-lp-destructive",
  {
    variants: {
      variant: {
        default: 'bg-lp-primary text-lp-primary-foreground hover:bg-lp-primary/90',
        destructive:
          'bg-lp-destructive text-white hover:bg-lp-destructive/90 focus-visible:ring-lp-destructive/20 dark:focus-visible:ring-lp-destructive/40 dark:bg-lp-destructive/60',
        outline:
          'border bg-lp-background shadow-xs hover:bg-lp-accent hover:text-lp-accent-foreground dark:bg-lp-input/30 dark:border-lp-input dark:hover:bg-lp-input/50',
        secondary: 'bg-lp-secondary text-lp-secondary-foreground hover:bg-lp-secondary/80',
        ghost: 'hover:bg-lp-accent hover:text-lp-accent-foreground dark:hover:bg-lp-accent/50',
        link: 'text-lp-primary underline-offset-4 hover:underline',
      },
      /*
        Every variant clears the project's 44px touch-target floor.

        shadcn's own ramp runs `h-6` to `h-10` - 24px to 40px - so all eight of
        its sizes are unusable here and were replaced rather than nudged.
        `touch-targets.spec.ts` already holds the app to `size-11`/`min-h-11` and
        DESIGN.md fixes nav rows at 44px, so a button smaller than that would be
        a regression on the public pages and an inconsistency against the app
        behind the sign-in link.

        The ramp is also shortened from eight sizes to four. The deleted ones
        were `xs`, `icon-xs`, `icon-sm` and `icon-lg` - a density scale for rows
        of small controls, which the public pages do not have. A size ramp that
        mostly offers values the project forbids is worse than no ramp.

        What distinguishes the remaining four is padding and type size, not
        height: every one of them is 44px tall.
      */
      size: {
        default: 'h-11 px-5 has-[>svg]:px-4',
        sm: 'h-11 gap-1.5 rounded-md px-4 text-sm has-[>svg]:px-3.5',
        lg: 'h-11 rounded-md px-7 text-base has-[>svg]:px-6',
        icon: 'size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)
export type ButtonVariants = VariantProps<typeof buttonVariants>
