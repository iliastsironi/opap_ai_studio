-- Who may put money in the safe during a shift.
--
-- The safe drop existed as a number on the shift (bank_deposits / safe_drop)
-- and nothing in the app ever set it: setBankDeposits was declared in the
-- closing wizard and never called from anywhere, so the figure could only be
-- whatever an import had written. One shift carries 4.000 from the August
-- import; every other shift reads 0 because there was no way to enter one.
--
-- It becomes a list of deposits recorded as they happen, each with its own
-- amount, note and time, summed into the existing column - so the money
-- leaves the drawer and still counts as cash the shift took, which is what
-- the reconciliation already does with bank_deposits.
--
-- This column decides whether an employee may record one, or only the Owner,
-- exactly like topup_employee_allowed from 0030. Default is the strict
-- reading; a store opens it up in «Διαμόρφωση».

ALTER TABLE shift_templates
  ADD COLUMN IF NOT EXISTS safedrop_employee_allowed BOOLEAN NOT NULL DEFAULT FALSE;

-- Verify:
--
--   SELECT topup_employee_allowed, safedrop_employee_allowed FROM shift_templates;
--   -- and on a project with no template rows yet, simply that it selects.
