-- What the day's earlier shifts already recorded against customers.
--
-- Customer charges carry through a day the way expenses do: the evening
-- reconciles against the morning's credits and returns as well as its own, so
-- it has to see them. It cannot read them directly - 0022 makes a closed
-- shift private to whoever worked it, and the transactions hang off those
-- shifts.
--
-- Returned as the raw rows, not a total, because the closing screen shows one
-- collapsed summary that opens into the individual entries on request. A
-- total alone would make «πατάς πάνω και βλέπεις την κάθε μία» impossible.
--
-- Nothing is ever deleted to start the next day clean. The next day is a
-- different date and shows none of these, while customer_credit_transactions
-- keeps every row - that table IS the debt history, and the balances on
-- `customers` are derived from it by trigger. Deleting a day's rows would
-- leave people owing money with nothing behind it.
CREATE OR REPLACE FUNCTION shift_day_customer_credits(p_shift_id UUID)
RETURNS TABLE (
  id            UUID,
  customer_id   UUID,
  customer_name TEXT,
  type          TEXT,
  amount        NUMERIC,
  shift_id      UUID,
  created_at    TIMESTAMPTZ,
  source        TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
-- The OUT parameters are called id, customer_id and shift_id, which are also
-- column names in the query below. PL/pgSQL resolves such a collision in
-- favour of the VARIABLE by default, and the planner then reports «column
-- reference "id" is ambiguous» rather than quietly doing the wrong thing.
-- This says the column wins, which is what every reference here means.
#variable_conflict use_column
DECLARE
  v_shift shifts%ROWTYPE;
  v_day DATE;
BEGIN
  SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id;
  IF NOT FOUND OR v_shift.organization_id IS DISTINCT FROM auth_org_id() THEN
    RAISE EXCEPTION 'Η βάρδια δεν βρέθηκε' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (auth_is_elevated() OR auth_worked_shift(p_shift_id)) THEN
    RAISE EXCEPTION 'Δεν έχετε πρόσβαση σε αυτή τη βάρδια' USING ERRCODE = '42501';
  END IF;

  v_day := (v_shift.opened_at AT TIME ZONE 'Europe/Athens')::date;

  RETURN QUERY
    SELECT t.id,
           t.customer_id,
           -- The snapshot first: it is the name as it stood when the credit
           -- was given, which is what a later reader needs. `customers.name`
           -- is the fallback, and it is `name` - not `full_name`, which this
           -- function tried first and which does not exist.
           COALESCE(NULLIF(TRIM(t.customer_name_snapshot), ''), c.name, 'Πελάτης'),
           t.type,
           t.amount,
           t.shift_id,
           t.created_at,
           t.source
      FROM customer_credit_transactions t
      LEFT JOIN customers c ON c.id = t.customer_id
      LEFT JOIN shifts s ON s.id = t.shift_id
     WHERE t.organization_id = v_shift.organization_id
       AND t.store_id = v_shift.store_id
       -- Tied to another shift of the same day, or untied and entered that
       -- day. A LEFT JOIN on purpose: shift_id is nullable since 0005, and
       -- an inner one would silently drop every credit taken outside a shift.
       AND (
         -- Tied to an EARLIER shift of the same day. «Same day» alone is not
         -- enough: without the time comparison the day's FIRST shift saw the
         -- evening's entries, which had not happened yet from where it sits.
         (s.id IS NOT NULL
           AND (s.opened_at AT TIME ZONE 'Europe/Athens')::date = v_day
           AND s.opened_at < v_shift.opened_at)
         -- Or untied and entered before this shift started.
         OR (t.shift_id IS NULL
           AND (t.created_at AT TIME ZONE 'Europe/Athens')::date = v_day
           AND t.created_at < v_shift.opened_at)
       )
       -- This shift's own are already on screen and editable; only what came
       -- before belongs in the carried-over summary.
       AND t.shift_id IS DISTINCT FROM p_shift_id
     ORDER BY t.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION shift_day_customer_credits(UUID) TO authenticated;

-- Verify. The day's first shift returns nothing; a later one returns what
-- came before it:
--
--   SELECT customer_name, type, amount FROM shift_day_customer_credits('<shift>');
