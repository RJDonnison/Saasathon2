import { createClient } from '@supabase/supabase-js'

// Browser-side Supabase client for AUTH ONLY (Google sign-in + session). It uses the public
// publishable key. All data still goes through our backend's /api, never straight from the browser.
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set in the root .env (see .env.example), then restart the dev server.',
  )
}

export const supabase = createClient(url, key)
