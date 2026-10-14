-- Connect a payroll row to the account whose till it was.
--
-- payroll_records identifies a person by free-text `name`; employee_charges
-- (0018) identifies them by `employee_user_id`. The two have never met, so the
-- payroll sheet cannot say what someone owes from till shortages - which is
-- what UAT asked for.
--
-- Nullable on purpose. A payroll row for someone with no login - a relative
-- helping out, someone who has left - is still a valid row, and forcing a link
-- would make the column a lie rather than a fact.
--
-- The link is chosen explicitly in the UI, never matched on name: «Γιώργος
-- Χριστοδούλου» and «ΧΡΙΣΤΟΔΟΥΛΟΥ ΓΕΩΡΓΙΟΣ» are the same person to a human and
-- not to a string comparison, and a silent non-match would show €0 owed, which
-- is the one wrong answer that looks like a right one.
ALTER TABLE payroll_records
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_payroll_user
  ON payroll_records (user_id) WHERE user_id IS NOT NULL;

-- Verify:
--   SELECT count(*) FILTER (WHERE user_id IS NOT NULL) AS linked, count(*) AS total FROM payroll_records;
