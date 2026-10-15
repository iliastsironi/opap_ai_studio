-- Deactivating a user actually removes their access.
--
-- Χρήστες & Αναθέσεις has offered «Απενεργοποιημένος» since the beginning and
-- it has never done anything. Two independent reasons:
--
--   1. The client wrote `is_active`, a column that does not exist on `users`
--      (the column is `status`), so the update failed with 42703 every time.
--   2. Even stored correctly, nothing read it. auth_org_id() and
--      auth_role_code() look the row up by id and return whatever is there,
--      so every policy in the database kept treating the account as a member
--      in good standing.
--
-- So the only way to stop someone signing in was to delete the account - in an
-- app that charges employees for till shortages and keeps an audit trail
-- naming them. Deleting the account is the one thing you must not do to
-- someone whose records you may need to defend.
--
-- Both functions now return NULL unless the row is ACTIVE. belongs_to_org()
-- and auth_is_elevated() are built on them, so a deactivated account fails
-- every policy at once rather than each table having to remember.
--
-- A deactivated user can still read their own `users` row - users_select
-- allows `id = auth.uid()` directly - which is what lets the app tell them
-- something more useful than an empty screen.

CREATE OR REPLACE FUNCTION auth_org_id() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM public.users
   WHERE id = auth.uid() AND COALESCE(status, 'ACTIVE') = 'ACTIVE';
$$;

CREATE OR REPLACE FUNCTION auth_role_code() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role_code FROM public.users
   WHERE id = auth.uid() AND COALESCE(status, 'ACTIVE') = 'ACTIVE';
$$;

-- COALESCE on purpose: status is NOT NULL today, but a row written by some
-- future path without it should be treated as active rather than silently
-- locked out of everything.

-- Verify. The first must list every account and its status; the second is the
-- real test and has to be run as a deactivated user, not here:
--
--   SELECT email, status FROM users ORDER BY status, email;
--   SELECT count(*) FROM shifts;   -- 0 for a deactivated account
