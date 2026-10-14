-- Let an Owner create an account for staff who have no email address.
--
-- UAT asked whether the vendor should create usernames and passwords and send
-- them out. No. api/_lib/usersInviteHandler.ts already creates the auth user
-- with a random placeholder password that is never handed to anyone, generates
-- a Supabase invite link, and emails it - the invitee sets their own password
-- and nobody else ever sees it. That stays the default.
--
-- Routing credentials through the vendor would mean the vendor had possessed
-- the credentials of the very people this app charges for till shortages. It
-- would weaken every audit entry and every charge the system raises.
--
-- The real gap is narrower: users.email is NOT NULL UNIQUE, and shop staff
-- often have no address. So the Owner - not the vendor - generates a one-time
-- credential, hands it over in person, and the employee must replace it on
-- first sign-in.

-- Set when an account was created with a generated password. Cleared only by
-- the user changing that password themselves.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- Marks an address at @staff.shiftledger.local: a login handle, not a mailbox.
-- Nothing is ever sent to it, and the UI must not offer to.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS has_placeholder_email BOOLEAN NOT NULL DEFAULT FALSE;

-- The generated password is returned once in the API response and shown once
-- on the Owner's screen. It is deliberately NOT stored here, not in
-- audit_logs, and not logged anywhere.

-- Verify:
--   SELECT count(*) FILTER (WHERE must_change_password) AS pending,
--          count(*) FILTER (WHERE has_placeholder_email) AS no_email
--     FROM users;
