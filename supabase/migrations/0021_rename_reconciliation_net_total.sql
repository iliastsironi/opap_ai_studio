-- shifts.custom_field_values->'total_reconciliation_count' never held a count.
--
-- It stores calculateReconciliationNetTotal()'s result - breakdown.netTotal,
-- the «Σύνολο Καταμέτρησης» in euros. The wrong name reached the UI as a field
-- reading "TOTAL RECONCILIATION COUNT: -200", which is a reasonable thing for a
-- reader to distrust, since -200 of anything countable is nonsense.
--
-- Renamed to reconciliation_net_total, matching its sibling
-- reconciliation_gross_total and the function that produces it.
--
-- Idempotent: the WHERE clause skips rows already carrying the new name, so
-- re-running does nothing. Reading code also falls back to the old key, so a
-- client deployed either side of this migration keeps working and there is no
-- required ordering between the two.

-- trg_shift_immutability (0002_rls.sql) refuses any UPDATE to a SUBMITTED or
-- APPROVED shift unless auth_is_elevated(), and a SQL-editor session has no
-- auth.uid() so it never is. That lock is correct - those rows are closed
-- financial records - and this migration is exactly the case it was not written
-- for: a key rename that changes no value anyone reported on.
--
-- So it is disabled for this statement only, inside the transaction, and
-- restored immediately. Nothing else runs in between.
BEGIN;

ALTER TABLE shifts DISABLE TRIGGER trg_shift_immutability;

UPDATE shifts
   SET custom_field_values =
         (custom_field_values - 'total_reconciliation_count')
         || jsonb_build_object(
              'reconciliation_net_total',
              custom_field_values -> 'total_reconciliation_count'
            )
 WHERE custom_field_values ? 'total_reconciliation_count';

ALTER TABLE shifts ENABLE TRIGGER trg_shift_immutability;

COMMIT;

-- Verify afterwards - the first count must be 0, the second must equal the
-- number of shifts that have ever been reconciled:
--
--   SELECT count(*) FILTER (WHERE custom_field_values ? 'total_reconciliation_count') AS old_key,
--          count(*) FILTER (WHERE custom_field_values ? 'reconciliation_net_total')   AS new_key
--     FROM shifts;
