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
-- Idempotent: rows already carrying the new name are skipped, so re-running
-- does nothing. Reading code falls back to the old key, so a client deployed
-- either side of this migration keeps working and there is no required
-- ordering between the two.
--
-- Deliberately avoids the jsonb `?` operator. Several SQL clients - the
-- Supabase SQL editor among them - parse `?` as a bind-parameter placeholder
-- before Postgres ever sees it, so `WHERE custom_field_values ? 'key'` either
-- errors or silently matches nothing. jsonb_exists() is the same test with no
-- punctuation to misread.
--
-- trg_shift_immutability (0002_rls.sql) refuses any UPDATE to a SUBMITTED or
-- APPROVED shift unless auth_is_elevated(), and a SQL-editor session has no
-- auth.uid() so it never is. That lock is correct - those are closed financial
-- records - and this migration is the case it was not written for: a key rename
-- that changes no value anyone reported on. session_replication_role suppresses
-- it for this transaction only; SET LOCAL reverts on COMMIT or ROLLBACK, and it
-- needs no table ownership, unlike ALTER TABLE ... DISABLE TRIGGER.

BEGIN;

SET LOCAL session_replication_role = replica;

UPDATE shifts
   SET custom_field_values =
         (custom_field_values - 'total_reconciliation_count')
         || jsonb_build_object(
              'reconciliation_net_total',
              custom_field_values -> 'total_reconciliation_count'
            )
 WHERE jsonb_exists(custom_field_values, 'total_reconciliation_count');

COMMIT;

-- Verify. old_key must be 0; new_key is every shift that has ever been
-- reconciled. Run this on its own afterwards:
--
--   SELECT count(*) FILTER (WHERE jsonb_exists(custom_field_values, 'total_reconciliation_count')) AS old_key,
--          count(*) FILTER (WHERE jsonb_exists(custom_field_values, 'reconciliation_net_total'))   AS new_key
--     FROM shifts;
