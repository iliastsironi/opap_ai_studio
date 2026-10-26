-- Προς ποια κατεύθυνση κινείται το χρηματοκιβώτιο.
--
-- In an agency the safe takes money IN: the drawer gets heavy, somebody
-- drops cash into the safe mid-shift, and the reconciliation adds it back -
-- it left the till but it is not missing.
--
-- A PLAY hall runs the other way. The machines pay out more than they take,
-- so cash comes OUT of the safe and into the drawer to pay customers. That
-- is the shop's own capital walking in, not something the till earned, and
-- adding it back the agency's way credits the hall with money it never made:
-- the till reads over by exactly what was fetched, every single time.
--
-- One setting, one sign. The list, the amounts, the notes and the times are
-- identical in both directions - only what the reconciliation does with the
-- total changes.
--
-- DROP is the default, so every existing store keeps the arithmetic it has.
-- A PLAY store seeded from here on starts on WITHDRAW, because its type
-- already says which kind of shop it is (lib/storeTypeDefaults.ts).

ALTER TABLE shift_templates
  ADD COLUMN IF NOT EXISTS safe_direction TEXT NOT NULL DEFAULT 'DROP'
    CHECK (safe_direction IN ('DROP', 'WITHDRAW'));

COMMENT ON COLUMN shift_templates.safe_direction IS
  'DROP = μετρητά μπαίνουν στο χρηματοκιβώτιο (πρακτορείο). WITHDRAW = βγαίνουν για πληρωμές πελατών (PLAY).';

-- Verify.
--
--   SELECT store_id, safe_direction FROM shift_templates;
--     -> DROP everywhere, until an Owner changes one or a PLAY store is seeded.
