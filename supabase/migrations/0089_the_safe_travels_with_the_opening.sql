-- Το χρηματοκιβώτιο ταξιδεύει με το άνοιγμα.
--
-- Οι δεσμίδες του χρηματοκιβωτίου μετράνε ως μετρητά της βάρδιας (counted_cash
-- = συρτάρι + δεσμίδες). Για να μη βγαίνει κάθε μέρα πλεόνασμα ίσο με όσα έχει
-- μέσα, το άνοιγμα της επόμενης πρέπει να τα περιέχει: «έχεις κέρματα τόσα,
-- χαρτονομίσματα τόσα και χρηματοκιβώτιο τόσο». Και τα τρία, χωριστά.
--
-- Δύο συναρτήσεις το χρειάζονται, και οι δύο γιατί από το 0022 μια κλεισμένη
-- βάρδια ανήκει σε όποιον τη δούλεψε - ο υπάλληλος του πρωινού δεν μπορεί να
-- διαβάσει τη βραδινή απευθείας:
--
--   shift_handover_snapshot  + safe_count    τι μέτρησε το βράδυ στο χρηματοκιβώτιο
--   shift_day_opening        + opening_safe  με τι άνοιξε η μέρα (για τις επόμενες βάρδιες)
--
-- Δεν αλλάζει κανένα σχήμα πίνακα: και τα δύο διαβάζονται από το
-- custom_field_values της βάρδιας (safe_count, opening_safe).
--
-- DROP και ξανά CREATE, γιατί η CREATE OR REPLACE δεν αφήνει να αλλάξει η λίστα
-- των στηλών που επιστρέφει. Ίδιος ορισμός με το 0038 και το 0069, και οι δύο
-- μόνο με μία στήλη παραπάνω.

-- ------------------------------------------------------------------
-- 1. Τι άφησε η προηγούμενη βάρδια
-- ------------------------------------------------------------------
DROP FUNCTION IF EXISTS shift_handover_snapshot(TEXT, TEXT, TIMESTAMPTZ);

CREATE FUNCTION shift_handover_snapshot(
  p_store_id TEXT,
  p_register_id TEXT DEFAULT 'Ταμείο 1',
  p_before TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  previous_operator_name TEXT,
  ended_at               TIMESTAMPTZ,
  counted_cash           NUMERIC,
  counted_denominations  JSONB,
  opening_cash           NUMERIC,
  opening_cash_notes     NUMERIC,
  opening_cash_coins     NUMERIC,
  scratch_ticket_items   JSONB,
  shift_id               UUID,
  shift_status           TEXT,
  inspection_status      TEXT,
  opened_by_user_id      UUID,
  safe_count             JSONB
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.opened_by_user_name,
         COALESCE(s.closed_at, s.opened_at),
         s.counted_cash,
         s.counted_denominations,
         s.opening_cash,
         s.opening_cash_notes,
         s.opening_cash_coins,
         s.custom_field_values -> 'scratch_ticket_items',
         s.id,
         s.status,
         s.inspection_status,
         s.opened_by_user_id,
         s.custom_field_values -> 'safe_count'
    FROM shifts s
   WHERE s.organization_id = auth_org_id()
     AND s.store_id = p_store_id
     AND s.register_id = p_register_id
     AND s.status IN ('SUBMITTED', 'APPROVED', 'DRAFT_CLOSING', 'OPEN')
     AND (p_before IS NULL OR s.opened_at <= p_before)
   ORDER BY s.opened_at DESC
   LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION shift_handover_snapshot(TEXT, TEXT, TIMESTAMPTZ) TO authenticated;

-- ------------------------------------------------------------------
-- 2. Με τι άνοιξε η μέρα
-- ------------------------------------------------------------------
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
  shift_types_today     TEXT[],
  opening_safe          NUMERIC
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
           WHERE shift_type IS NOT NULL),
         COALESCE((d.custom_field_values ->> 'opening_safe')::NUMERIC, 0)
    FROM day_shifts d
   ORDER BY d.opened_at ASC
   LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION shift_day_opening(TEXT, TEXT, DATE) TO authenticated;

-- Verify. Και οι δύο πρέπει να επιστρέψουν τη νέα τελευταία στήλη (null/0 όσο καμία
-- βάρδια δεν έχει καταμετρήσει χρηματοκιβώτιο):
--
--   SELECT safe_count FROM shift_handover_snapshot('store_101498', 'Ταμείο 1', NULL);
--   SELECT opening_safe FROM shift_day_opening('store_101498', 'Ταμείο 1', NULL);
