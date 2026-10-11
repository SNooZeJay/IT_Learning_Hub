import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Button } from './Button.vue'

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-lp-ring focus-visible:ring-lp-ring/50 focus-visible:ring-3 aria-invalid:ring-lp-destructive/20 dark:aria-invalid:ring-lp-destructive/40 aria-invalid:border-lp-destructive",
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
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-xs': "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)
export type ButtonVariants = VariantProps<typeof buttonVariants>
