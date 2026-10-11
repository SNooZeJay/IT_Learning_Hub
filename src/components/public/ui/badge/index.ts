import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Badge } from './Badge.vue'

export const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-lp-ring focus-visible:ring-lp-ring/50 focus-visible:ring-3 aria-invalid:ring-lp-destructive/20 dark:aria-invalid:ring-lp-destructive/40 aria-invalid:border-lp-destructive transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-lp-primary text-lp-primary-foreground [a&]:hover:bg-lp-primary/90',
        secondary:
          'border-transparent bg-lp-secondary text-lp-secondary-foreground [a&]:hover:bg-lp-secondary/90',
        destructive:
          'border-transparent bg-lp-destructive text-white [a&]:hover:bg-lp-destructive/90 focus-visible:ring-lp-destructive/20 dark:focus-visible:ring-lp-destructive/40 dark:bg-lp-destructive/60',
        outline: 'text-lp-foreground [a&]:hover:bg-lp-accent [a&]:hover:text-lp-accent-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)
export type BadgeVariants = VariantProps<typeof badgeVariants>
