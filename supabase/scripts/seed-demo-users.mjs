// Creates the 3 demo Supabase Auth accounts the login screen's one-click
// buttons expect (owner@/manager@/employee@shiftledger.gr, password123).
// Idempotent - safe to re-run, skips any account that already exists.
// AuthContext's own syncUserProfile self-provisions each account's users/
// organizations rows on first real login, so this script only needs to
// create the raw Auth identities - nothing else to seed by hand.
// Needs real credentials in .env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
// Run manually: node supabase/scripts/seed-demo-users.mjs
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_ACCOUNTS = [
  { email: 'owner@shiftledger.gr', first_name: 'Ιδιοκτήτης', last_name: 'Demo' },
  { email: 'manager@shiftledger.gr', first_name: 'Διευθυντής', last_name: 'Demo' },
  { email: 'employee@shiftledger.gr', first_name: 'Υπάλληλος', last_name: 'Demo' },
];
const DEMO_PASSWORD = 'password123';

for (const acc of DEMO_ACCOUNTS) {
  const { data: existingPage, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) {
    console.log(`FAIL  list users:`, JSON.stringify(listError, null, 2));
    process.exit(1);
  }
  const existing = existingPage.users.find((u) => u.email === acc.email);
  if (existing) {
    console.log(`SKIP  ${acc.email} already exists (${existing.id})`);
    continue;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: acc.email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: acc.first_name, last_name: acc.last_name },
  });
  if (error) {
    console.log(`FAIL  ${acc.email}:`, JSON.stringify(error, null, 2));
  } else {
    console.log(`OK    ${acc.email} created (${data.user.id})`);
  }
}
