import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * The one place `clsx` and `tailwind-merge` meet.
 *
 * Every shadcn-vue component imports `cn` from here, so this is the only module
 * that has to know how the two combine: `clsx` flattens the conditional forms
 * (arrays, objects, falsy values) and `twMerge` resolves Tailwind conflicts so
 * a caller's `class` attribute wins over the component's own defaults rather
 * than merely being concatenated after them.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
