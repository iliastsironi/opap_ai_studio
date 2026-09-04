import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

// Lazy on purpose, same reasoning as the Firebase Admin SDK version this
// replaces: server.ts imports this module unconditionally at boot (it also
// serves everything else, not just the endpoints that need the service-role
// key), and reading a missing env var at *import* time would crash the
// whole app locally for anyone who hasn't set it up yet, not just these
// two-to-three endpoints. Only throw once something actually tries to use it.
function getClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. Find both in your Supabase ' +
      'project: Settings -> API. Set them locally in .env and in Vercel\'s project ' +
      'environment variables. The service-role key bypasses Row Level Security - never ' +
      'expose it to the client, only use it from server code like this file.'
    );
  }
  client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}

export function getSupabaseAdmin(): SupabaseClient {
  return getClient();
}
