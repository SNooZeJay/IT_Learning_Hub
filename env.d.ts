/// <reference types="vite/client" />

/**
 * Typed environment variables.
 *
 * Declaring these makes a missing or misspelled variable a compile error instead
 * of a runtime `undefined`. The PayMongo secret key is deliberately absent: it is
 * a `VITE_`-prefixed variable would be published to the browser, so it is held as
 * a Supabase secret and read only inside an Edge Function.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
