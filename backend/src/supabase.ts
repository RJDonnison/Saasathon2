import { createClient } from '@supabase/supabase-js';
import './config.js'; // ensure .env is loaded before reading process.env

// Supabase (Postgres) is the app's only database. Uses the service-role key, so it must stay
// server-side. Throws at startup if not configured — the backend can't do anything without it.
const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(
    'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env (see .env.example). ' +
      'Both are in the Supabase dashboard under Project Settings -> API.',
  );
}

export const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Fail fast with an actionable message if the credentials are wrong or schema.sql was never run. */
export async function assertDatabaseReady(): Promise<void> {
  const { error } = await supabase.from('classrooms').select('id').limit(1);
  if (error) {
    throw new Error(
      `Cannot query Supabase table "classrooms": ${error.message}. ` +
        'Check SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, and run backend/schema.sql in the Supabase SQL editor.',
    );
  }
}
