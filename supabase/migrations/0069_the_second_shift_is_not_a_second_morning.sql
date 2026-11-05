-- Η δεύτερη βάρδια της ημέρας δεν είναι δεύτερη πρωινή.
--
-- Η οθόνη ανοίγματος ξεκινά στο «Πρωινή» και μένει εκεί αν δεν το αλλάξει
-- κανείς. Στην παράδοση το ξεχνούν, οπότε η μέρα γράφει δύο πρωινές - και
-- τότε κάθε αναφορά που ομαδοποιεί ανά βάρδια (fn_shift_type_kpis,
-- v_daily_register_summary, η καρτέλα ημέρας) δείχνει μια πρωινή με
-- διπλάσιο τζίρο και μια βραδινή που δεν υπάρχει. Το λάθος δεν χαλάει
-- κανένα σύνολο, γι' αυτό περνάει απαρατήρητο: χαλάει μόνο το ΠΟΙΑΣ.
--
-- Για να προτείνει η οθόνη τη σωστή, πρέπει να ξέρει ποιες έχει ήδη η μέρα.
-- Δεν μπορεί να τις διαβάσει μόνη της: από το 0022 μια κλεισμένη βάρδια
-- ανήκει σε όποιον τη δούλεψε, και στις 15:00 η πρωινή είναι άλλου. Γι'
-- αυτό μπαίνει εδώ, στη SECURITY DEFINER που απαντά ήδη «πού ξεκίνησε η
-- μέρα» - το ίδιο ερώτημα, ένα ταξίδι.
--
-- Πίνακας και όχι πλήθος: «δύο βάρδιες» δεν λέει ΠΟΙΕΣ δύο, και μια έκτακτη
-- βάρδια δεν πιάνει τη θέση της πρωινής. Ο ίδιος ο κανόνας ζει στο
-- lib/shiftTypeOptions.ts (nextShiftType) - εδώ απαντιέται μόνο το γεγονός,
-- όχι τι σημαίνει.
--
-- Χωρίς φίλτρο κατάστασης, όπως και τα άλλα αθροίσματα εδώ: μια ανοιχτή
-- πρωινή έχει πιάσει τη θέση της πρωινής ακριβώς όσο και μια εγκεκριμένη.

DROP FUNCTION IF EXISTS shift_day_opening(TEXT, TEXT, DATE);

CREATE FUNCTION shift_day_opening(
  p_store_id TEXT,
  p_register_id TEXT DEFAULT 'Ταμείο 1',
  p_day DATE DEFAULT NULL
)
RETURNS TABLE (
  opened_at             TIMESTAMPTZ,
  opened_by_user_name   TEXT,
  opening_cash          NUMERIC,
  opening_cash_notes    NUMERIC,
  opening_cash_coins    NUMERIC,
  scratch_ticket_items  JSONB,
  scratch_gross_today   NUMERIC,
  scratch_payouts_today NUMERIC,
  topups_today          NUMERIC,
  shift_types_today     TEXT[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH day_shifts AS (
    SELECT s.*
      FROM shifts s
     WHERE s.organization_id = auth_org_id()
       AND s.store_id = p_store_id
       AND s.register_id = p_register_id
       AND (s.opened_at AT TIME ZONE 'Europe/Athens')::date
           = COALESCE(p_day, (now() AT TIME ZONE 'Europe/Athens')::date)
  )
  SELECT d.opened_at,
         d.opened_by_user_name,
         d.opening_cash,
         d.opening_cash_notes,
         d.opening_cash_coins,
         d.custom_field_values -> 'scratch_ticket_items',
         (SELECT COALESCE(SUM(scratch_gross_sales), 0) FROM day_shifts),
         (SELECT COALESCE(SUM(scratch_payouts), 0) FROM day_shifts),
         (SELECT COALESCE(SUM(
                   COALESCE((custom_field_values ->> 'opening_topup_1')::NUMERIC, 0)
                 + COALESCE((custom_field_values ->> 'opening_topup_2')::NUMERIC, 0)
                 ), 0)
            FROM day_shifts),
         (SELECT COALESCE(ARRAY_AGG(shift_type ORDER BY opened_at), ARRAY[]::TEXT[])
            FROM day_shifts
           WHERE shift_type IS NOT NULL)
    FROM day_shifts d
   ORDER BY d.opened_at ASC
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION shift_day_opening(TEXT, TEXT, DATE) TO authenticated;

-- Verify. Μια μέρα με πρωινή και βραδινή πρέπει να απαντήσει
-- {MORNING,NIGHT} - και αν απαντήσει {MORNING,MORNING}, αυτό είναι ακριβώς
-- το λάθος που διορθώνει η οθόνη από εδώ και πέρα:
--
--   SELECT shift_types_today, topups_today
--     FROM shift_day_opening('store_101498', 'Ταμείο 1', '2026-09-01');
